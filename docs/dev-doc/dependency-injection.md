# Dependency Injection — Ralph Orchestrator

## Pattern

Every service class registered in the awilix cradle has a corresponding `I`-prefixed interface defined **in the same file** as the implementation:

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

1. **Consumers depend on the interface** — never the concrete class. All constructor parameters, `OrchestratorCradle` entries, and function arguments use `IJiraClient`, `ITaskRunner`, etc.

2. **The cradle factory is the composition root for services** — `src/awilix-cradle.ts` imports the concrete service classes (`TaskRunner`, `OperationLedger`, …) and registers them with awilix. Service code imports only the `I`-prefixed interfaces. Code outside the cradle that constructs concrete classes:
   - `src/index.tsx` wires the top level: `AppStartup`, `Orchestrator` (`new Orchestrator(cradle)`, not registered in the cradle) and `DashboardServer`.
   - Data source connector factories register their own classes in the data source's awilix scope and resolve the connector and poller there (`src/datasource/connectors/jira/factory.ts` registers `JiraClient`, `JiraConnector`, `JiraWorkItemPoller`; see `docs/dev-doc/data-source-registration.md`).
   - `createCliRuntimeRegistry(claudeAuth)` (`src/cli/supported-runtimes.ts`) builds the `CliRuntimeRegistry` over `ClaudeCodeRuntime` and `CopilotRuntime`. The cradle registers its result as `cliRuntimes`; `AppStartup` builds its own for startup profile setup and calls `loadAgentCatalog` with its own root directory.
   - `*Factory` classes and the per-task container factory build their products. `CliExecutorFactory` creates the container executors (`ClaudeCodeExecutor`, `CopilotExecutor`) and the host executors (`LocalClaudeCodeExecutor`, `LocalCopilotExecutor`). `buildContainerFactory` in `awilix-cradle.ts` returns a `ContainerManagerFactory`: `create` builds a `ContainerManager` and its per-task collaborators (`ComposeClient`, `ContainerLogCollector`, `ContainerWorkspaceCleaner`, `ContinuationRunner`, `AgentSessionRunner`), `createLocalSession` builds a host stage's executor and session runner for `PostTaskHookRunner`, and `forceDown` tears a profile's stack down without a manager.

3. **No re-exports** — if a consumer needs the interface, import it directly from the file that defines it. Never re-export interfaces through barrel files or intermediaries.

Known exception: `PromptBuilder` has no interface; `OrchestratorCradle.promptBuilder` and `AgentSessionRunner` use the class type.

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

## OrchestratorCradle

The `OrchestratorCradle` interface (defined in `src/awilix-cradle-types.ts`) is the type of the awilix container cradle. It contains all config slices and service interfaces:

```typescript
interface OrchestratorCradle {
  // Config slices
  dataSources: Readonly<Record<string, IDataSourceConfig>>;
  outputConfig: IOutputConfig;
  dashboardConfig: IDashboardConfig;
  profiles: readonly IAgentProfile[];
  promptAuditConfig: IPromptAuditConfig;
  ralphchivesConfig: IRalphchivesConfig;
  enableContinuation: boolean;
  claudeAuth: ClaudeAuthMode;

  // Infrastructure
  activityLog: IActivityLog;
  logger: Logger;
  containerLogger: Logger;

  // Data sources — per-source maps keyed by data source name
  connectors: ReadonlyMap<string, IDataSourceConnector>;
  pollers: ReadonlyMap<string, IWorkItemPoller>;

  // Services
  issueManager: IIssueManager;
  resources: IResourceManager;
  vcsSourceClient: IVcsSourceClient;

  // Orchestration
  ledger: IOperationLedger;
  router: IProfileRouter;
  triggerScanner: ITriggerScanner;

  // Execution infrastructure
  cliRuntimes: ICliRuntimeRegistry;
  logCollector: ILogCollector;
  promptBuilder: PromptBuilder;
  executorFactory: ICliExecutorFactory;
  templateRenderer: IAgentTemplateRenderer;
  overlayWriter: IComposeOverlayWriter;
  containerFactory: ContainerManagerFactory;
  workspaceManager: ITaskWorkspaceManager;
  stageWorkspaces: IStageWorkspaceResolver;
  profileSetup: IProfileSetupService;
  pipelineExecutor: IAgentPipelineExecutor;

  // Task runner
  textRedactor: ITextRedactor;
  runArtifacts: IRunArtifactsDeriver;
  resultWriter: ITaskResultWriter;
  hookRunner: IPostTaskHookRunner;
  taskRunner: ITaskRunner;

  // Optional
  heartbeat: IHeartbeatSender | null;
}
```

`createCradle(config, { rootDir })` in `awilix-cradle.ts` builds the container with `InjectionMode.PROXY` and `strict: true`. It registers the root tokens below, then builds the `connectors` and `pollers` maps with `buildDataSourceMaps(container, config)`, which runs the registered data source factories in one scope per data source, and registers both maps with `asValue(...)`. The root tokens are:

- config slices with `asValue(...)`
- service classes with `asClass(X).singleton()`
- values that need custom construction with `asFunction(...)` — the two loggers (created by `activityLog`), `vcsSourceClient`, `cliRuntimes` (`createCliRuntimeRegistry(claudeAuth)`), `executorFactory`, `stageWorkspaces` and `workspaceManager` (which take the orchestrator checkout, the `rootDir` token, or the `sourceReposDir` token under it), `containerFactory` (`buildContainerFactory`), `textRedactor` (`HookRulesRedactor`), and `heartbeat` (`null` unless the dashboard is enabled)

The orchestrator and all services destructure their dependencies from the cradle — they never know which classes were instantiated.

## Constructors in PROXY Mode

In `InjectionMode.PROXY`, awilix passes the cradle proxy to the constructor as a **single object argument**. The proxy resolves each property on access. Constructors therefore take one destructured options object whose keys match cradle registration names:

```typescript
// Won't work with PROXY mode — positional args can't be mapped to registrations
constructor(logger: Logger, ledger: IOperationLedger)

// Works — the proxy resolves `logger` and `ledger` from the cradle
constructor({ logger, ledger }: { logger: Logger; ledger: IOperationLedger })
```

Because constructor keys match registration names, `asClass(X)` wires a class without a hand-written factory. Use `asFunction` only when construction needs logic the cradle can't express (a derived value, a conditional `null`, or a per-call factory).

Configuration is split into **config slices** rather than a monolithic `IAppConfig`, so each service declares exactly the slices it reads and the constructor signature documents its dependencies.

## Adding a New Service

1. Define the `I`-prefixed interface and the implementation class in the same file. The constructor takes a single destructured deps object whose keys are cradle names. Depend on interfaces and config slices, never on the whole `IAppConfig`.
2. Add the interface to `OrchestratorCradle` in `src/awilix-cradle-types.ts` (if other services need it).
3. Import the concrete class **only** in `awilix-cradle.ts` and register it with `asClass(...).singleton()`.
4. Tests construct the class directly with mocks, not through the cradle. When more than one suite needs a mock of it, add a `createMock<Service>()` factory in `tests/helpers/mocks.ts` returning `Mocked<IService>`.
