# Dependency Injection — Ralph Orchestrator

The orchestrator is wired through one awilix container, `InjectionMode.PROXY` with `strict: true`, and its scopes. Every registration is checked against a cradle type at compile time, so a renamed constructor key, a missing registration or a mistyped token fails `tsc` instead of throwing `AwilixResolutionError` on the first task.

## Pattern

Every service class registered in a cradle has a corresponding `I`-prefixed interface defined **in the same file** as the implementation:

```typescript
// src/datasource/connectors/jira/jira-client.ts
export interface IJiraClient {
  searchIssues(jql: string, pageSize?: number): Promise<JiraIssue[]>;
  addComment(key: string, bodyText: string): Promise<void>;
  // ...
}

export class JiraClient implements IJiraClient {
  // ...
}
```

## Rules

1. **Consumers depend on the interface**, never the concrete class. Constructor deps, cradle entries and function arguments use `IJiraClient`, `ITaskRunner`, etc.
2. **The registration objects are the composition root.** `src/awilix-cradle.ts` holds the root, task and stage registrations; a data-source connector's `factory.ts` holds its own. Service code imports only the `I`-prefixed interfaces. Code that constructs concrete classes outside a registration:
   - `src/index.tsx` and the scripts build `AppStartup`, which runs before the root container exists.
   - The `heartbeat` factory builds a `HeartbeatSender` only when the dashboard is enabled, and resolves `null` otherwise: awilix has no conditional registration.
   - `createCliRuntimeRegistry(claudeAuth)` (`src/cli/supported-runtimes.ts`) builds the `CliRuntimeRegistry` over `ClaudeCodeRuntime` and `CopilotRuntime`, immutable strategy values. The root registers its result as `cliRuntimes`; `AppStartup` builds its own for startup profile setup.
   - `scripts/lookup-users.ts` builds one `JiraClient` with `consoleLogger`: a one-shot script that never builds the root container.
   - Value and state holders (`StreamCapture`, the output decoders, `AgentCatalog`, `ClaudeSessionIds`), `OrchestratorObserver` (its constructor takes a closure over the orchestrator's loop state) and error classes are built by the code that owns them.
3. **Stateless logic is a module function, not a service.** Code that holds no state beyond a fixed root directory or constants is a function (`resolveComposeFiles`, `registerLogSources`, `loadAgentCatalog`, `writeJitMcpConfig`, `renderStageSkills`) or a module object implementing an interface (`claudeAgentWriter`, `copilotAgentWriter`, `adoVcsSourceProviderClient`, `githubVcsSourceProviderClient`). Its callers import it; their tests `vi.mock` its module.
4. **No re-exports.** If a consumer needs the interface, import it directly from the file that defines it. Never re-export interfaces through barrel files or intermediaries.

Known exceptions: `PromptBuilder` has no interface; `OrchestratorCradle.promptBuilder` and `AgentSessionRunner` use the class type. `Orchestrator` and `DashboardServer` have none either, so `OrchestratorCradle.orchestrator` and `dashboardServer` use their classes, and `DashboardServer` takes its `orchestrator` dep as `Pick<Orchestrator, "observer">`.

## Why Interfaces, Not Classes?

TypeScript classes carry **private member identity**. A plain object (like a test mock) can never satisfy a class type that has `private` or `#private` fields — even if it implements every public method with the correct signature.

Interfaces strip this identity. `Mocked<IFoo>` (the custom mapped type in `tests/helpers/mocks.ts`, which maps every method to a `vi.fn()` spy) is structurally assignable to `IFoo` without casts:

```typescript
// ✅ Works — Mocked<ITaskRunner> satisfies ITaskRunner
const runner: Mocked<ITaskRunner> = createMockTaskRunner();

// ❌ Fails — Mocked<TaskRunner> won't satisfy TaskRunner (private fields missing)
const runner: Mocked<TaskRunner> = createMockTaskRunner(); // type error
```

This eliminates `as any` casts in tests and ensures mocks are type-safe.

## Registration Helpers

`src/di/registration.ts` wraps awilix's resolvers in checks against a cradle type `C`:

- **`wiring<C>().service(Ctor)`** is `asClass(Ctor)`, and fails `tsc` unless `C` provides every key of the constructor's deps object with a compatible type. An optional deps key counts: `C` must provide it too. Any constructor parameter after the deps object must be optional, since PROXY passes only the cradle. The error names the keys, for example `"deps the cradle does not provide": { profile: IAgentProfile }`.
- **`wiring<C>().factory(fn)`** is `asFunction(fn)`, where `fn`'s parameter is `C` itself, so reading a key `C` lacks fails `tsc`.
- **`Registrations<C>`** maps every token of `C` to a resolver of its type. A registration object typed with it fails `tsc` when it misses a token or holds an extra one. Each registration site types its object as `Registrations<Omit<Cradle, …>>`, omitting the tokens registered elsewhere, so completeness holds per site.
- **`asValues(values)`** registers each own property of a plain object as a value under its name. The scope openers pass it a typed values object (`TaskValues`, `ClaudeStageValues`, …), so `tsc` demands every value a scope opens with.

Neither `service` nor `factory` sets a lifetime: each registration picks one (see Lifetimes).

## Containers and Cradles

Each container has a cradle type in `src/awilix-cradle-types.ts`. A scope's cradle is its parent's plus the values it opens with and the tokens resolved only inside it.

| Container                                        | Cradle                                                              | Opened by                                  | Adds                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root                                             | `OrchestratorCradle`                                                | `createRootContainer(config, { rootDir })` | `rootDir`, `sourceReposDir`, the config slices, `vcsProviderClients`, the services and `connectors` / `pollers`                                                  |
| Data source, one per `dataSources` entry         | `DataSourceCradle`, extended by each connector (`JiraSourceCradle`) | `buildDataSourceMaps(container, config)`   | `sourceKey`, `dataSourceConfig`; the connector's own registrations                                                                                               |
| Task                                             | `TaskCradle`                                                        | `openTaskScope(container, values)`         | `TaskValues` (`profile`, `workspacePath`); `composeFiles`, `squidConfPath`, `compose`, `containerLogs`, `workspaceCleaner`, `containerManager`, `stageExecutors` |
| Container stage, child of a task scope           | `ClaudeStageCradle`, `CopilotStageCradle`                           | `stageExecutors.create`                    | `StageValues` (`stage`, `stageProfile`, `runtime`); Claude Code adds `agentName` and `subagentDepth`; the executor token                                         |
| Host stage, child of the root or of a task scope | `ClaudeHostStageCradle`, `CopilotHostStageCradle`                   | `createHostStageExecutor(parent, …)`       | `HostStageValues` (`StageValues`, `workspace`, `binary`); Claude Code adds `agentName`, `subagentDepth`, `hooksDir` and `subagents`; the executor token          |

- **Config slices** (`dataSources`, `outputConfig`, `dashboardConfig`, `profiles`, `promptAuditConfig`, `ralphchivesConfig`, `enableContinuation`, `claudeAuth`) stand in for a monolithic `IAppConfig`, so each service declares exactly the slices it reads.
- **One stage cradle per executor kind**, because the per-stage values differ by CLI: a Copilot stage loads no agent catalog, so its cradle has no `agentName`.
- **Host stage cradles name no task token**, so either parent serves: a post-task hook stage opens from the root, after teardown, when no task scope exists (`containerFactory.createLocalSession`); a variant's `mode: "local"` stage opens from its task scope (`stageExecutors.createHost`).

## The Root Container

`createRootContainer(config, { rootDir })` in `src/awilix-cradle.ts` is the one entry point. `src/index.tsx`, `scripts/run-agent.ts` and `scripts/run-hooks.ts` call it with `rootDir: process.cwd()` and take its `.cradle`; the tests pass a fixture checkout. In order, it:

1. registers the root through one `Registrations<Omit<OrchestratorCradle, "connectors" | "pollers">>` object:
   - `rootDir`, `sourceReposDir`, `vcsProviderClients` and the config slices with `asValue(...)`;
   - services with `w.service(X).singleton()`, `w` being `wiring<OrchestratorCradle>()`, `orchestrator` and `dashboardServer` among them;
   - with `w.factory(...).singleton()`: the two loggers (made by `activityLog`), `cliRuntimes` and `heartbeat`;
   - `containerFactory` with `asValue(createContainerManagerFactory(container))`;
2. calls `registerScopedServices(container)`, which registers the task registrations and the four stage registration objects at the root, every one `.scoped()`: they resolve only in a task or stage scope;
3. builds the data-source maps with `buildDataSourceMaps(container, config)` (see Data-Source Scopes) and registers `connectors` and `pollers` with `asValue(...)`.

Root services resolve on first access, except `activityLog` and `logger`, which the data-source scopes resolve while `createRootContainer` runs.

## Task and Stage Scopes

`containerFactory` (`src/container/container-manager-factory.ts`) implements `ContainerManagerFactory`:

- **`create(profile, workspacePath)`** opens a task scope with `openTaskScope` and resolves its `containerManager`. `openTaskScope`:
  - registers the task's `profile` and `workspacePath` as values;
  - resolves `compose` and registers the result in the task scope as a value, so every stage scope of the task shares that one compose client;
  - registers `stageExecutors`, `createStageExecutorFactory(scope)` (`src/container/stage-executor-factory.ts`).
- **`forceDown(profile)`** opens a task scope whose workspace is the workspaces directory and runs `docker compose down` through its `compose`, with no manager.
- **`createLocalSession(profile, stage, workspace)`** resolves a post-task hook stage's executor in a host stage scope of the root and returns it with the root `sessionRunner`.

`ContainerManager.createExecutorForStage` asks `stageExecutors` for each stage's executor. `create` opens a container stage scope of the task scope; `createHost` opens a host stage scope of it. Each switches on `stage.cli` and resolves the executor of that kind. A Claude Code stage loads the profile's agent catalog first, for the stage root's frontmatter name and the depth of its subagent graph.

## Data-Source Scopes

`buildDataSourceMaps` (`src/datasource/registry.ts`) opens one scope of the root per `dataSources` entry, holding its `sourceKey` and `dataSourceConfig`, and calls the factory registered for the entry's `type` with it. The factory registers its own classes in the scope with its own `Registrations` object, every one `.scoped()`, and resolves the connector and poller there. `docs/dev-doc/data-source-registration.md` has the factory guide.

The maps are built outside any resolution of the root, then registered as values, instead of as a root singleton factory. A scope shares its parent's resolution stack, and strict mode refuses a scoped registration while a longer-lived one is on that stack: resolving the data-source scopes inside a `connectors` singleton throws `Dependency 'connector' has a shorter lifetime than its ancestor: 'connectors'`. A factory's own error, such as the one `resolveJiraCredentials` throws for an unset `JIRA_PAT_<KEY>`, reaches `createRootContainer`'s caller unchanged.

## Lifetimes

- **Root registrations** are `.singleton()`, values `asValue(...)`.
- **Every registration resolved inside a scope is `.scoped()`, factories included.** `asClass` and `asFunction` default to transient, and strict mode refuses a transient dependency of a scoped service. A singleton never sees a scope's values either: in strict mode it resolves its deps from the root.
- **A scope's own inputs are values**, registered when the scope opens (`asValues`). Values pass strict mode's lifetime check in any container.
- **`.singleton()` on a scope throws** in strict mode: `Cannot register a singleton on a scoped container.`
- **A scoped registration caches in the scope that resolves it**, not in the one that registered it. The task registrations live at the root and cache in each task scope. A stage scope resolving `compose` itself would build a second compose client, which is why `openTaskScope` pins its own as a value.
- **Scopes open in plain functions**, never inside a registration's factory: `openTaskScope`, `createStageExecutorFactory`, `createHostStageExecutor`, `buildDataSourceMaps`. A scoped registration resolved while a root singleton resolves fails the lifetime check above.

## Constructors in PROXY Mode

In `InjectionMode.PROXY`, awilix passes the cradle proxy to the constructor as a **single object argument**. The proxy resolves each property on access. Constructors therefore take one destructured deps object whose keys are cradle tokens:

```typescript
// Won't work with PROXY mode — positional args can't be mapped to registrations
constructor(logger: Logger, ledger: IOperationLedger)

// Works — the proxy resolves `logger` and `ledger` from the cradle
constructor({ logger, ledger }: { logger: Logger; ledger: IOperationLedger })
```

- **Reading a key the cradle lacks throws** `AwilixResolutionError` (`Could not resolve 'maxLines'.`), optional key or not, so `service` rejects such a key at compile time.
- **Test-only overrides are optional second positional parameters.** PROXY passes only the cradle, so in production they keep their defaults: `ActivityLog`'s `maxLines`, `ProfileRouter`'s `fetchComments`, `JiraClient`'s `retryOptions`, `HookRulesRedactor`'s `env`, `DashboardServer`'s `port`.
- **A dep key is the token's name**, not a local alias: an executor reads `stageProfile` and `containerLogger`, `ContainerManager` reads `containerLogs`, `workspaceCleaner` and `stageExecutors`. Where two tokens share a type (`profile` and `stageProfile`, `logger` and `containerLogger`), a wrong key still type-checks; the tests that resolve each executor from a stage scope where the two differ catch it.

## Adding a New Service

1. Decide which container it lives in: the root for app-wide services, the task scope for one task's container stack, a stage scope for one stage's executor, a data-source scope for a connector's classes.
2. Define the `I`-prefixed interface and the implementation class in the same file. The constructor takes a single destructured deps object whose keys are tokens of that container's cradle. Depend on interfaces and config slices, never on the whole `IAppConfig`. Test-only overrides go in an optional second positional parameter.
3. Add the token to that cradle type in `src/awilix-cradle-types.ts` (or the connector's own cradle type in its `factory.ts`).
4. Register it in that cradle's registration object with `wiring<…>().service(Foo)`: `.singleton()` at the root, `.scoped()` in a scope. `tsc` then rejects the registration until the cradle provides every dep, and the object until it holds the token.
5. Tests construct the class directly with mocks, not through a container. When more than one suite needs a mock of it, add a `createMock<Service>()` factory in `tests/helpers/mocks.ts` returning `Mocked<IService>`.
6. For a root, task or stage token, add its expected class to `tests/orchestrator-factory.test.ts`, which resolves every root, task and stage token under strict mode against a fixture checkout (`tests/helpers/fixture-checkout.ts`). Its expectation tables are typed by the cradle types, so `tsc` asks for the entry.
