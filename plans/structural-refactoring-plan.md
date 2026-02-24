## Plan: Structural Refactoring — DI & Deduplication

The codebase is well-structured overall, but has concentrated debt in two areas: (1) `ContainerManager` acting as a second composition root with 6 concrete `new` calls, and (2) concrete `CopilotExecutor` imports leaking CLI-specific knowledge into CLI-agnostic modules. This plan addresses P0–P4 smells across 5 incremental phases, preserving all behavior and keeping 780 tests green throughout.

**Phases (5 phases)**

1. **Phase 1: Extract CLI Paths into CliPaths Interface**
    - **Objective:** Remove concrete `CopilotExecutor` imports from `TaskRunner` and `LogSourceRegistry` by extracting CLI-specific filesystem paths (`CONFIG_DIR`, `WRITABLE_DIRS`, `TRANSCRIPT_PATH`, `LOG_DIR`) into a `CliPaths` interface that each executor implements. The `ICliExecutor` interface gains a `paths` property.
    - **Files/Functions to Modify/Create:**
      - `src/container/types.ts` — define `CliPaths` interface (configDir, writableDirs, transcriptPath, logDir)
      - `src/container/cli-executors/copilot-executor.ts` — implement `paths` getter returning `CliPaths`
      - `src/container/cli-executors/claude-code-executor.ts` — implement `paths` getter (same `/workspace/.ralph/*` paths)
      - `src/services/task-runner.ts` — replace `CopilotExecutor.CONFIG_DIR` / `WRITABLE_DIRS` with `container.cliPaths`
      - `src/container/log-source-registry.ts` — accept `CliPaths` parameter, remove `CopilotExecutor` import
      - `src/container/manager.ts` — expose `cliPaths` getter through `IContainerManager`
      - `tests/container/log-source-registry.test.ts` — update to pass `CliPaths` object
      - `tests/services/task-runner.test.ts` — update mock container to expose `cliPaths`
    - **Tests to Write:**
      - `CopilotExecutor paths returns correct CliPaths`
      - `ClaudeCodeExecutor paths returns correct CliPaths`
      - `LogSourceRegistry uses injected CliPaths`
      - `TaskRunner uses container cliPaths`
    - **Steps:**
      1. Define `CliPaths` interface in `src/container/types.ts` and add `paths: CliPaths` to `ICliExecutor`
      2. Write tests asserting `CopilotExecutor.paths` and `ClaudeCodeExecutor.paths` return the expected values
      3. Implement `paths` getter on both executors — run tests green
      4. Add `cliPaths: CliPaths` to `IContainerManager` interface + implement in `ContainerManager`
      5. Write tests for `LogSourceRegistry` using injected `CliPaths` and `TaskRunner` using `container.cliPaths`
      6. Update `LogSourceRegistry.registerAll()` to accept `CliPaths` parameter, remove `CopilotExecutor` import
      7. Update `TaskRunner.run()` to get paths from the container, remove `CopilotExecutor` import
      8. Run full suite — 780 tests green

2. **Phase 2: Deduplicate CLI Executor exec() Logic**
    - **Objective:** Extract the identical `exec()` + `killActive()` pattern from both CLI executors into a shared utility function, eliminating byte-for-byte duplication. Per project convention (composition over inheritance), use a shared function, not a base class.
    - **Files/Functions to Modify/Create:**
      - `src/container/cli-executors/shared-exec.ts` (NEW) — `executeCliCommand(compose, args, timeout, logger, prefix): Promise<ContainerExecResult>` + `killActiveProcess(process, logger): Promise<void>`
      - `src/container/cli-executors/copilot-executor.ts` — delegate `exec()` and `killActive()` to shared functions
      - `src/container/cli-executors/claude-code-executor.ts` — delegate `exec()` and `killActive()` to shared functions
    - **Tests to Write:**
      - `executeCliCommand returns result on success`
      - `executeCliCommand handles ExecaError`
      - `executeCliCommand captures stdout/stderr via StreamCapture`
      - `killActiveProcess kills when process exists`
      - `killActiveProcess is no-op when null`
    - **Steps:**
      1. Write tests for `executeCliCommand()` and `killActiveProcess()` — they fail (functions don't exist)
      2. Implement the shared functions in `src/container/cli-executors/shared-exec.ts`
      3. Run new tests green
      4. Refactor `CopilotExecutor.exec()` to delegate to `executeCliCommand()`, remove duplicated code
      5. Refactor `ClaudeCodeExecutor.exec()` similarly
      6. Refactor both `killActive()` to delegate to `killActiveProcess()`
      7. Run full suite — all tests green

3. **Phase 3: ContainerManager DI — Move Concrete Instantiation to Factory**
    - **Objective:** Eliminate `ContainerManager`'s role as a second composition root by moving all 6 concrete `new` calls (`ComposeFileResolver`, `ComposeClient`, `ContainerLogCollector`, `ContainerWorkspaceCleaner`, `LogSourceRegistry`, `ContinuationRunner`) into the factory. The constructor accepts pre-built collaborators via interfaces. Also unifies the duplicated squid path resolution (3 places → 1 helper).
    - **Files/Functions to Modify/Create:**
      - `src/container/manager.ts` — redesign constructor to accept injected collaborators; remove all `new` calls except `StreamCapture` (transient per-operation object)
      - `src/container/types.ts` — add `ILogSourceRegistry`, `IContainerWorkspaceCleaner` interfaces if missing
      - `src/container/log-source-registry.ts` — extract `ILogSourceRegistry` interface
      - `src/container/workspace-cleaner.ts` — extract `IContainerWorkspaceCleaner` interface if missing
      - `src/container/log-collector.ts` — extract `IContainerLogCollector` interface if missing
      - `src/orchestrator-factory.ts` — move all concrete instantiation here; extract `buildComposeClient(profile, appConfig)` helper to deduplicate squid path resolution between `create` and `forceDown`
      - `tests/container/manager.test.ts` (NEW) — dedicated test suite for `ContainerManager` with mocked collaborators
      - `tests/services/task-runner.test.ts` — update mock container to match new interface
      - `tests/helpers/factories.ts` — add `createMockContainerManager()` factory if needed
    - **Tests to Write:**
      - `ContainerManager accepts injected collaborators`
      - `ContainerManager.start() delegates to compose client`
      - `ContainerManager.stop() collects logs and tears down`
      - `ContainerManager.execute() delegates to executor and continuation runner`
      - `ContainerManager.registerLogSources() delegates to registry`
      - `ContainerManager.execInApp() delegates to compose client`
    - **Steps:**
      1. Extract `ILogSourceRegistry`, `IContainerWorkspaceCleaner`, `IContainerLogCollector` interfaces alongside existing classes
      2. Write tests for `ContainerManager` using mocked collaborators — they fail (constructor still instantiates internally)
      3. Redesign `ContainerManager` constructor to accept all collaborators as interface params
      4. Run new tests green
      5. Move all concrete instantiation (6 `new` calls + squid resolution) into `orchestrator-factory.ts`
      6. Extract `buildComposeClient(profile, appConfig)` helper in the factory to eliminate squid path duplication
      7. Update `ContainerManagerFactory` type and `forceDown` lambda
      8. Run full suite — all tests green

4. **Phase 4: Introduce TaskContext DTO + Decompose TaskRunner.run()**
    - **Objective:** Create a `TaskContext` DTO that encapsulates all computed task data (issue, profile, taskId, triggerParamsMap, isRevision) and flows through the entire pipeline. Then break up the 85-LOC `run()` method into named private methods that receive/return this context. The public `run()` becomes a ~15-line pipeline. Consumers (template renderer, JIT config writer) read from `TaskContext` instead of receiving scattered individual params.
    - **Files/Functions to Modify/Create:**
      - `src/services/task-runner.ts` — define `TaskContext` interface; build it at the start of `run()`; extract private methods: `prepareProfile(ctx)`, `prepareContainer(ctx)`, `executeAgent(ctx, container)`, `collectResults(ctx, container, result)`. Each method receives the context.
      - `src/container/setup/agent-includes.ts` — update `buildTemplateContext` to accept `TaskContext` (or its relevant fields) instead of separate `profile, issue, isRevision, triggerParams` args
    - **Tests to Write:** No new tests needed — existing 21 tests verify the full pipeline behavior and exact call ordering. They pass unchanged. The `TaskContext` is an internal implementation detail.
    - **Steps:**
      1. Define `TaskContext` interface with: `issue`, `profile`, `taskId`, `triggerParams: Record<string, string>`, `isRevision: boolean`
      2. At the start of `run()`, compute `triggerParams` via `buildTriggerParams()` and `isRevision`, wrap into `TaskContext`
      3. Extract each phase into a private method that receives `TaskContext`
      4. Update `buildTemplateContext` to accept `TaskContext`-compatible fields
      5. Run full suite — all 21 TaskRunner tests pass unchanged

5. **Phase 5: Route Trigger Params to MCP Servers + Scope-Lock targetRefName**
    - **Objective:** Bridge the gap between trigger params and MCP server env vars. Currently `JitMcpConfigWriter` only resolves `$issueKey`/`$issueProject`/`$taskBranch`/`$issueSummary` macros — trigger params are invisible. Introduce namespaced macros: `$jira.key`, `$jira.project`, `$jira.branch`, `$jira.summary` (hard-cut rename from old flat names) plus new `$trigger.<key>` namespace for trigger params. Then apply this to the `create_pr` tool: remove `targetRefName` from the exposed schema, default to `main`, override via `TARGET_BRANCH` env var from `@Ralph(target_branch=develop)`.
    - **Files/Functions to Modify/Create:**
      - `src/container/setup/jit-mcp-params.ts` — extend `write()` to accept `triggerParams: Record<string, string>`, resolve `$trigger.<key>` macros from the map
      - `src/services/task-runner.ts` — compute `triggerParamsMap` once via `buildTriggerParams()`, pass to both `templateRenderer.render()` and `jitMcpConfig.write()`
      - `shared/mcp-servers/ado/src/shared.ts` — export `TARGET_BRANCH` from env var
      - `shared/mcp-servers/ado/src/tools/create-pr.ts` — remove `targetRefName` from default schema; conditionally add when `TARGET_BRANCH` not set; use `TARGET_BRANCH ?? "main"` in handler
      - `profiles/ralph-docs/profile.json` — add `"TARGET_BRANCH": "$trigger.target_branch"` to ADO server env block (example)
      - `tests/container/setup/jit-mcp-params.test.ts` — tests for `$trigger.*` macro resolution
      - `tests/services/task-runner.test.ts` — verify `jitMcpConfig.write` receives triggerParams
    - **Tests to Write:**
      - `JitMcpConfigWriter resolves $trigger.target_branch from triggerParams`
      - `JitMcpConfigWriter leaves $trigger.x empty when param not provided`
      - `TaskRunner passes triggerParams to jitMcpConfig.write`
      - `create-pr uses TARGET_BRANCH env var when set`
      - `create-pr defaults to main when TARGET_BRANCH not set`
      - `create-pr hides targetRefName from schema when TARGET_BRANCH is set`
    - **Steps:**
      1. Extend `JitMcpConfigWriter.write()` signature to accept `triggerParams: Record<string, string>`
      2. Write tests for `$trigger.*` macro resolution — they fail
      3. Implement `$trigger.<key>` resolution: for values matching `/^\$trigger\.(.+)$/`, look up key in triggerParams map
      4. Run new tests green
      5. Update `TaskRunner.run()`: compute `triggerParamsMap` once, pass to both consumers
      6. Update task-runner tests to verify triggerParams passed to JIT writer
      7. Update `create-pr.ts`: conditional schema pattern + `TARGET_BRANCH` env var with `main` default
      8. Update ADO `shared.ts` with `TARGET_BRANCH` export
      9. Run full suite — all tests green
