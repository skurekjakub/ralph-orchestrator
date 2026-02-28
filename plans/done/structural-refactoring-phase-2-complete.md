## Phase 2 Complete: Deduplicate CLI Executor exec() Logic

Extracted the identical `exec()` try/catch block and `killActive()` method from both `CopilotExecutor` and `ClaudeCodeExecutor` into shared utility functions in `shared-exec.ts`. Both executors now delegate to `executeCliCommand()` and `killActiveProcess()`. No behavior changes — same StreamCapture, error handling, and process tracking.

**Files created/changed:**
- src/container/cli-executors/shared-exec.ts (NEW)
- src/container/cli-executors/copilot-executor.ts
- src/container/cli-executors/claude-code-executor.ts
- tests/container/cli-executors/shared-exec.test.ts (NEW)

**Functions created/changed:**
- `executeCliCommand()` (new) — shared try/catch with StreamCapture and ExecaError handling
- `killActiveProcess()` (new) — shared SIGTERM + null-out logic
- `CopilotExecutor.exec()` — delegates to executeCliCommand
- `CopilotExecutor.killActive()` — delegates to killActiveProcess
- `ClaudeCodeExecutor.exec()` — delegates to executeCliCommand
- `ClaudeCodeExecutor.killActive()` — delegates to killActiveProcess

**Tests created/changed:**
- +8 new tests for shared-exec functions
- All 15 existing container-cli tests pass unchanged

**Review Status:** APPROVED

**Git Commit Message:**
```
refactor: extract shared CLI exec and kill logic from executors

- Create shared-exec.ts with executeCliCommand() and killActiveProcess()
- CopilotExecutor and ClaudeCodeExecutor delegate to shared functions
- Remove duplicated ExecaError/StreamCapture handling from both executors
- Add 8 new tests for shared exec/kill functions
```
