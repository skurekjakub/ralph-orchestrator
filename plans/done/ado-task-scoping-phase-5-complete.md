## Phase 5 Complete: Container Lifecycle Git Sync

Added a composable lifecycle hook system (`ILifecycleHook`) and a `RepoSyncHook` that runs `git checkout main && git pull` inside the app container before each agent execution. Added `execInApp()` to `IContainerManager` for running commands in the app container.

**Files created/changed:**
- src/container/lifecycle.ts (NEW)
- src/container/manager.ts
- src/services/task-runner.ts
- src/orchestrator-factory.ts
- tests/container/lifecycle.test.ts (NEW)
- tests/services/task-runner.test.ts
- tests/helpers/mocks.ts

**Functions created/changed:**
- `ILifecycleHook` interface — composable pre-execution hook
- `RepoSyncHook` class — git checkout/pull before agent execution
- `execInApp()` — run commands in app container as vscode user
- `TaskRunner` constructor — accepts `preExecuteHooks` parameter

**Tests created/changed:**
- RepoSyncHook: 5 tests (name, checkout/pull order, custom branch, logging, error propagation)
- TaskRunner hooks: 3 tests (ordering, sequential, abort on failure)

**Review Status:** APPROVED
