## Plan Complete: ADO Task-Scoped Branch Restriction & Git Tools

Unified the MCP env var configuration system, extended the ADO server with git-powered tools, added pre-execution lifecycle hooks, and updated sidecar infrastructure. All env configuration now flows uniformly through profile.json `mcpServers` entries with `$macro` runtime resolution, replacing the previous dual-mechanism approach.

**Phases Completed:** 8 of 8
1. ✅ Phase 1: mcpServers Schema Expansion
2. ✅ Phase 2: Branch Naming + JIT Macro Rewrite
3. ✅ Phase 3: ADO Server Task-Scoped Params
4. ✅ Phase 4: push_progress + create_pr Tools
5. ✅ Phase 5: Container Lifecycle Git Sync
6. ✅ Phase 6: Sidecar Infrastructure
7. ✅ Phase 7: Documentation Updates
8. ✅ Phase 8: Audit and Final Validation

**All Files Created/Modified:**
- src/config.ts
- src/container/lifecycle.ts (NEW)
- src/container/manager.ts
- src/container/setup/compose-overlay.ts
- src/container/setup/jit-mcp-params.ts (rewritten)
- src/container/setup/mcp-manifest.ts
- src/orchestrator-factory.ts
- src/services/task-runner.ts
- src/util/branch.ts (NEW)
- src/validate/profiles.ts
- shared/mcp-servers/ado/mcp-server.json
- shared/mcp-servers/ado/src/index.ts
- shared/mcp-servers/ado/src/shared.ts
- shared/mcp-servers/ado/src/tools/create-pr.ts (NEW)
- shared/mcp-servers/ado/src/tools/create-pull-request.ts
- shared/mcp-servers/ado/src/tools/create-pull-request-thread.ts
- shared/mcp-servers/ado/src/tools/list-pull-request-threads.ts
- shared/mcp-servers/ado/src/tools/list-pull-requests.ts
- shared/mcp-servers/ado/src/tools/push-progress.ts (NEW)
- shared/mcp-servers/ado/src/tools/reply-to-comment.ts
- shared/mcp-sidecar/Dockerfile
- shared/mcp-servers/jira-kentico/mcp-server.json
- profiles/ralph-docs/profile.json
- profiles/ralph-vscode/profile.json
- tests/config.test.ts
- tests/container/compose-overlay.test.ts
- tests/container/jit-mcp-params.test.ts
- tests/container/lifecycle.test.ts (NEW)
- tests/container/mcp-manifest.test.ts
- tests/helpers/factories.ts
- tests/helpers/mocks.ts
- tests/services/task-runner.test.ts
- tests/util/branch.test.ts (NEW)
- shared/mcp-servers/ado/tests/server.test.ts
- CONFIGURATION.md
- MCP.md
- ARCHITECTURE.md
- .github/copilot-instructions.md
- CLAUDE.md

**Key Functions/Classes Added:**
- `ILifecycleHook` interface + `RepoSyncHook` class
- `slugifyBranchName()` utility
- `gitExec()` helper with PAT sanitization
- `ado_push_progress` tool
- `ado_create_pr` tool
- `execInApp()` on IContainerManager
- `$macro` resolution system in JitMcpConfigWriter
- `requiredConfig` manifest validation

**Test Coverage:**
- Total tests written: ~43 new tests (780 total, up from ~738)
- All tests passing: ✅

**Recommendations for Next Steps:**
- Consider deprecating `ado_create_pull_request` in favor of the simpler `ado_create_pr`
- Add `TASK_BRANCH` to ADO manifest `requiredConfig` once all profiles use the push/PR tools
- Audit sidecar read-write repo mount in security docs
