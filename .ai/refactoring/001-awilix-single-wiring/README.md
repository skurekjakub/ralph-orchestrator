# Awilix single wiring

Every service the orchestrator runs is built by one awilix container, through registrations the compiler checks against the cradle types. This README describes the code as it stands; `spec.md` holds the design argument and its corrections, `plan.md` the task sequence, `baseline.md` the starting gate.

## Containers and scopes

| Container | Cradle type (`src/awilix-cradle-types.ts`) | Opened by | Holds |
| --- | --- | --- | --- |
| root | `OrchestratorCradle` | `createRootContainer(config, { rootDir })` (`src/awilix-cradle.ts`) | config slices, `rootDir`, loggers, every singleton service, `containerFactory`, `orchestrator`, `dashboardServer`, `connectors`, `pollers` |
| data source | `DataSourceCradle` (JIRA: `JiraSourceCradle` in `src/datasource/connectors/jira/factory.ts`) | `buildDataSourceMaps(container, config)` (`src/datasource/registry.ts`), outside any resolution | the entry's key and config; the connector's own scoped classes |
| task | `TaskCradle` | `openTaskScope(container, values)` (`src/container/container-manager-factory.ts`) | `profile`, `workspacePath`, `composeFiles`, `squidConfPath`, `compose` (pinned as a value), `containerLogs`, `workspaceCleaner`, `containerManager`, `stageExecutors` |
| container stage | `ClaudeStageCradle`, `CopilotStageCradle` | `createStageExecutorFactory(taskScope)` (`src/container/stage-executor-factory.ts`) | the stage's values and its executor |
| host stage | `ClaudeHostStageCradle`, `CopilotHostStageCradle` | `createHostStageExecutor(parent, …)`: from the task scope for a variant's `mode: "local"` stage, from the root for a post-task hook | the stage's values, binary and workspace, and its executor |

- Scoped registrations live at the root (`registerScopedServices`) and cache in the scope that resolves them, so each task and each stage gets its own instances.
- `openTaskScope` resolves `compose` once and registers it back as a value, so every stage of a task execs through one `ComposeClient`.
- Each stage kind has its own cradle because the per-stage values differ: a Copilot container stage loads no agent catalog, and host stages have no task scope when they run as post-task hooks.

## Compile-time checks (`src/di/registration.ts`)

- `wiring<C>().service(Ctor)` fails `tsc` when the constructor's deps object names a key cradle `C` lacks or types differently, optional keys included.
- `Registrations<C>` maps every token of `C` to a resolver, so each registration object fails `tsc` on a missing or extra token.
- `asValues(values)` returns a value registration per property; the scope openers take typed `values`, so every per-scope value is forced.
- The few literal `register` calls (`connectors`/`pollers`, the task scope's `compose` pin and `stageExecutors`) carry `satisfies Registrations<Pick<…>>`.
- `tsc` cannot see a wrong lifetime, a deleted line inside a scoped group, or a deps key swapped for another token of the same type; the all-token test and the stage executors' rename-guard tests cover those.
- `tests/di/registration.test.ts` holds the `@ts-expect-error` cases; `tests/orchestrator-factory.test.ts` resolves every root, task and stage token under strict mode against a fixture checkout.

## awilix 13 rules the wiring follows

- A deps-object key that is not a token throws under PROXY strict, even when optional: test-only overrides are optional second positional parameters (`ActivityLog`'s `maxLines`, `ProfileRouter`'s `fetchComments`, `JiraClient`'s `retryOptions`, `HookRulesRedactor`'s `env`, `DashboardServer`'s `port`).
- A scoped resolve from inside a root singleton fails the lifetime check: scopes open in plain functions, and the data-source maps are built after the root registers, then registered as values.
- `.singleton()` on a scope throws; every scope-level registration is `.scoped()`.
- `asFunction` defaults to transient: every `factory(...)` sets its lifetime.

## Module functions

Stateless classes are plain functions or objects: `resolveComposeFiles`, `registerLogSources`, `loadAgentCatalog`, `writeJitMcpConfig`, `renderStageSkills`, `claudeAgentWriter`, `copilotAgentWriter`, `adoVcsSourceProviderClient`, `githubVcsSourceProviderClient`.

## Construction outside the container

- `scripts/lookup-users.ts` builds one `JiraClient` with `consoleLogger`, as scripts do. It and `scripts/reset-issue.ts` read a data source's JIRA connection and credentials through `resolveJiraConnection`, as the JIRA factory does.
- `HeartbeatSender` is built inside the `heartbeat` factory, which returns `null` when the dashboard is off.
- The CLI runtimes and their registry are strategy values made by `createCliRuntimeRegistry`.
- Tests construct classes directly with mocks.

## Diagrams and definition of done

`.ai/diagrams/` and `.ai/dod/` hold no diagram or checklist for this surface.

## Reference

- Developer guide: `docs/dev-doc/dependency-injection.md`.
- Adding a service: `AGENTS.md` § Adding a DI service.
