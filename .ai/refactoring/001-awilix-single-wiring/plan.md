# One awilix wiring style: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every service is constructed and wired by awilix through registrations that `tsc` checks against the cradle types, per-task and per-stage objects come from awilix scopes, and stateless classes become module functions or objects, with no behaviour change except the named JIRA logging change.

**Architecture:**
- `src/di/registration.ts` gives `wiring<C>()` (`service` / `factory`) and `Registrations<C>`. Each registration site is one typed object.
- The root container holds singletons.
- `createContainerManagerFactory(container)` opens a task scope per task. `createStageExecutorFactory(scope)` opens a stage scope per stage, one cradle type per executor kind.
- Data-source scopes are built in `createCradle` outside any resolution.

**Tech stack:** Node 24, TypeScript 6.0.3 (root), awilix 13.0.5 (`InjectionMode.PROXY`, `strict: true`), Vitest.

**Spec:** `.ai/refactoring/001-awilix-single-wiring/spec.md`, with the inventory in `inventory.md` beside it. Read both before any task.

## Global constraints

- **Repo rules** (`AGENTS.md`, `.ai/agent-working-rules.md`, `docs/conventions/comment-policy.md`, `docs/conventions/test-quality.md`, `.claude/rules/testing.md`):
  - extensionless relative imports;
  - no re-exports, no shims or aliases for old names;
  - enums for fixed string sets;
  - JSDoc on public API;
  - no archaeology comments;
  - `// Arrange` / `// Act` / `// Assert` labels in every test.
- **Git:** run it as `/usr/bin/git`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Gate after every task, all green:** `npm run format`, `npm run lint`, `npm run build`, `npx vitest run`.
  - Never pipe their output through head, tail or grep. Redirect to `.cache/claude-scratch/awilix/<task>.log` and read the file.
  - The test count may only fall by tests deleted with a deleted class or interface, each named in the commit message.
- **Every rename lands in one commit** with all its importers, tests and the docs that name it. No commit leaves two parallel structures.
- **Test-only overrides** stay optional **second positional** constructor parameters, never optional keys of the deps object. Under PROXY, an unregistered key throws when read.
- **Lifetimes:**
  - root services: `.singleton()`;
  - every registration resolved inside a task, stage or data-source scope: `.scoped()`, factories included;
  - per-scope inputs: `asValue`.
- **No live CLI runs.** Never read `.env`. Never touch `containment/`.

## Review focus

The tests for each of these live in the task named.

1. **A JIRA data source whose `JIRA_PAT_<KEY>` is unset** still fails `createCradle` with `resolveJiraCredentials`' own message, not an awilix wrapper. Task 8.
2. **A stage whose `stageProfile` differs from the variant `profile`:** the executor passes the stage's agent, model and timeout, and logs through `containerLogger`. One test per executor kind, so a missed rename can't hide behind matching types. Task 10.
3. **A multi-stage task** constructs exactly one `ComposeClient`, shared by every stage's executor. Task 10.
4. **`forceDown` for a profile whose `.build/squid.conf` is missing** throws today's "Profile squid.conf not found …" message, and `TaskRunner.teardown` still logs and survives it. Task 9.
5. **A post-task hook stage resolved after teardown** (no task scope) gets its executor from a host stage scope opened on the root, with the hook workspace. Task 10.

---

### Task 0: Isolate, baseline, re-derive the stale inventory

**Files:**
- Create: `.ai/refactoring/001-awilix-single-wiring/baseline.md`
- Modify: `.ai/refactoring/001-awilix-single-wiring/inventory.md`, appending an "Addendum at <base SHA>" section

**Steps:**

- [ ] **Step 1: Create the worktree.** Use superpowers:using-git-worktrees from `main`, after the P6 review fixes have merged. Branch `refactor/awilix-single-wiring`.
- [ ] **Step 2: Run the gate and record the figures** in `baseline.md`: the SHA, lint and build exit codes, vitest file and test counts, and any pre-existing warning.

  ```bash
  npm run lint > .cache/claude-scratch/awilix/t0-lint.log 2>&1; echo $?
  npm run build > .cache/claude-scratch/awilix/t0-build.log 2>&1; echo $?
  npx vitest run > .cache/claude-scratch/awilix/t0-vitest.log 2>&1; echo $?
  ```
- [ ] **Step 3: Re-derive inventory §4 and §5 at the base,** because `inventory.md` predates `e7b8dc4`. Append the counts and locators.
  - §4: test `new X(` sites per class:

    ```bash
    git grep -nE '\bnew [A-Z][A-Za-z0-9]*\(' -- tests
    ```
  - §5: class names in docs, using the file list in spec § Refactoring:

    ```bash
    git grep -nwE '<the 61 class names joined by |>' -- '*.md' '*.drawio' ':!containment'
    ```
- [ ] **Step 4: Check that every `src/` constructor still matches inventory §1**:

  ```bash
  git grep -nE '^\s*constructor\(' -- src
  ```
  Record any drift (for example from the P6 fixes) in the addendum, and adjust the later tasks' rename lists before starting them.
- [ ] **Step 5: Commit** the journal files: `Record the awilix refactor baseline and inventory addendum`.

---

### Task 1: Checked registration helpers

**Files:**
- Create: `src/di/registration.ts`
- Test: `tests/di/registration.test.ts`

**Interfaces:**
- Produces:
  - `wiring<C extends object>(): { service, factory }`
  - `type Registrations<C>`
  - `type Unsatisfied<C, D>` (exported for tests)

- [ ] **Step 1: Write the failing test** in `tests/di/registration.test.ts`:

```ts
import { asValue, createContainer, InjectionMode } from "awilix";
import { describe, expect, it } from "vitest";
import { wiring, type Registrations } from "../../src/di/registration";

interface Greeter { greet(): string }
interface TestCradle { name: string; greeter: Greeter; shout: string }

class NamedGreeter implements Greeter {
  constructor(private readonly deps: { name: string }, private readonly suffix = "!") {}
  greet(): string { return `hi ${this.deps.name}${this.suffix}`; }
}
class NeedsMissing implements Greeter {
  constructor(private readonly deps: { name: string; missing: number }) {}
  greet(): string { return String(this.deps.missing); }
}
class NeedsOptional implements Greeter {
  constructor(private readonly deps: { name: string; optional?: number }) {}
  greet(): string { return String(this.deps.optional); }
}
class NeedsWrongType implements Greeter {
  constructor(private readonly deps: { name: number }) {}
  greet(): string { return String(this.deps.name); }
}

describe("wiring", () => {
  const w = wiring<TestCradle>();

  it("builds a container whose services get their deps from the cradle and keep positional defaults", () => {
    // Arrange
    const registrations: Registrations<TestCradle> = {
      name: asValue("ralph"),
      greeter: w.service(NamedGreeter).singleton(),
      shout: w.factory(({ greeter }) => greeter.greet().toUpperCase()).singleton(),
    };
    const container = createContainer<TestCradle>({ injectionMode: InjectionMode.PROXY, strict: true });

    // Act
    container.register(registrations);

    // Assert
    expect(container.cradle.shout).toBe("HI RALPH!");
  });

  it("rejects at compile time a constructor whose deps the cradle does not provide", () => {
    // Act & Assert
    // @ts-expect-error `missing` is not a cradle token
    w.service(NeedsMissing);
    // @ts-expect-error an optional deps key that is not a cradle token throws under PROXY
    w.service(NeedsOptional);
    // @ts-expect-error `name` has the wrong type
    w.service(NeedsWrongType);
    // @ts-expect-error a factory reading a key the cradle lacks
    w.factory(({ nope }) => nope);
    expect(true).toBe(true);
  });

  it("rejects at compile time a registration object missing a token", () => {
    // Act & Assert
    // @ts-expect-error `shout` is not registered
    const incomplete: Registrations<TestCradle> = { name: asValue("x"), greeter: w.service(NamedGreeter).singleton() };
    expect(incomplete).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**
  - Run: `npx vitest run tests/di/registration.test.ts`. Expected: FAIL, cannot resolve `../../src/di/registration`.
  - Run: `npx tsc -p tests/tsconfig.json`. Expected: errors for the missing module.
- [ ] **Step 3: Implement `src/di/registration.ts`:**

```ts
import { asClass, asFunction, type BuildResolver, type Constructor, type FunctionReturning, type Resolver } from "awilix";

type Expand<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

/** Keys of deps object `D` that cradle `C` lacks (optional keys included) or provides with an incompatible type. */
export type Unsatisfied<C, D> = Expand<{
  [K in keyof D as K extends keyof C ? (C[K] extends D[K] ? never : K) : K]-?: D[K];
}>;

type DepsOf<F> = F extends new (deps: infer D, ...rest: never[]) => unknown ? D : never;

/** `unknown` when cradle `C` provides every dep `F`'s constructor takes, else a type naming the unprovided deps. */
type CradleProvides<C, F> = [keyof Unsatisfied<C, DepsOf<F>>] extends [never]
  ? unknown
  : { "deps the cradle does not provide": Unsatisfied<C, DepsOf<F>> };

/** Every token of cradle `C` mapped to a resolver of its type: a missing or extra token fails tsc. */
export type Registrations<C> = { [K in keyof C]: Resolver<C[K]> };

/**
 * Registration helpers checked against cradle `C` (awilix `InjectionMode.PROXY`).
 *
 * `service` takes a class whose first constructor parameter is a deps object every key of which `C` provides
 * with a compatible type; further constructor parameters must be optional, since PROXY passes only the cradle.
 * `factory` takes a function whose parameter is `C` itself. Neither sets a lifetime.
 */
export function wiring<C extends object>(): {
  service<F extends new (deps: never, ...rest: never[]) => unknown>(
    ctor: F & CradleProvides<C, F>,
  ): BuildResolver<InstanceType<F>>;
  factory<R>(fn: (deps: C) => R): BuildResolver<R>;
} {
  return {
    service: (ctor) => asClass(ctor as unknown as Constructor<InstanceType<typeof ctor>>),
    factory: (fn) => asFunction(fn as FunctionReturning<ReturnType<typeof fn>>),
  };
}
```

  If tsc rejects the generic `InstanceType<typeof ctor>` in the arrow implementation, use function declarations with explicit type parameters matching the signature above. The prototype in `.cache/claude-scratch/awilix/proto/proto2.ts` compiles.
- [ ] **Step 4: Run the test and the gate.** Expected: PASS, and `tsc` reports no unused `@ts-expect-error`.
- [ ] **Step 5: Commit:** `Add compile-time checked awilix registration helpers`.

---

### Task 2: Root cradle on checked registrations

**Files:**
- Modify:
  - `src/awilix-cradle.ts`
  - `src/awilix-cradle-types.ts`
  - `src/services/activity-log.ts` (constructor reads `rootDir` instead of `process.cwd()`)
  - `src/logs/text-redactor.ts` (`({ rootDir }, env = process.env)`)
  - `src/services/stage-workspace.ts`
  - `src/services/task-workspace-manager.ts` (constructor keys are already tokens)
  - `src/container/cli-executor-factory.ts` (keeps the class for now; `rootDir` becomes a token)
  - `src/index.tsx`, `scripts/run-agent.ts`, `scripts/run-hooks.ts` (`createCradle(config, { rootDir: process.cwd() })`)
- Test:
  - `tests/orchestrator-factory.test.ts`
  - `tests/logs/text-redactor.test.ts`
  - `tests/services/activity-log.test.ts`
  - every test constructing `HookRulesRedactor` / `ActivityLog` (inventory addendum §4)

**Interfaces:**
- Consumes: `wiring`, `Registrations` (Task 1).
- Produces:
  - `createCradle(config: IAppConfig, options: { rootDir: string }): OrchestratorCradle`
  - new root tokens: `rootDir: string`, `sourceReposDir: string`
  - removed root token: `secrets`

- [ ] **Step 1: Write the failing test** in `tests/orchestrator-factory.test.ts`: `createCradle(config, { rootDir: tmp })` exposes `rootDir === tmp`, and `cradle.workspaceManager` resolves.

  ```ts
  it("takes the orchestrator checkout from its caller", () => {
    // Arrange
    const rootDir = mkdtempSync(join(tmpdir(), "cradle-"));

    // Act
    const cradle = createCradle(makeAppConfig(), { rootDir });

    // Assert
    expect(cradle.rootDir).toBe(rootDir);
    expect(cradle.stageWorkspaces).toBeInstanceOf(StageWorkspaceResolver);
  });
  ```

  Use the file's existing config helper in place of `makeAppConfig` if it has another name.
- [ ] **Step 2: Run it.** Expected: FAIL (excess argument / `rootDir` not on the cradle).
- [ ] **Step 3: Implement.**
  - **In `awilix-cradle-types.ts`:** add `rootDir: string` and `sourceReposDir: string`, and remove `secrets`.
  - **In `awilix-cradle.ts`:** replace the `container.register({...})` literal with a typed root registration:

```ts
const w = wiring<OrchestratorCradle>();
const root: Registrations<Omit<OrchestratorCradle, "connectors" | "pollers">> = {
  rootDir: asValue(rootDir),
  sourceReposDir: asValue(repoCachePaths(rootDir).sourceReposDir),
  dataSources: asValue(config.dataSources),
  // …every config slice as today, without `secrets`
  activityLog: w.service(ActivityLog).singleton(),
  logger: w.factory(({ activityLog }) => activityLog.createLogger()).singleton(),
  containerLogger: w.factory(({ activityLog }) => activityLog.createContainerLogger()).singleton(),
  stageWorkspaces: w.service(StageWorkspaceResolver).singleton(),
  workspaceManager: w.service(TaskWorkspaceManager).singleton(),
  textRedactor: w.service(HookRulesRedactor).singleton(),
  executorFactory: w.service(CliExecutorFactory).singleton(),
  agentCatalogs: w.service(AgentCatalogProvider).singleton(),
  heartbeat: w.factory(({ dashboardConfig, logger }) =>
    dashboardConfig.enabled ? new HeartbeatSender({ dashboardConfig, logger }) : null,
  ).singleton(),
  // every other existing asClass line becomes w.service(X).singleton(), unchanged otherwise
};
container.register(root);
container.register({ connectors: asValue(connectors), pollers: asValue(pollers) });
```

  - **Constructor changes:**
    - `ActivityLog` takes `{ outputConfig, rootDir }`; `maxLines` stays the second positional parameter.
    - `HookRulesRedactor` takes `({ rootDir }: { rootDir: string }, env: NodeJS.ProcessEnv = process.env)` and derives the script path with `sharedHooksDir(rootDir)`.
    - `TaskWorkspaceManager` already takes `sourceReposDir`.
    - `AgentCatalogProvider` already takes `rootDir`.
  - **Remove `secrets`** from the registrations.
  - **Update every caller** of `createCradle` and every test constructing the changed classes.
  - **Delete the PROXY optional-key note** at `tests/orchestrator-factory.test.ts:11-15` if the new helper makes it redundant. Keep it if it still guards something.
- [ ] **Step 4: Run the gate.** Expected: all green, and the new test passes.
- [ ] **Step 5: Commit:** `Register the root services through checked registrations`. The message names the removal of `secrets`.

---

### Task 3: Stateless strategies become module objects

**Files:**
- Modify:
  - `src/cli/claude/claude-agent-writer.ts`, `src/cli/copilot/copilot-agent-writer.ts` (`export const claudeAgentWriter: IAgentFileWriter = { … }`, using method shorthand)
  - `src/cli/claude/claude-runtime.ts`, `src/cli/copilot/copilot-runtime.ts` (`agentWriter = claudeAgentWriter`)
  - `src/services/vcs-source-client.ts`:
    - `export const adoVcsSourceProviderClient` / `githubVcsSourceProviderClient`;
    - `VcsSourceClient` takes `({ vcsProviderClients }: { vcsProviderClients: readonly IVcsSourceProviderClient[] })`
  - `src/awilix-cradle-types.ts` (`vcsProviderClients`), `src/awilix-cradle.ts`:
    - `vcsProviderClients: asValue([adoVcsSourceProviderClient, githubVcsSourceProviderClient])`;
    - `vcsSourceClient: w.service(VcsSourceClient).singleton()`
- Test:
  - `tests/cli/claude/claude-agent-writer.test.ts`
  - `tests/cli/copilot/copilot-agent-writer.test.ts`
  - `tests/services/vcs-source-client.test.ts`
  - every `new ClaudeAgentWriter()` / `new CopilotAgentWriter()` / `new VcsSourceClient(` site in tests

**Interfaces:**
- Produces: `claudeAgentWriter`, `copilotAgentWriter`, `adoVcsSourceProviderClient`, `githubVcsSourceProviderClient` (all module consts), and the root token `vcsProviderClients`.

- [ ] **Step 1: Update the tests** to the new names. `tests/services/vcs-source-client.test.ts` passes `{ vcsProviderClients: [fakeClient] }`. Run them. Expected: FAIL (exports missing).
- [ ] **Step 2: Implement the conversions.** Each class body becomes the object literal's methods unchanged. `CopilotAgentWriter.write` keeps calling `this.modelOf`, so use method shorthand.
- [ ] **Step 3: Run the gate.** Expected: green.
- [ ] **Step 4: Completeness check.** Expected: no hits.

  ```bash
  git grep -nE 'ClaudeAgentWriter|CopilotAgentWriter|AdoVcsSourceProviderClient|GitHubVcsSourceProviderClient' -- ':!containment'
  ```
- [ ] **Step 5: Commit:** `Make the agent writers and VCS provider clients module objects`.

---

### Task 4: Compose files and log sources become functions

**Files:**
- Modify:
  - `src/container/setup/compose-files.ts`:

    ```ts
    export function resolveComposeFiles(profile: IAgentProfile, rootDir: string): string[]
    ```

    The body is `ComposeFileResolver.resolve` unchanged.
  - `src/container/log-source-registry.ts`:

    ```ts
    export const PRE_TOOL_PATH = …; export const TOOL_OUTPUT_PATH = …;
    export function registerLogSources(logs, profile, taskId, workItemId, callbacks, runtimes): void
    ```

    The body is `registerAll` unchanged.
  - `src/container/manager.ts`: drop the `logRegistry` dep and call `registerLogSources`.
  - `src/awilix-cradle.ts`: `buildComposeClient` calls `resolveComposeFiles(profile, rootDir)`, and `buildContainerFactory` drops `new LogSourceRegistry()`.
- Test:
  - `tests/container/compose-files.test.ts`
  - `tests/container/log-source-registry.test.ts`
  - `tests/container/manager.test.ts`
  - `tests/container/continuation-loop.test.ts`
  - every site that injects `logRegistry`

- [ ] **Step 1: Update the tests** to call the functions, and remove the `logRegistry` arguments from the manager tests. Run them. Expected: FAIL.
- [ ] **Step 2: Implement the conversions.** Update `ContainerLogSources` / static path users to the module consts.
- [ ] **Step 3: Run the gate.** Expected: green.
- [ ] **Step 4: Commit:** `Turn the compose file resolver and log source registry into functions`.

---

### Task 5: The agent catalog provider becomes a function

**Files:**
- Modify:
  - `src/container/setup/agent-catalogs.ts`:

    ```ts
    export async function loadAgentCatalog(rootDir: string, profileId: string): Promise<AgentCatalog>
    ```
  - `src/container/setup/agent-includes.ts`: `AgentTemplateRenderer` takes `{ cliRuntimes, rootDir }`.
  - `src/container/setup/compose-overlay-writer.ts`: takes `{ cliRuntimes, rootDir }`.
  - `src/container/cli-executor-factory.ts`: takes `{ cliRuntimes, rootDir }`.
  - `src/container/setup/profile-setup.ts`: `resolveAllProfileSetup` calls `loadAgentCatalog(rootDir, …)`.
  - `src/awilix-cradle-types.ts`, `src/awilix-cradle.ts`: remove `agentCatalogs`.
- Test:
  - the consumers' tests switch from the `IAgentCatalogProvider` mock to `vi.mock("../../src/container/setup/agent-catalogs")` with `loadAgentCatalog` mocked;
  - `tests/helpers/mocks.ts` drops `createMockAgentCatalogProvider`.

  This also moves the two `process.cwd()` reads inside `AgentTemplateRenderer.render` (`agent-includes.ts:422`) and `ComposeOverlayWriter.write` (`compose-overlay-writer.ts:118`) to the injected `rootDir`.

- [ ] **Step 1: Update the consumer tests.** Run them. Expected: FAIL.
- [ ] **Step 2: Implement.** In each consumer, a call to `this.agentCatalogs.load(id)` becomes `loadAgentCatalog(this.rootDir, id)`, and `process.cwd()` becomes `this.rootDir`.
- [ ] **Step 3: Run the gate.** Expected: green.
- [ ] **Step 4: Commit:** `Load agent catalogs with a function and give renderers the checkout from the cradle`.

---

### Task 6: The JIT MCP config writer and skill renderer become functions

**Files:**
- Modify:
  - `src/container/setup/jit-mcp-params.ts` (`export function writeJitMcpConfig(…, rootDir: string)`, the body of `JitMcpConfigWriter.write`, with `resolveGatewayPath` taking `rootDir`)
  - `src/container/setup/skill-includes.ts` (`export function renderStageSkills(context, target, rootDir, logger?)`)
  - `src/services/profile-setup-service.ts` (drop the `jitMcpConfig` and `skillRenderer` deps, take `rootDir`, call the functions)
  - `src/awilix-cradle-types.ts`, `src/awilix-cradle.ts` (remove `jitMcpConfig` and `skillRenderer`)
- Test:
  - `tests/services/profile-setup-service.test.ts` (`vi.mock` both modules)
  - `tests/container/jit-mcp-params.test.ts`
  - `tests/container/skill-includes.test.ts`
  - `tests/helpers/mocks.ts` (remove their mock factories)

- [ ] **Step 1: Update the tests.** Run them. Expected: FAIL.
- [ ] **Step 2: Implement the conversions.**
- [ ] **Step 3: Run the gate.** Expected: green.
- [ ] **Step 4: Commit:** `Turn the JIT MCP config writer and skill renderer into functions`.

---

### Task 7: The session runners become root singletons

**Files:**
- Modify:
  - `src/awilix-cradle-types.ts` (`continuationRunner: IContinuationRunner`, `sessionRunner: IAgentSessionRunner`)
  - `src/awilix-cradle.ts`:
    - register both with `w.service(…).singleton()`;
    - `buildContainerFactory` takes `sessionRunner` from its deps instead of `new`-ing both.
- Test: `tests/orchestrator-factory.test.ts`, asserting that `cradle.sessionRunner` resolves and `containerFactory.create(...)` uses it. Spy on the method through a registered instance, not by `new`.

- [ ] **Step 1: Write the test** asserting that two `createLocalSession` calls return the same `sessionRunner` instance. Run it. Expected: FAIL, because they're distinct today.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the gate.** Expected: green.
- [ ] **Step 4: Commit:** `Register the continuation and session runners as singletons`. The message notes the lifetime change and that their fields are readonly deps (spec §4).

---

### Task 8: Data-source wiring through scopes, then the JIRA logger change and the lookup-users fix

The work is ordered so the JIRA logging behaviour change and the bug fix land as their own commits.

**Files:**
- Modify:
  - `src/datasource/registry.ts`:
    - `DataSourceFactory = (scope: AwilixContainer<DataSourceCradle>) => { connector; poller }`;
    - `buildDataSourceMaps(container: AwilixContainer<OrchestratorCradle>, config: IAppConfig)` opens one scope per entry, registers `sourceKey` and `dataSourceConfig` as values, and calls the factory.
  - `src/awilix-cradle-types.ts`: `DataSourceCradle = OrchestratorCradle & { sourceKey: string; dataSourceConfig: IDataSourceConfig }`.
  - `src/datasource/connectors/jira/factory.ts`:
    - declares `JiraSourceCradle`;
    - registers `jiraConnection` (`w.factory(...).scoped()`, the parsed schema plus `resolveJiraCredentials(sourceKey)`), `excludeFields`, `allowedUsers`, `queries`, `pollIntervalMs` (scoped factories over `dataSourceConfig` and `profiles`), and `jiraClient`, `connector`, `poller` (`w.service(...).scoped()`);
    - resolves `connector` and `poller`.
  - `src/datasource/connectors/jira/jira-client.ts`: deps `{ jiraConnection }`, `retryOptions` second positional.
  - `jira-connector.ts`: deps `{ sourceKey, jiraClient, excludeFields, allowedUsers }`.
  - `jira-poller.ts`: deps `{ connector, queries, pollIntervalMs }`.
  - **No `logger` key in any JIRA deps in this commit.** They keep today's logger behaviour: none passed, and the poller's `consoleLogger` fallback stays as a constructor default.
  - `src/awilix-cradle.ts`: after `container.register(root)`, `const { connectors, pollers } = buildDataSourceMaps(container, config)`, then register both as `asValue`.
- Test:
  - `tests/datasource/registry.test.ts`
  - the JIRA connector, poller and client tests (constructor shapes)
  - `tests/orchestrator-factory.test.ts`: a missing `JIRA_PAT_<KEY>` makes `createCradle` throw `resolveJiraCredentials`' exact message (Review Focus 1)

- [ ] **Step 1: Write the Review-Focus-1 test** and update the constructor-shape tests. Run them. Expected: FAIL.
- [ ] **Step 2: Implement the scope design.** Data-source scopes are opened in `createCradle` outside any resolution (spec Corrections 2).
- [ ] **Step 3: Run the gate.** Expected: green.
- [ ] **Step 4: Commit:** `Build data-source connectors and pollers in awilix scopes`.
- [ ] **Step 5: Behaviour change commit.** Add `logger: Logger` to the deps of `JiraClient` and `JiraWorkItemPoller`, and drop the poller's `consoleLogger` fallback.
  - Test: a poll failure is logged through the injected logger.
  - Gate.
  - Commit: `Log JIRA polling and retries to the activity log`. The message explains that stdout lines move to the activity log and retry warnings appear, per AGENTS.md § Persistent logging.
- [ ] **Step 6: Bug-fix commit.** `scripts/lookup-users.ts` builds its client through the JIRA factory's connection path: `resolveJiraCredentials` plus the parsed schema, rather than casting the raw connection.
  - Gate (lint type-checks scripts).
  - Commit: `Authenticate lookup-users with the data source's JIRA credentials`. The message says every request authenticated as `undefined:undefined` before.

---

### Task 9: Task scopes replace `buildContainerFactory`

**Files:**
- Create:
  - `src/container/container-manager-factory.ts`
  - `tests/container/container-manager-factory.test.ts`
- Modify:
  - `src/container/compose-client.ts`: deps `{ composeFiles, workspacePath, squidConfPath, rootDir }`; `SHARED_HOOKS_PATH` comes from `sharedHooksDir(rootDir)`.
  - `src/container/log-collector.ts`: `ContainerLogCollector` deps `{ compose, outputConfig, logger }`, reading `outputConfig.logDir`.
  - `src/container/workspace-cleaner.ts`: unchanged deps `{ compose, logger }`.
  - `src/container/manager.ts`: deps renamed `logs` → `containerLogs` and `cleaner` → `workspaceCleaner`. `executorFactory` stays a root token until Task 10.
  - `src/awilix-cradle-types.ts`: add `TaskValues` and `TaskCradle`.
  - `src/awilix-cradle.ts`:
    - delete `buildContainerFactory` and `buildComposeClient`;
    - register the scoped task services once at the root through `taskRegistrations: Registrations<Omit<TaskCradle, keyof OrchestratorCradle | keyof TaskValues | "stageExecutors">>`;
    - `containerFactory: asValue(createContainerManagerFactory(container))`.
- Test: the manager, log-collector and compose-client tests (constructor shapes).

**Interfaces:**
- Produces:
  - `createContainerManagerFactory(container: AwilixContainer<OrchestratorCradle>): ContainerManagerFactory`
  - `openTaskScope(container, values: TaskValues): AwilixContainer<TaskCradle>`, exported from the same module for Task 10

```ts
/** Scoped task registrations; `squidConfPath` throws when profile setup has not written the profile's squid.conf. */
const t = wiring<TaskCradle>();
export const taskRegistrations = {
  composeFiles: t.factory(({ profile, rootDir }) => resolveComposeFiles(profile, rootDir)).scoped(),
  squidConfPath: t.factory(({ profile, rootDir }) => {
    const path = join(profileBuildPaths(rootDir, profile.id).buildDir, "squid.conf");
    if (!existsSync(path)) {
      throw new Error(`Profile squid.conf not found at ${path}; profile setup has not run for ${profile.id}`);
    }
    return path;
  }).scoped(),
  compose: t.service(ComposeClient).scoped(),
  containerLogs: t.service(ContainerLogCollector).scoped(),
  workspaceCleaner: t.service(WorkspaceCleanerClass).scoped(),
  containerManager: t.service(ContainerManager).scoped(),
};
```

Use the real class names; the error message is today's, from `awilix-cradle.ts:52-55`, verbatim.

- [ ] **Step 1: Write `container-manager-factory.test.ts`** against a fixture root with a `.build/squid.conf`:
  - `create(profile, ws)` returns a manager whose `compose` env has `TARGET_REPO_PATH=ws`;
  - `forceDown(profile)` for a profile **without** `squid.conf` rejects with "Profile squid.conf not found" (Review Focus 4).

  Run it. Expected: FAIL (module missing).
- [ ] **Step 2: Implement the module, the registrations and the constructor renames.**
  - `create`: open a task scope, resolve `compose`, re-register it in the scope with `asValue(compose)`, then resolve `containerManager`.
  - `forceDown`: open a scope with `workspacePath` set to the workspaces dir.
- [ ] **Step 3: Check that the existing `TaskRunner.teardown` test** for a throwing `forceDown` still passes unchanged.
- [ ] **Step 4: Run the gate.** Expected: green.
- [ ] **Step 5: Commit:** `Build each task's container stack in an awilix scope`.

---

### Task 10: Stage scopes replace `CliExecutorFactory`

**Files:**
- Create:
  - `src/container/stage-executor-factory.ts`
  - `tests/container/stage-executor-factory.test.ts` (carries every case of `tests/container/cli-executor-factory.test.ts`, which is deleted)
- Modify:
  - `src/container/cli-executor-factory.ts`: keep only the `ICliExecutor` interface and the `IStageExecutorFactory` interface; delete `CliExecutorFactory`. If the file then holds only interfaces, keep its name.
  - The four executors: deps `profile` → `stageProfile`, `logger` → `containerLogger`. Local executors take `{ stage, stageProfile, runtime, workspace, binary, … }` as in spec §2.
  - `src/container/manager.ts`: `executorFactory` → `stageExecutors: IStageExecutorFactory`. The call becomes `stageExecutors.create(stageProfile, stage)`, with no `compose` or `cliLogger` argument.
  - `src/container/container-manager-factory.ts`:
    - `create` registers `stageExecutors: asValue(createStageExecutorFactory(taskScope))`;
    - `createLocalSession` uses `createHostStageExecutor(container, stageProfile, stage, workspace)` and the root `sessionRunner`.
  - `src/awilix-cradle-types.ts`: the four stage cradle types; remove root `executorFactory`.
  - `src/awilix-cradle.ts`: register the stage-scoped executors at the root through one typed `Registrations<…>` per stage cradle kind.

**Interfaces:**
- Produces:
  - `interface IStageExecutorFactory { create(stageProfile: IAgentProfile, stage: IStageConfig): Promise<ICliExecutor> }`
  - `createStageExecutorFactory(taskScope: AwilixContainer<TaskCradle>): IStageExecutorFactory`
  - `createHostStageExecutor(root: AwilixContainer<OrchestratorCradle>, stageProfile, stage, workspace: HostStageWorkspace): Promise<ICliExecutor>`

- [ ] **Step 1: Write the tests.**
  - **Port every case** from `cli-executor-factory.test.ts`: a Claude stage loads the catalog; a Copilot stage doesn't; a missing template throws; host binaries and hooks dir; subagent names.
  - **Add Review Focus 2,** one test per executor kind. Open a scope whose task `profile` has `agentName: "ralph.variant"` and whose `stageProfile` has `agentName: "ralph.reviewer"`, model `opus` and a different timeout. Assert:
    - the executor's argv contains the stage's agent, model and timeout;
    - its log lines go to `containerLogger`, not `logger` (pass two distinct mock loggers).
  - **Add Review Focus 3:** two stages of one task. Spy on `ComposeClient`'s module constructor through `vi.mock` of `compose-client`, or count `composeFiles` factory calls, and assert one construction.
  - **Add Review Focus 5:** `createLocalSession` with no task scope resolves a `LocalClaudeCodeExecutor` whose workspace is the hook workspace.

  Run them. Expected: FAIL.
- [ ] **Step 2: Implement** the module, the renames and the registrations. Move `CliExecutorFactory.create`/`createLocal` logic verbatim into the factory functions; only the construction becomes scope registration plus resolve.
- [ ] **Step 3: Run the gate.** Expected: green.
- [ ] **Step 4: Completeness check.** Expected: no hits.

  ```bash
  git grep -nE 'CliExecutorFactory|executorFactory|createLocal\(' -- src tests scripts
  ```
- [ ] **Step 5: Commit:** `Resolve stage executors from per-stage awilix scopes`.

---

### Task 11: Orchestrator and dashboard server from the cradle

**Files:**
- Modify:
  - `src/services/dashboard-server.ts`: `({ orchestrator, logger }, port?)`, reading `orchestrator.observer`.
  - `src/orchestrator.ts`: drop the stray `logger?` type key.
  - `src/awilix-cradle-types.ts`: `orchestrator: Orchestrator`, `dashboardServer: DashboardServer`, or interfaces if they exist.
  - `src/awilix-cradle.ts`: `w.service(...).singleton()` for both.
  - `src/index.tsx`: `const { orchestrator, dashboardServer } = createCradle(config, { rootDir: process.cwd() })`, then the existing start, callback and shutdown logic unchanged.
- Test:
  - `tests/orchestrator-factory.test.ts`: `cradle.orchestrator` resolves and `cradle.dashboardServer` shares its observer.
  - The dashboard-server tests, if any construct it.

- [ ] **Step 1: Write the test.** Run it. Expected: FAIL.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the gate.** Expected: green.
- [ ] **Step 4: Commit:** `Resolve the orchestrator and dashboard server from the cradle`.

---

### Task 12: Docs and the completeness sweep

**Files:**
- Modify:
  - `AGENTS.md`: § How it works and § Adding a DI service. The steps become: deps object of cradle tokens; add to the right cradle type; register with `wiring<…>().service(X)` in the registration object of that cradle; tests construct `X` directly.
  - `docs/dev-doc/dependency-injection.md`, rewritten for the current shape:
    - helpers;
    - cradle types per scope;
    - lifetimes;
    - positional test overrides;
    - why data-source scopes are built outside resolution.
  - `docs/dev-doc/data-source-registration.md`: the new factory signature and scope.
  - `docs/conventions/stack-profile.md:75-81`.
  - `.claude/rules/testing.md`.
  - `.claude/skills/test-patterns/SKILL.md`.
  - `.claude/skills/task-failure-diagnosis/references/code-paths.md`.
  - Every file in spec § Refactoring "doc files", plus the Task 0 addendum §5 list.
  - `ARCHITECTURE.md`.
  - `src/prompt/prompt-builder.ts:35` (the stale JSDoc example).
  - `shared/skills/domain/*/references/examples.md` (stale positional constructors).
  - `.ai/refactoring/001-awilix-single-wiring/README.md` (Phase 7: the current shape, against the code).

- [ ] **Step 1: Run the spec's three completeness `git grep` commands** (spec § Verification). Expected: no output. Fix every hit, or name it as a deliberate exception in the commit message.
- [ ] **Step 2: Grep every old class, token and path name** from Tasks 2–11 as raw text over the whole tree, excluding `containment/`. Expected: no hits outside git history.
- [ ] **Step 3: Rewrite the docs listed above.**
- [ ] **Step 4: Run the gate and compare against `baseline.md`.** The test count is equal or higher, except for the named deletions.
- [ ] **Step 5: Negative proof, by hand and not committed.** Delete one entry from the root registrations; `npx tsc` fails, naming the missing token. Restore it.
- [ ] **Step 6: Commit:** `Document the single awilix wiring style`.
