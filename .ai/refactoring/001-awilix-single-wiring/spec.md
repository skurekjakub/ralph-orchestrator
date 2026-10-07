Unknowns pass: skipped by the person. The owner delegated the refactor ("i trust you with the awilix, feel free to commit it when done").

# Spec: one awilix wiring style, checked at compile time

## Intent

There are three defects, each named by what it costs someone editing this code.

1. **The wiring is checked at runtime, not at compile time.**
   - `createCradle` registers `asClass(X)` with no link between `X`'s constructor deps and `OrchestratorCradle`, and `container.register(...)` is not checked against the declared cradle (`awilix/lib/container.d.ts:56`).
   - A renamed constructor key, a missing registration or a mistyped token compiles and throws `AwilixResolutionError` only when resolved. With PROXY injection that happens whether or not `strict` is on.
   - For root services it throws at startup (`index.tsx:14`). For the per-task objects built by hand it throws on the first task.
2. **There are two wiring styles.** Next to the cradle, objects are hand-built:
   - `buildContainerFactory` news 8 classes per task (`src/awilix-cradle.ts:63-119`);
   - `CliExecutorFactory` news 4 executors;
   - the JIRA factory news `JiraClient`, `JiraConnector` and `JiraWorkItemPoller`;
   - `index.tsx` news `Orchestrator` and `DashboardServer`;
   - 7 `asFunction` registrations hand-`new` their class to pass a value the cradle doesn't hold.

   Adding a dependency to `ContainerManager` means editing `buildContainerFactory` by hand, and no test catches a missing wire, because tests construct classes directly.
3. **Some classes are really functions.** `ComposeFileResolver`, `LogSourceRegistry`, `AgentCatalogProvider`, `JitMcpConfigWriter`, `SkillTemplateRenderer`, the two agent writers and the two VCS provider clients hold no state beyond a fixed root dir or constants. Some are newed per task to call one method; others are injected and mocked as if they were services.

## What is actually there

Source: `inventory.md` (61 classes at `81a8980`). The plan re-derives §4 and §5 at the branch base (see Verification). `src/` constructors did not change between `81a8980` and `e7b8dc4`; the docs and tests did.

| Kind | Classes | Destination |
|---|---|---|
| **Root service, already `asClass`** | ActivityLog, IssueManager, TaskResourceManager, OperationLedger, ProfileRouter, TriggerScanner, LogCollector, PromptBuilder, AgentTemplateRenderer, ComposeOverlayWriter, ProfileSetupService, AgentPipelineExecutor, RunArtifactsDeriver, TaskResultWriter, PostTaskHookRunner, TaskRunner | `service(...).singleton()` |
| **Root service, hand-`new` in `asFunction` today** | VcsSourceClient, StageWorkspaceResolver, TaskWorkspaceManager, HookRulesRedactor | `service(...).singleton()` against cradle tokens (`rootDir`, `sourceReposDir`, `vcsProviderClients`) |
| **Root service, conditional** | HeartbeatSender (`null` unless the dashboard is enabled) | stays `factory(...)`; the one `factory` that news a service, because awilix has no conditional registration |
| **Root service, not registered today** | Orchestrator, DashboardServer, ContinuationRunner, AgentSessionRunner | `service(...).singleton()` |
| **Per-task service** | ContainerManager, ComposeClient, ContainerLogCollector, ContainerWorkspaceCleaner | `.scoped()`, resolved in a task scope |
| **Per-stage service** | ClaudeCodeExecutor, CopilotExecutor, LocalClaudeCodeExecutor, LocalCopilotExecutor | `.scoped()`, resolved in a stage scope of their own kind (§4) |
| **Per-data-source service** | JiraClient, JiraConnector, JiraWorkItemPoller | `.scoped()`, resolved in a data-source scope (§5) |
| **Stateless → module functions** | ComposeFileResolver, LogSourceRegistry, AgentCatalogProvider, JitMcpConfigWriter, SkillTemplateRenderer | §6 |
| **Stateless strategy → module objects** | ClaudeAgentWriter, CopilotAgentWriter, AdoVcsSourceProviderClient, GitHubVcsSourceProviderClient | module-level objects implementing the existing interface (method shorthand, since `CopilotAgentWriter.write` calls `this.modelOf`) |
| **Strategy values built by a module function** | ClaudeCodeRuntime, CopilotRuntime, CliRuntimeRegistry | unchanged (§7) |
| **Factory class removed** | CliExecutorFactory | its logic moves to `src/container/stage-executor-factory.ts` (§4) |
| **Value / state holder** (keeps `new`, owned by its creator) | StreamCapture, PlainTextDecoder, ClaudeStreamJsonDecoder, ClaudeSessionIds, AgentCatalog, JiraIssueParser | unchanged |
| **Owned component** (keeps `new`) | OrchestratorObserver: its constructor takes a closure over `Orchestrator`'s private loop state (`orchestrator.ts:127`) | unchanged |
| **Error / framework subclass** | AgentDefinitionError, FrontmatterError, SectionTag (Liquid constructs it) | unchanged |
| **Bootstrap** | AppStartup (runs before config exists) | unchanged |
| **Dead in production** | JiraFieldExtractor (no `src/` importer) | untouched; `todo.md` (with JiraIssueParser) |

- **HookRulesRedactor stays a service.** It spawns `perl`: an external process behind `ITextRedactor`. Its deps become `{ rootDir }`; `env` stays an optional second positional parameter for tests.
- **StageWorkspaceResolver stays a service.** It depends on `cliRuntimes`.

## Design

### 1. Compile-time-checked registration (`src/di/registration.ts`, new)

Verified by prototype against awilix 13.0.5 (`.cache/claude-scratch/awilix/proto/proto2.ts`).

```ts
type Expand<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;
/** Keys of deps object D that cradle C lacks (optional keys included) or provides with an incompatible type. */
type Unsatisfied<C, D> = Expand<{ [K in keyof D as K extends keyof C ? (C[K] extends D[K] ? never : K) : K]-?: D[K] }>;
type DepsOf<F> = F extends new (deps: infer D, ...rest: never[]) => unknown ? D : never;
type CradleProvides<C, F> = [keyof Unsatisfied<C, DepsOf<F>>] extends [never]
  ? unknown
  : { "deps the cradle does not provide": Unsatisfied<C, DepsOf<F>> };

export function wiring<C extends object>() {
  return {
    /** asClass for a constructor whose deps object cradle C provides in full. */
    service<F extends new (deps: never, ...rest: never[]) => unknown>(ctor: F & CradleProvides<C, F>): BuildResolver<InstanceType<F>>,
    /** asFunction whose deps parameter is the cradle itself: reading a key C lacks fails tsc. */
    factory<R>(fn: (deps: C) => R): BuildResolver<R>,
  };
}
/** Every token of C mapped to a resolver of its type: a missing or extra token fails tsc. */
export type Registrations<C> = { [K in keyof C]: Resolver<C[K]> };
```

**What the prototype proves fails tsc:**
- a missing registration;
- an unprovided dep, including an **optional** deps-object key that isn't a cradle token. Under PROXY that key throws at resolve time: `Could not resolve 'maxLines'`;
- a dep of the wrong type;
- a resolver whose type doesn't fit its token;
- a factory reading a key the cradle lacks.

**The error names the unprovided keys,** for example `"deps the cradle does not provide": { profile: string; stage: number }`.

**Constructor shape:**
- Optional test-only overrides stay as optional **second positional** parameters (`ActivityLog.maxLines`, `ProfileRouter.fetchComments`, `JiraClient.retryOptions`, `HookRulesRedactor.env`). PROXY passes only the cradle, so they keep their defaults.
- `DashboardServer.port` follows the same rule.

**Lifetimes** are chosen at each call (`.singleton()`, `.scoped()`). Rules:
- every registration resolved inside a scope is `.scoped()`, factories included, because `asFunction` defaults to transient and a transient dep of a scoped service throws under strict mode;
- per-scope inputs are `asValue`.

**`Resolver<T>` is covariant:** a resolver of a subtype passes. That is fine; the cradle type is the contract.

### 2. Cradle types (`src/awilix-cradle-types.ts`)

- **`OrchestratorCradle`** (root): today's tokens.
  - Add: `rootDir` (the orchestrator checkout), `sourceReposDir`, `vcsProviderClients`, `continuationRunner`, `sessionRunner`, `orchestrator`, `dashboardServer`.
  - Remove:
    - `secrets` (nothing reads it, `awilix-cradle.ts:141`);
    - `executorFactory` (per stage kind now);
    - `agentCatalogs`, `skillRenderer`, `jitMcpConfig` (their classes become functions).
- **`TaskCradle = OrchestratorCradle & TaskValues & { composeFiles; squidConfPath; compose; containerLogs; workspaceCleaner; containerManager; stageExecutors }`**, where `TaskValues = { profile; workspacePath }`.
- **Stage cradles, one per executor kind,** because the per-stage values differ by CLI. Today Copilot stages never load the agent catalog, and `tests/container/cli-executor-factory.test.ts:32-44` checks that.
  - `ClaudeStageCradle = TaskCradle & { stage; stageProfile; runtime; agentName; subagentDepth; claudeCodeExecutor }`
  - `CopilotStageCradle = TaskCradle & { stage; stageProfile; runtime; copilotExecutor }`
  - `ClaudeHostStageCradle = OrchestratorCradle & { stage; stageProfile; runtime; workspace; binary; hooksDir; agentName; subagentDepth; subagents; localClaudeCodeExecutor }`
  - `CopilotHostStageCradle = OrchestratorCradle & { stage; stageProfile; runtime; workspace; binary; localCopilotExecutor }`

  Host stage cradles hang off the root. `createLocalSession` runs after teardown (`task-runner.ts:139-142`, `post-task-hook-runner.ts:95`), when there is no task scope.
- **`DataSourceCradle = OrchestratorCradle & { sourceKey; dataSourceConfig }`** is the generic part `buildDataSourceMaps` registers. The JIRA factory declares its own `JiraSourceCradle = DataSourceCradle & { jiraConnection; jiraClient; excludeFields; allowedUsers; queries; pollIntervalMs; connector; poller }` in `src/datasource/connectors/jira/`, so the registry never imports connector code (`registry.ts:6-8`).

### 3. Root registrations (`src/awilix-cradle.ts`)

- **One typed object per registration site,** so completeness holds per site:
  - `rootRegistrations: Registrations<Omit<OrchestratorCradle, "connectors" | "pollers">>`;
  - `taskRegistrations: Registrations<Omit<TaskCradle, keyof OrchestratorCradle | keyof TaskValues>>`, scoped, registered at the root once;
  - one object per stage cradle kind;
  - per-scope values through typed helpers, for example `openTaskScope(root, values: TaskValues)`, whose parameter type forces every value.
- **Services by `service(Class)`.** `factory(...)` is used only for:
  - the two loggers (made by `activityLog`);
  - `heartbeat`;
  - `cliRuntimes` (`factory(({ claudeAuth }) => createCliRuntimeRegistry(claudeAuth))`, §7);
  - `squidConfPath` (scoped: today's existence check and message from `buildComposeClient`);
  - `composeFiles`.
- **Constructor dep keys become cradle tokens. Each rename below is mandatory, and its commit carries its tests:**
  - **ContainerManager:** `logs` → `containerLogs`, `cleaner` → `workspaceCleaner`, `logRegistry` removed (§6), `executorFactory` → `stageExecutors`.
  - **ContainerLogCollector:** `logDir` → `outputConfig`.
  - **Executors:** `profile` → `stageProfile`, `logger` → `containerLogger`, `compose` stays.
  - **Tests guarding the renames:** for each executor, one test that resolves it from a stage scope where `profile ≠ stageProfile` and `logger ≠ containerLogger`, and asserts it used the stage profile and the container logger. A missed rename type-checks, because the types match, and would run the variant's agent, model and timeout (`copilot-executor.ts:73`, `claude-code-executor.ts:91,113`).
- **Positional constructors become one deps object** (second positional parameters stay):
  - ComposeClient: `{ composeFiles, workspacePath, squidConfPath, rootDir }`;
  - JiraConnector, JiraWorkItemPoller;
  - VcsSourceClient: `{ vcsProviderClients }`;
  - DashboardServer: `{ orchestrator, logger }`, plus the optional positional `port`.
- **`containerFactory` is `asValue(createContainerManagerFactory(container))`.** The function lives in `src/container/container-manager-factory.ts` and takes the root container, so it can be tested with a real container.
- **`index.tsx`:** `createCradle` keeps running after `AppStartup.run()` (§7). Then `const { orchestrator, dashboardServer } = cradle`. `Orchestrator`'s stray `logger?` type key goes.

### 4. Per-task and per-stage scopes (replace `buildContainerFactory` and `CliExecutorFactory`)

- **`ContainerManagerFactory`** keeps its interface (`create`, `forceDown`, `createLocalSession`). `createContainerManagerFactory(container)` implements it.
  - **`create(profile, workspacePath)`:**
    - open a task scope with `TaskValues`;
    - resolve `compose` once and register it **into the task scope as `asValue`**. A `.scoped()` registration is cached in the scope that resolves it (`container.js:328-334`), so stage scopes would otherwise build a second ComposeClient and re-run the squid.conf and overlay checks;
    - register `stageExecutors` (below) as `asValue`;
    - resolve `containerManager`.
  - **`forceDown(profile)`:** a task scope whose `workspacePath` is the workspaces dir (today's placeholder, `awilix-cradle.ts:105-110`), resolving `compose`.
  - **`createLocalSession(profile, stage, workspace)`:** opens a host stage scope from the root, resolves the executor by `stage.cli`, and returns it with the root `sessionRunner`.
- **`stageExecutors: IStageExecutorFactory`,** created by `createStageExecutorFactory(taskScope)` in `src/container/stage-executor-factory.ts`.
  - **`create(stageProfile, stage)`** switches on `stage.cli`:
    - **Claude:** load the agent catalog, then open a `ClaudeStageCradle` scope with `stage`, `stageProfile`, `runtime`, `agentName` and `subagentDepth`, and resolve `claudeCodeExecutor`.
    - **Copilot:** open a `CopilotStageCradle` scope without the catalog, as today, and resolve `copilotExecutor`.
  - **The host variant** opens from the root for hooks, with the same per-CLI split. It computes `binary`, `hooksDir` and `subagents` as `CliExecutorFactory.createLocal` does today.
  - **Argument changes:** the `compose` and `cliLogger` arguments go, because the scope supplies them. `ContainerManager`'s call site loses both.
  - **Tests:** `tests/container/cli-executor-factory.test.ts` becomes `tests/container/stage-executor-factory.test.ts`. Every behaviour it covers survives, driven through a real scope with `vi.mock` of the catalog module.
- **`continuationRunner` and `sessionRunner` become root singletons.** Both reviews confirmed their fields are readonly deps and their state lives in `run()` locals. Today a fresh pair is built per task with identical deps.

### 5. Data sources through awilix

- **`registerDataSourceFactory(type, factory)`** stays the extension point.
  - The factory signature becomes `(scope: AwilixContainer<DataSourceCradle>) => { connector; poller }`.
  - Each factory registers its own classes in that scope with its own checked `Registrations`, then resolves them.
- **`createCradle`:**
  - register the root registrations;
  - then call `buildDataSourceMaps(container, config)` **outside any resolution**: one scope per `dataSources` entry, with `sourceKey` and `dataSourceConfig` as values;
  - then register `connectors` and `pollers` as `asValue`.
  - Resolving data-source scopes inside a root singleton factory throws ("Dependency 'connector' has a shorter lifetime than its ancestor: 'connectors'", reproduced). Construction stays eager at `createCradle`, as today.
  - `resolveJiraCredentials`' throw reaches the caller unchanged: awilix rethrows the original error (`container.js:359-363`).
- **JIRA:**
  - `jiraConnection` is `factory(...).scoped()`: the parsed connection schema plus `resolveJiraCredentials`.
  - `JiraClient`'s deps key `connection` becomes `jiraConnection`.
  - `queries` comes from `buildJqlFromProfiles(profiles filtered by sourceKey)`.
  - `pollIntervalMs`, `excludeFields` and `allowedUsers` come from `dataSourceConfig`.
- **Behaviour change, intended and named:** the JIRA classes get the activity `logger` from the cradle, where today they get none.
  - "Polling JIRA…" and "JIRA poll failed" move from stdout (the poller's `consoleLogger` fallback, `jira-poller.ts:39`) to the activity log. `JiraClient` retry warnings (`jira-client.ts:118`) start appearing there.
  - This matches AGENTS.md § Persistent logging. The Ink TUI owns the terminal, where stray stdout lines are noise.
  - It lands as its own commit.
- **`scripts/lookup-users.ts:51-52`** casts the raw connection to `IJiraConnectionConfig` without credentials (every request authenticates as `undefined:undefined`). It goes through `resolveJiraCredentials` as a separate, named bug-fix commit.

### 6. Stateless classes become module functions

| Class | Becomes | Callers updated |
|---|---|---|
| ComposeFileResolver | `resolveComposeFiles(profile, rootDir)` | the `composeFiles` scoped factory; its 3 tests |
| LogSourceRegistry | `registerLogSources(...)`, its two path constants as module consts | ContainerManager (drops `logRegistry`); `tests/container/manager.test.ts`, `continuation-loop.test.ts:83` and its own test |
| AgentCatalogProvider | `loadAgentCatalog(rootDir, profileId)` | AgentTemplateRenderer, ComposeOverlayWriter, the stage-executor factory, `resolveAllProfileSetup` |
| JitMcpConfigWriter | `writeJitMcpConfig(...)` | ProfileSetupService (drops `jitMcpConfig`) |
| SkillTemplateRenderer | `renderStageSkills(...)` | ProfileSetupService (drops `skillRenderer`) |
| Claude/Copilot agent writers | module objects | the runtimes' `agentWriter` |
| Ado/GitHub VCS provider clients | module objects | the root `vcsProviderClients` value |

- **Consumer tests that inject a mock of a removed interface** switch to `vi.mock` of the module (AGENTS.md § Testing) or to fixture files. The `createMock*` factories for removed interfaces go.
- **`rootDir` threading:** services read `rootDir` from the cradle instead of `process.cwd()`. This applies to:
  - the reads inside service methods: `agent-includes.ts:422`, `compose-overlay-writer.ts:118`, and through the converted functions `jit-mcp-params.ts:159`, `skill-includes.ts:141`;
  - the reads hidden in constructors: `activity-log.ts:65` and `text-redactor.ts:38`, which take `rootDir`;
  - the reads in `compose-client.ts:72`.
- **`process.cwd()` reads that stay:**
  - free functions outside the cradle: `taskWorkspacePath`, now next to `repoCachePaths`;
  - `mcp-builder.ts:18`, which runs at startup before the cradle;
  - the 14 reads in config, validation and startup code.
- **`createCradle(config, { rootDir })`** takes `rootDir` as an input (default `process.cwd()` at the call site in `index.tsx` and the scripts), so the runtime proof can use a fixture root.

### 7. `AppStartup` and the runtime registry stay as they are

- **The order stays as today.** The spec's earlier §7 proposed building the cradle before profile setup. Both reviews showed it isn't side-effect-free:
  - the JIRA credential throw would come before profile setup;
  - startup setup output would leave the terminal;
  - constructing the cradle eagerly runs `mkdirSync` in ActivityLog, LogCollector and OperationLedger.

  The fallback would make the runtimes injected from outside, contradicting the rest of this spec.
- **`createCliRuntimeRegistry(claudeAuth)` stays a module function that builds immutable strategy values.**
  - AppStartup calls it for profile setup; the cradle registers `cliRuntimes` through it.
  - Two equal, immutable registries per process are harmless, and the second is only built at startup.
  - `CliRuntimeRegistry` keeps `({ runtimes })`, so its duplicate-CLI and missing-runtime tests keep their inputs (`tests/cli/cli-runtime.test.ts:90`).

## Refactoring & reorganization

- **New:**
  - `src/di/registration.ts`;
  - `src/container/container-manager-factory.ts`;
  - `src/container/stage-executor-factory.ts`;
  - `tests/di/registration.test.ts`, with type-level `@ts-expect-error` cases and a runtime test resolving every root, task and stage token under strict mode against a fixture root and config, asserting each resolves to an instance of the expected class;
  - `tests/container/container-manager-factory.test.ts`;
  - `tests/container/stage-executor-factory.test.ts`, replacing `cli-executor-factory.test.ts`.
- **Deleted:**
  - `CliExecutorFactory`, `ComposeFileResolver`, `LogSourceRegistry`, `AgentCatalogProvider`, `JitMcpConfigWriter`, `SkillTemplateRenderer`, the two agent-writer classes and the two VCS provider client classes;
  - `buildContainerFactory`, `buildComposeClient`;
  - the interfaces of the converted classes and their mock factories.
- **Ripple:**
  - code: `inventory.md` §1–3;
  - tests and docs: **re-derived at the branch base** (plan Task 0), since the inventory predates `e7b8dc4`;
  - doc files the review found beyond the inventory: `MCP.md`, `CONFIGURATION.md`, `README.md`, `docs/dev-doc/{agent-templates,compose-layering,egress-security,security-audit-exfiltration,dependency-injection,data-source-registration}.md`, `docs/dev-doc/dataflow.drawio` (label text), `docs/user-guide/{skills,template-variables}.md`, `.claude/skills/{ralph-agent-authoring,task-failure-diagnosis,test-patterns}/**`, `.claude/rules/testing.md`, `docs/conventions/stack-profile.md`, AGENTS.md (§ How it works, § Adding a DI service).

## Verification

- **Baseline:** recorded in `plan.md` Task 0 on the branch base, which is main after the P6 review fixes merge. Lint, build and vitest file and test counts.
- **Gate after every task:** `npm run lint`, `npm run build`, `npx vitest run`. The test count may only fall by tests deleted with a deleted class, each named in its commit.
- **Proofs that the refactor is complete,** using `git grep`, which skips gitignored worktrees:
  - `git grep -nE '\bnew (ContainerManager|ComposeClient|ContainerLogCollector|ContainerWorkspaceCleaner|ContinuationRunner|AgentSessionRunner|ClaudeCodeExecutor|CopilotExecutor|LocalClaudeCodeExecutor|LocalCopilotExecutor|JiraClient|JiraConnector|JiraWorkItemPoller|Orchestrator|DashboardServer|VcsSourceClient|StageWorkspaceResolver|TaskWorkspaceManager|HookRulesRedactor)\(' -- src scripts` returns nothing.
    - `HeartbeatSender` is excluded: it's the conditional factory.
    - The runtimes and their registry are excluded: they're strategy values (§7).
  - `git grep -nE 'class (ComposeFileResolver|LogSourceRegistry|AgentCatalogProvider|JitMcpConfigWriter|SkillTemplateRenderer|CliExecutorFactory|ClaudeAgentWriter|CopilotAgentWriter|AdoVcsSourceProviderClient|GitHubVcsSourceProviderClient)\b' -- src` returns nothing.
  - `git grep -nE 'buildContainerFactory|buildComposeClient|ComposeFileResolver|LogSourceRegistry|AgentCatalogProvider|JitMcpConfigWriter|SkillTemplateRenderer|CliExecutorFactory|agentCatalogs|skillRenderer|jitMcpConfig'` over the whole tree (`containment/` excluded) returns nothing.
- **Negative compile proof:** `tests/di/registration.test.ts` holds the `@ts-expect-error` cases. During review, delete one root registration by hand and confirm `tsc` fails.

## Out of scope (stays as is on purpose)

- **Derived interfaces** (`type IFoo = PublicApi<Foo>`): owner-deferred.
- **`OrchestratorObserver`** keeps its closure constructor.
- **Value and state holders, errors, `SectionTag`, `AppStartup`** keep `new`.
- **`JiraFieldExtractor` and `JiraIssueParser`:** dead in production; recorded in `todo.md`.
- **`PromptBuilder`** without an interface.
- **The two runtime registries per process** (§7).
- **The startup-time `process.cwd()` reads** (§6).

## Corrections

From the spec review on 2026-10-07: two reviewers, rubber-duk-review and rubber-duk-backend, both on opus. Their claims were reproduced against awilix 13.0.5 before folding them in.

1. **The first draft made optional deps-object keys non-token keys,** and its `CradleProvides` (`C extends D`) accepted them.
   - Under PROXY, destructuring a key the cradle lacks throws (`Could not resolve 'maxLines'`, reproduced), so `ActivityLog` and both loggers would have failed at every startup. `tests/orchestrator-factory.test.ts:11-15` already guarded this.
   - **Fix:** test-only overrides stay second positional parameters, and the check now treats an optional unprovided key as unsatisfied (prototype `proto2.ts`).
2. **The first draft built the data-source maps inside a root singleton factory.**
   - A child scope shares its parent's resolution stack, so its scoped registrations fail the lifetime check while the singleton resolves ("Dependency 'connector' has a shorter lifetime than its ancestor: 'connectors'", reproduced). Registering them as singletons on a scope is refused.
   - **Fix:** build the maps in `createCradle` outside any resolution and register them as values.
3. **The first draft's §7 claimed that building the cradle before profile setup had no side effects. That was false:**
   - the JIRA credential throw would move;
   - startup output would leave the terminal;
   - `mkdirSync` would run in three constructors.

   **Fix:** keep the order and the module-function registry.
4. **"The stage scope inherits the task's `compose`" was false:** scoped registrations cache in the resolving scope. **Fix:** register the resolved `compose` into the task scope as a value.
5. **A single `StageCradle` would have forced Copilot stages to load the agent catalog,** or left values unregistered. Host stages have no task scope. **Fix:** one cradle per executor kind; host cradles hang off the root.
6. **`factory`'s first signature typed unannotated deps as `never`,** and its error printed the whole deps type. **Fix:** `factory<R>(fn: (deps: C) => R)` and an expanded `Unsatisfied` (prototype).
7. **Compile-time completeness covered the root only.** **Fix:** one `Registrations<…>` per registration site, plus typed scope-opening helpers.
8. **Smaller corrections:**
   - the classification table contradicted §4 and §6;
   - `executorFactory` had stayed on the root;
   - the squid.conf check had no home;
   - the completeness grep listed classes the design keeps constructing, and walked gitignored worktrees;
   - the JIRA logging change was unnamed;
   - `lookup-users.ts` is broken;
   - four `process.cwd()` destinations were wrong;
   - the doc ripple missed files;
   - `CliRuntimeRegistry` named runtimes would have killed its duplicate-CLI tests;
   - the executor-factory tests had no destination.

   All are fixed in the sections above.

From the Task 9 review on 2026-10-07:

9. **§2's `TaskCradle` left out `composeFiles`,** which §3 registers as a scoped token and `ComposeClient` takes as a dep. Without it, `t.service(ComposeClient)` cannot type-check. **Fix:** `TaskCradle` carries `composeFiles` (and §2 above names it).
10. **The runtime test resolving every root, task and stage token had no plan task.** **Fix:** it lands with Task 11, once the stage scopes (Task 10) and the cradle-built orchestrator and dashboard server (Task 11) exist.
