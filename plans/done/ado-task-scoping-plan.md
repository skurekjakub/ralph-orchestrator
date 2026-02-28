## Plan: ADO Task-Scoped Branch Restriction & Git Tools

Extend the MCP infrastructure so the ADO server operates only on a task-scoped branch (`ralph/<issueKey>-<slug>`), with new `push_progress` and `create_pr` tools that run git operations inside the sidecar container. Also add orchestrator-managed git sync (checkout main + pull) before each task, and expand the `mcpServers` schema to support per-server config objects.

**Phases: 8**

1. **Phase 1: mcpServers Schema Expansion**
    - **Objective:** Expand `mcpServers` in profile.json from `string[]` to `(string | { name, config })[]`. Add `requiredConfig` to MCP manifest schema. Validate that ADO server config provides `project` and `repositoryId`.
    - **Files/Functions to Modify/Create:**
      - [src/config.ts](src/config.ts) — `profileFileSchema.mcpServers` union, `AgentProfile.mcpServerConfigs`, `loadProfiles()` normalization
      - [src/container/setup/mcp-manifest.ts](src/container/setup/mcp-manifest.ts) — `McpServerManifest.requiredConfig`, `loadMcpManifest()` validation
      - [src/validate/profiles.ts](src/validate/profiles.ts) — `validateMcpServers()` checks requiredConfig satisfaction
      - [tests/helpers/factories.ts](tests/helpers/factories.ts) — `makeProfile()` add `mcpServerConfigs` default
    - **Tests to Write:**
      - `config: accepts string-only mcpServers (backward compat)`
      - `config: accepts mixed string + object mcpServers`
      - `config: rejects object entry without name`
      - `config: normalizes mcpServerConfigs from object entries`
      - `manifest: accepts requiredConfig field`
      - `manifest: validates requiredConfig is string array`
      - `profiles validation: errors when requiredConfig keys missing from profile config`
      - `profiles validation: passes when requiredConfig keys provided`
    - **Steps:**
        1. Write tests for the new schema shapes (failing)
        2. Add `mcpServerEntrySchema` union to `profileFileSchema` in config.ts
        3. Add `mcpServerConfigs: Record<string, Record<string, string>>` to `AgentProfile`
        4. Update `loadProfiles()` to normalize mixed array → `mcpServers` (names) + `mcpServerConfigs` (config maps)
        5. Add `requiredConfig?: string[]` to `McpServerManifest` and validate in `loadMcpManifest()`
        6. Update `validateMcpServers()` in profiles.ts to cross-check requiredConfig vs profile config
        7. Update `makeProfile()` factory with `mcpServerConfigs: {}` default
        8. Run tests green

2. **Phase 2: TaskParamSource Expansion + Branch Naming**
    - **Objective:** Add `TaskBranch` and `IssueSummary` values to `TaskParamSource` enum. Create `slugifyBranchName()` utility. Update `resolveParam()`.
    - **Files/Functions to Modify/Create:**
      - [src/container/setup/mcp-manifest.ts](src/container/setup/mcp-manifest.ts) — `TaskParamSource.TaskBranch`, `TaskParamSource.IssueSummary`
      - [src/util/branch.ts](src/util/branch.ts) (NEW) — `slugifyBranchName(issueKey, summary): string`
      - [src/container/setup/jit-mcp-params.ts](src/container/setup/jit-mcp-params.ts) — `resolveParam()` new cases
    - **Tests to Write:**
      - `branch: slugifies alphanumeric summary`
      - `branch: truncates long summaries`
      - `branch: strips special characters`
      - `branch: handles empty summary`
      - `branch: lowercases everything`
      - `jit-mcp-params: resolves TaskBranch source`
      - `jit-mcp-params: resolves IssueSummary source`
      - `manifest: accepts taskBranch and issueSummary sources`
    - **Steps:**
        1. Write branch naming tests (failing)
        2. Create `src/util/branch.ts` with `slugifyBranchName()`
        3. Add `TaskBranch` and `IssueSummary` to `TaskParamSource` enum
        4. Update `resolveParam()` in jit-mcp-params.ts
        5. Run tests green

3. **Phase 3: Gateway Config — Profile Config Propagation**
    - **Objective:** Merge per-profile `mcpServerConfigs` into gateway.json env blocks at profile setup time. Update `generateGatewayConfig()` and `resolveAllProfileSetup()`.
    - **Files/Functions to Modify/Create:**
      - [src/container/setup/mcp-config.ts](src/container/setup/mcp-config.ts) — `generateGatewayConfig()` accepts `serverConfigs` param
      - [src/container/setup/profile-setup.ts](src/container/setup/profile-setup.ts) — parse mcpServers object entries, pass configs to `generateGatewayConfig()`
    - **Tests to Write:**
      - `gateway: merges serverConfigs into env block`
      - `gateway: serverConfigs don't overwrite secrets`
      - `gateway: ignores servers not in requested list`
      - `gateway: works with no serverConfigs`
    - **Steps:**
        1. Write gateway config tests (failing)
        2. Add `serverConfigs` parameter to `generateGatewayConfig()`
        3. Merge config values into each server's env block
        4. Update `resolveAllProfileSetup()` to extract and pass serverConfigs
        5. Run tests green

4. **Phase 4: ADO Server — Task-Scoped Param Adaptation**
    - **Objective:** Update ADO `mcp-server.json` with `taskParams` and `requiredConfig`. Update all 5 existing tool files to conditionally remove `project`, `repositoryId` from schemas when env vars are present. Adapt `sourceRefName` on `create_pull_request` and `list_pull_requests` to default to `TASK_BRANCH`.
    - **Files/Functions to Modify/Create:**
      - [shared/mcp-servers/ado/mcp-server.json](shared/mcp-servers/ado/mcp-server.json) — add `taskParams`, `requiredConfig`
      - [shared/mcp-servers/ado/src/shared.ts](shared/mcp-servers/ado/src/shared.ts) — env var readers for `ADO_PROJECT`, `ADO_REPO`, `TASK_BRANCH`
      - All 5 tool files — conditional schema removal pattern
    - **Tests to Write:**
      - `ADO tools: use env var defaults when set`
      - `ADO tools: require params when env vars absent`
      - `ADO tools: TASK_BRANCH defaults sourceRefName in create_pull_request`
      - `ADO tools: TASK_BRANCH defaults sourceRefName filter in list_pull_requests`
    - **Steps:**
        1. Update `mcp-server.json` with `taskParams` and `requiredConfig`
        2. Add env var reading helpers to `shared.ts`
        3. Update each tool to conditionally remove `project` and `repositoryId` from schema
        4. Update `create_pull_request` and `list_pull_requests` to default `sourceRefName` from `TASK_BRANCH`
        5. Update ADO server tests

5. **Phase 5: ADO Server — push_progress + create_pr Tools**
    - **Objective:** Add two new git-powered tools to the ADO MCP server. The sidecar mounts the repo volume; tools exec `git` with `cwd` set to the repo root.
    - **Files/Functions to Modify/Create:**
      - [shared/mcp-servers/ado/src/tools/push-progress.ts](shared/mcp-servers/ado/src/tools/push-progress.ts) (NEW) — `ado_push_progress` tool
      - [shared/mcp-servers/ado/src/tools/create-pr.ts](shared/mcp-servers/ado/src/tools/create-pr.ts) (NEW) — `ado_create_pr` tool (push + ADO REST API create PR)
      - [shared/mcp-servers/ado/src/shared.ts](shared/mcp-servers/ado/src/shared.ts) — `gitPush()` helper, `REPO_ROOT` constant
      - [shared/mcp-servers/ado/src/index.ts](shared/mcp-servers/ado/src/index.ts) — register new tools
      - [shared/mcp-servers/ado/mcp-server.json](shared/mcp-servers/ado/mcp-server.json) — add tools to allowlist
    - **Tests to Write:**
      - `push_progress: pushes to TASK_BRANCH`
      - `push_progress: fails gracefully when no TASK_BRANCH`
      - `create_pr: pushes then creates PR via API`
      - `create_pr: uses TASK_BRANCH as sourceRefName`
    - **Steps:**
        1. Add `gitPush()` helper and `REPO_ROOT` to shared.ts
        2. Create `push-progress.ts` tool — runs `git push` with ADO PAT in URL
        3. Create `create-pr.ts` tool — push + ADO REST create PR
        4. Register in index.ts, update manifest tools list
        5. Write and run tests

6. **Phase 6: Container Lifecycle — Git Sync Step**
    - **Objective:** Add orchestrator-managed `git checkout main && git pull` before each task. Implement as a new lifecycle step with composable lifecycle hooks pattern.
    - **Files/Functions to Modify/Create:**
      - [src/container/lifecycle.ts](src/container/lifecycle.ts) (NEW) — `ILifecycleHook` interface, `RepoSyncHook` class
      - [src/services/task-runner.ts](src/services/task-runner.ts) — call lifecycle hooks after `container.setup()`, before `execute()`
      - [src/orchestrator-factory.ts](src/orchestrator-factory.ts) — wire `RepoSyncHook` into TaskRunner
    - **Tests to Write:**
      - `RepoSyncHook: executes git checkout main && git pull`
      - `RepoSyncHook: logs sync progress`
      - `RepoSyncHook: propagates exec errors`
      - `task-runner: calls lifecycle hooks in correct order`
    - **Steps:**
        1. Write tests for `RepoSyncHook` (failing)
        2. Create `ILifecycleHook` interface with `execute(container, profile, issue, logger)` method
        3. Implement `RepoSyncHook` using `compose.exec()` to run git commands in app container
        4. Add `preExecuteHooks: ILifecycleHook[]` to TaskRunner
        5. Wire into task-runner between `setup()` and comment fetch
        6. Update orchestrator-factory to inject hooks
        7. Run tests green

7. **Phase 7: Sidecar Infrastructure — Dockerfile + Compose Overlay**
    - **Objective:** Install git in the sidecar Dockerfile. Mount the repo volume into the sidecar via compose overlay. Add `REPO_ROOT` env var.
    - **Files/Functions to Modify/Create:**
      - [shared/mcp-sidecar/Dockerfile](shared/mcp-sidecar/Dockerfile) — `apt-get install -y git`
      - [src/container/setup/compose-overlay.ts](src/container/setup/compose-overlay.ts) — mount repo volume into sidecar, add `REPO_ROOT` env
    - **Tests to Write:**
      - `compose-overlay: includes repo volume mount on sidecar when servers present`
      - `compose-overlay: includes REPO_ROOT env on sidecar`
    - **Steps:**
        1. Write compose overlay tests (failing)
        2. Add git install to sidecar Dockerfile
        3. Update `generateComposeOverlay()` to accept `repoPath` and mount into sidecar
        4. Add `REPO_ROOT` env var to sidecar service
        5. Update `resolveAllProfileSetup()` to pass repo path
        6. Run tests green

8. **Phase 8: Documentation Updates**
    - **Objective:** Update all main repository documentation to reflect the new features.
    - **Files/Functions to Modify/Create:**
      - [CONFIGURATION.md](CONFIGURATION.md), [ARCHITECTURE.md](ARCHITECTURE.md), [README.md](README.md)
      - [.github/copilot-instructions.md](.github/copilot-instructions.md), [CLAUDE.md](CLAUDE.md), [MCP.md](MCP.md)
    - **Steps:**
        1. Document mcpServers object syntax in CONFIGURATION.md
        2. Document requiredConfig manifest field in MCP.md
        3. Document push_progress/create_pr tools
        4. Document git sync lifecycle hook
        5. Update architecture diagrams

**Open Questions**
1. Should `TASK_BRANCH` include `refs/heads/` prefix when injected? ADO API needs it but git push doesn't — resolve by having the tool prepend when needed.
2. Max branch name length — git allows 255, but ADO may have tighter limits. Use 100 char slug limit.
3. Should profile.json changes also update existing `ralph-docs` and `ralph-vscode` profile.json files? Yes — update them with the new config object syntax.
