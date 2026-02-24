## Phase 1 Complete: Extract CLI Paths into CliPaths Interface

Removed concrete `CopilotExecutor` imports from `TaskRunner` and `LogSourceRegistry` by introducing a `CliPaths` interface. Both CLI executors now expose their filesystem paths via the `ICliExecutor.paths` property, and CLI-agnostic consumers read paths through `IContainerManager.cliPaths`.

**Files created/changed:**
- src/container/types.ts
- src/container/cli-executors/copilot-executor.ts
- src/container/cli-executors/claude-code-executor.ts
- src/container/manager.ts
- src/container/log-source-registry.ts
- src/container/cli-executor-factory.ts
- src/services/task-runner.ts
- tests/helpers/mocks.ts
- tests/container/container-cli.test.ts
- tests/container/log-source-registry.test.ts

**Functions created/changed:**
- `CliPaths` interface (new) in types.ts
- `ICliExecutor.paths` property added
- `IContainerManager.cliPaths` property added
- `CopilotExecutor.paths` property (new)
- `ClaudeCodeExecutor.paths` property (new)
- `LogSourceRegistry.registerAll()` — now accepts `CliPaths` param
- `TaskRunner.run()` — uses `container.cliPaths` instead of static imports

**Tests created/changed:**
- +2 new tests: CopilotExecutor.paths, ClaudeCodeExecutor.paths
- Updated all LogSourceRegistry tests to pass CliPaths
- Updated TaskRunner mock container to include cliPaths

**Review Status:** APPROVED

**Git Commit Message:**
```
refactor: extract CliPaths interface from CLI executor statics

- Define CliPaths interface for CLI-specific filesystem paths
- Add paths property to ICliExecutor, implemented by both executors
- Expose cliPaths on IContainerManager for CLI-agnostic consumers
- Remove concrete CopilotExecutor imports from TaskRunner and LogSourceRegistry
- Add 2 new tests for executor paths, update existing tests
```
