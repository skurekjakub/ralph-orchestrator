## Phase 3 Complete: ContainerManager DI — Move Concrete Instantiation to Factory

Eliminated `ContainerManager`'s role as a second composition root. All 6 concrete `new` calls moved to `orchestrator-factory.ts`. The constructor now accepts pre-built collaborators via interface injection. Squid path resolution unified into a single `buildComposeClient()` helper. Dedicated test suite created with 16 tests using mocked collaborators.

**Files created/changed:**
- src/container/manager.ts
- src/container/log-collector.ts
- src/container/workspace-cleaner.ts
- src/container/log-source-registry.ts
- src/orchestrator-factory.ts
- tests/container/manager.test.ts (NEW)
- tests/container/continuation-loop.test.ts

**Functions created/changed:**
- `IContainerLogCollector` interface (new) in log-collector.ts
- `IContainerWorkspaceCleaner` interface (new) in workspace-cleaner.ts
- `ContainerManager` constructor — old: `(profile, appConfig, promptBuilder, executorFactory, logger?, containerLogger?)` → new: `(profile, compose, executor, logs, cleaner, logRegistry, continuationRunner, promptBuilder, logger, containerLogger?)`
- `buildComposeClient(profile)` (new) in orchestrator-factory.ts — deduplicates squid path resolution
- `LogSourceRegistry.registerAll` — logs param changed to `IContainerLogCollector`

**Tests created/changed:**
- +16 new tests in manager.test.ts (checkPrerequisites, start, setup, execInApp, registerLogSources, execute x3, stop x2, cliPaths, logs, cleaner)
- Updated continuation-loop.test.ts for new DI constructor

**Review Status:** APPROVED

**Git Commit Message:**
```
refactor: inject ContainerManager collaborators via constructor

- Remove 6 concrete new calls from ContainerManager constructor
- Accept pre-built IComposeClient, ICliExecutor, IContainerLogCollector,
  IContainerWorkspaceCleaner, ILogSourceRegistry, IContinuationRunner
- Extract buildComposeClient() helper to deduplicate squid path resolution
- Add IContainerLogCollector and IContainerWorkspaceCleaner interfaces
- Create dedicated ContainerManager test suite with 16 tests
```
