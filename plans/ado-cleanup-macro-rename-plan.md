## Plan: ADO Tool Cleanup + Macro Rename + TaskContext Lift + Ack Params

Remove the redundant `ado_create_pr` tool, extract a git helper in the ADO MCP server, rename JIRA macros to `$jira.*` prefix, lift `TaskContext` building into a new `task-context.ts` module, include parsed trigger params in the JIRA ack comment, update docs, and audit.

**Phases (7)**

1. **Phase 1: Remove `ado_create_pr` tool + extract git helper**
    - **Objective:** Delete the redundant combined push+PR tool. Extract `gitStageCommitPush()` from `push-progress.ts` into `shared.ts`.
    - **Files/Functions to Modify/Create:**
      - `shared/mcp-servers/ado/src/shared.ts` — add `gitStageCommitPush(message, project, repo, branch)` 
      - `shared/mcp-servers/ado/src/tools/push-progress.ts` — use new helper
      - `shared/mcp-servers/ado/src/tools/create-pr.ts` — delete
      - `shared/mcp-servers/ado/src/index.ts` — remove `create-pr` import and registration
    - **Tests to Write:** N/A (ADO MCP server — validated via type-check)
    - **Steps:**
      1. Add `gitStageCommitPush()` to `shared.ts`
      2. Refactor `push-progress.ts` to use the helper
      3. Delete `create-pr.ts`
      4. Remove import/registration in `index.ts`
      5. `npx tsc --noEmit` in ADO server

2. **Phase 2: Rename JIRA macros to `$jira.*` prefix**
    - **Objective:** Rename `$issueKey`→`$jira.key`, `$issueProject`→`$jira.project`, `$taskBranch`→`$jira.branch`, `$issueSummary`→`$jira.summary`. Hard rename — no backward compat.
    - **Files/Functions to Modify/Create:**
      - `src/container/setup/jit-mcp-params.ts` — update `MACROS` keys + error message
      - `profiles/ralph-docs/profile.json` — update macro references
      - `profiles/ralph-vscode/profile.json` — update macro references
    - **Tests to Write:**
      - Update all existing macro tests in `tests/container/jit-mcp-params.test.ts`
      - Update macro references in `tests/config.test.ts`
    - **Steps:**
      1. Update test expectations first (TDD: red)
      2. Then update `MACROS` record in `jit-mcp-params.ts` (green)
      3. Update profile configs
      4. Run vitest + lint

3. **Phase 3: Lift `TaskContext` into `task-context.ts`**
    - **Objective:** Extract `TaskContext` interface and `buildTaskContext()` to a new `src/services/task-context.ts`. Change `ITaskRunner.run()` to accept `TaskContext`. Orchestrator builds context before calling `run()`.
    - **Files/Functions to Modify/Create:**
      - `src/services/task-context.ts` — new file: export `TaskContext` interface + `buildTaskContext()` function
      - `src/services/task-runner.ts` — import `TaskContext`, remove private `buildTaskContext()`, change `run(ctx: TaskContext)` signature
      - `src/orchestrator.ts` — import `buildTaskContext`, build context, pass to `run()`
      - `src/orchestrator-factory.ts` — if any wiring changes needed
      - `tests/helpers/mocks.ts` — update `createMockTaskRunner` mock signature
      - `tests/helpers/factories.ts` — add `makeTaskContext()` factory
    - **Tests to Write:**
      - `tests/services/task-context.test.ts` — unit tests for `buildTaskContext()` (isRevision logic, triggerParams conversion)
      - Update `tests/services/task-runner.test.ts` — pass `TaskContext` to `run()`
      - Update `tests/orchestrator/orchestrator.test.ts` — verify `run()` called with context
    - **Steps:**
      1. Write `task-context.test.ts` tests first (TDD: red)
      2. Create `task-context.ts` with `TaskContext` + `buildTaskContext()` (green)
      3. Update test `run()` calls to pass `TaskContext` (red)
      4. Change `ITaskRunner.run()` signature + update `TaskRunner` impl (green)
      5. Update orchestrator to build context (green)
      6. Update mock helpers and e2e helpers
      7. Run vitest + lint

4. **Phase 4: Include trigger params in JIRA ack comment**
    - **Objective:** When posting ack, include parsed params on a new line: `Params: codesamples, branch=feature-xyz`
    - **Files/Functions to Modify/Create:**
      - `src/services/orchestrator-comments.ts` — update `ack()` to accept optional `triggerParams: string[]`
      - `src/services/jira-issue-manager.ts` — update `IIssueManager.postAckComment()` + impl
      - `src/services/trigger-scanner.ts` — pass `triggerParams` to `postAckComment()`
    - **Tests to Write:**
      - `tests/services/orchestrator-comments.test.ts` — test ack with/without params (new file if doesn't exist)
      - Update `tests/services/trigger-scanner.test.ts` — verify params forwarded
    - **Steps:**
      1. Write ack comment tests first (TDD: red)
      2. Update `OrchestratorComments.ack()` (green)
      3. Update `IIssueManager` + impl
      4. Update `TriggerScanner` call site
      5. Update scanner tests
      6. Run vitest + lint

5. **Phase 5: Update documentation**
    - **Objective:** Update all docs for macro rename, removed tool, TaskContext, ack params.
    - **Files/Functions to Modify/Create:**
      - `CONFIGURATION.md` — macro table, remove `ado_create_pr` if mentioned
      - `ARCHITECTURE.md` — update if needed
      - `.github/copilot-instructions.md` — macro references
      - `CLAUDE.md` — macro references
      - `MCP.md` — check for references
    - **Steps:**
      1. Search all docs for old macro names, update to `$jira.*`
      2. Search for `ado_create_pr` references
      3. Document ack params behavior

6. **Phase 6: Comprehensive audit**
    - **Objective:** Audit all changes across phases for bugs, edge cases, missing tests, and consistency.
    - **Steps:**
      1. Review all changed files
      2. Run full test suite + lint
      3. Check for stale references to old macro names or deleted tool
      4. Verify documentation consistency
