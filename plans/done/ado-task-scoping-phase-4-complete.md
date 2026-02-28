## Phase 4 Complete: push_progress + create_pr Tools

Added two new git-powered tools (`ado_push_progress`, `ado_create_pr`) to the ADO MCP server. The tools exec git commands inside the sidecar container using the `gitExec` helper, which authenticates via ADO PAT and sanitizes credentials from error messages.

**Files created/changed:**
- shared/mcp-servers/ado/src/tools/push-progress.ts (NEW)
- shared/mcp-servers/ado/src/tools/create-pr.ts (NEW)
- shared/mcp-servers/ado/src/shared.ts
- shared/mcp-servers/ado/src/index.ts
- shared/mcp-servers/ado/mcp-server.json
- shared/mcp-servers/ado/tests/server.test.ts

**Functions created/changed:**
- `gitExec()` — exec git with authenticated remote URL, PAT sanitization
- `ado_push_progress` tool — stage all, commit, push to task branch
- `ado_create_pr` tool — push then create PR via ADO REST API

**Tests created/changed:**
- ADO MCP Server git tools: 6 tests (tool definitions, REPO_ROOT, gitExec, GIT_TERMINAL_PROMPT, force-with-lease, PAT sanitization)
- Updated tool count assertions (5→7)

**Review Status:** APPROVED

**Git Commit Message:**
See plan-complete for combined commit.
