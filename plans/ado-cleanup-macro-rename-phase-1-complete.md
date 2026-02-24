## Phase 1 Complete: Remove `ado_create_pr` + Extract Git Helper

Deleted the redundant combined push+PR tool and extracted the shared git stage/commit/push pattern into a reusable helper function.

**Files created/changed:**
- `shared/mcp-servers/ado/src/shared.ts` — added `gitStageCommitPush()` helper
- `shared/mcp-servers/ado/src/tools/push-progress.ts` — refactored to use `gitStageCommitPush()`
- `shared/mcp-servers/ado/src/tools/create-pr.ts` — deleted
- `shared/mcp-servers/ado/src/index.ts` — removed `createPr` import and tools array entry
- `shared/mcp-servers/ado/mcp-server.json` — removed `ado_create_pr` from tools list
- `MCP.md` — removed `ado_create_pr` from server tools table

**Functions created/changed:**
- `gitStageCommitPush(message, project, repo, branch)` — new helper in shared.ts
- `push-progress.ts` handler — simplified to use new helper

**Tests created/changed:**
- `shared/mcp-servers/ado/tests/server.test.ts` — updated tool count (7→6), removed `ado_create_pr` references

**Review Status:** APPROVED

**Git Commit Message:**
```
chore: remove redundant ado_create_pr tool and extract git helper

- Delete ado_create_pr combined push+PR tool (agents use ado_push_progress + ado_create_pull_request separately)
- Extract gitStageCommitPush() helper into shared.ts for reuse
- Refactor push-progress.ts to use the new helper
- Update mcp-server.json tool list and MCP.md documentation
```
