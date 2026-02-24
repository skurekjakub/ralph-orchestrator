## Phase 3 Complete: Lift TaskContext to task-context.ts

Extracted `TaskContext` interface and `buildTaskContext()` from `TaskRunner` into a new `src/services/task-context.ts` module. Updated `ITaskRunner.run()` to accept a pre-built `TaskContext`, and moved context construction to the orchestrator's `runTask()`. All 817 tests passing, lint clean.

**Files created/changed:**
- src/services/task-context.ts (NEW)
- tests/services/task-context.test.ts (NEW)
- src/services/task-runner.ts
- src/orchestrator.ts
- tests/helpers/factories.ts
- tests/helpers/mocks.ts
- tests/services/task-runner.test.ts
- tests/orchestrator/e2e-helpers.ts
- tests/orchestrator/orchestrator-e2e.test.ts

**Functions created/changed:**
- `TaskContext` interface (new export in task-context.ts)
- `buildTaskContext()` (new export in task-context.ts)
- `ITaskRunner.run(ctx: TaskContext)` (signature changed from individual params)
- `TaskRunner.run()` (uses ctx.* throughout)
- `makeTaskContext()` (new test factory)
- `Orchestrator.runTask()` (builds TaskContext before calling run)

**Tests created/changed:**
- tests/services/task-context.test.ts — 5 new unit tests (defaults, triggerParams conversion, revision detection, case-insensitivity, empty revisionStatuses)
- tests/services/task-runner.test.ts — all 22 run() calls updated to use makeTaskContext()/buildTaskContext()
- tests/orchestrator/orchestrator-e2e.test.ts — assertions updated for TaskContext arg
- tests/orchestrator/e2e-helpers.ts — mock run impl updated
- tests/helpers/mocks.ts — createMockTaskRunner mock signature updated

**Review Status:** APPROVED

**Git Commit Message:**
```
refactor: extract TaskContext to dedicated module

- Move TaskContext interface and buildTaskContext() from task-runner.ts to new task-context.ts
- Change ITaskRunner.run() to accept pre-built TaskContext instead of individual params
- Orchestrator now builds context before calling taskRunner.run()
- Add makeTaskContext() test factory and 5 unit tests for buildTaskContext
```
