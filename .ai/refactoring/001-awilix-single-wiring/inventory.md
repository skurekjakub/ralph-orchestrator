# Inventory: awilix single wiring

Generated from `main` @ 81a8980 (clean tree). Counts are `grep`-derived; the validation block at the end gives a second independent query for each. `containment/` and `.claude/worktrees/` (stale copies of `src/` and `tests/`) were not read, searched or counted.

Legend: `src`/`scripts`/`tests` = number of `new X(` sites in that directory. `mutable` = instance fields reassigned or appended to after construction.

## 1. Every class in `src/`

| # | class | file:line | constructor | `new X(` sites: src / scripts / tests | registered today | classification | mutable | code-verified reason |
|---|---|---|---|---|---|---|---|---|
| 1 | AppStartup | src/app-startup.ts:101 | `(deps?: Partial<AppStartupDeps>)` | src 1: src/index.tsx:10<br>scripts 2: scripts/run-agent.ts:42, scripts/run-hooks.ts:85<br>tests 12 | not registered; `new` in `index.tsx:10`, `scripts/run-agent.ts:42`, `scripts/run-hooks.ts:85` | entry/bootstrap | no (holds `deps` bag) | `run()` validates + loads config before any container can exist; `defaultDeps()` calls `createCliRuntimeRegistry(config.claudeAuth)` (`app-startup.ts:89`) and `resolveAllProfileSetup` which news its own `AgentCatalogProvider` |
| 2 | AgentCatalog | src/cli/agent-catalog.ts:99 | `(sources: readonly AgentSource[])`; static `load(agentsDir)` | src 2: src/cli/agent-catalog.ts:124, src/validate/agents.ts:92<br>scripts 0<br>tests 11 | not registered; built by `AgentCatalog.load` and `src/validate/agents.ts:92` | value/state holder | no (immutable) | parsed graph, holds `byName`/`byFileId` maps built in ctor; read-only; per-profile value, not a collaborator |
| 3 | AgentDefinitionError | src/cli/agent-definition.ts:91 | `(fileId, problems)` | src 2: src/cli/agent-definition.ts:121, src/cli/agent-definition.ts:127<br>scripts 0<br>tests 0 | n/a | error | no | extends Error; `name = "AgentDefinitionError"`; `instanceof` in 3 places |
| 4 | ClaudeAgentWriter | src/cli/claude/claude-agent-writer.ts:63 | none (implicit) | src 1: src/cli/claude/claude-runtime.ts:53<br>scripts 0<br>tests 1 | not registered; field initialiser `claude-runtime.ts:53` | strategy | no | IAgentFileWriter owned by ClaudeCodeRuntime; no fields; `write()` closes over module helpers only; stateless too |
| 5 | ClaudeCodeRuntime | src/cli/claude/claude-runtime.ts:48 | `({ claudeAuth })` | src 1: src/cli/supported-runtimes.ts:11<br>scripts 0<br>tests 18 | not registered; built inside `createCliRuntimeRegistry` (`supported-runtimes.ts:11`) | strategy | no (readonly constants + `credentials` from `claudeAuth`) | ICliRuntime selected by `CliType` via `CliRuntimeRegistry.get`; `agentWriter` and decoder factory are its sub-strategies |
| 6 | ClaudeSessionIds | src/cli/claude/claude-session.ts:100 | none (implicit) | src 2: src/container/cli-executors/local-claude-code-executor.ts:73, src/container/cli-executors/claude-code-executor.ts:57<br>scripts 0<br>tests 2 | not registered; field initialiser in `claude-code-executor.ts:57`, `local-claude-code-executor.ts:73` | value/state holder | yes (`sessionId`) | per-executor session id tracker |
| 7 | ClaudeStreamJsonDecoder | src/cli/claude/stream-json-decoder.ts:112 | none (implicit) | src 1: src/cli/claude/claude-runtime.ts:123<br>scripts 0<br>tests 15 | not registered; `claude-runtime.ts:123` (`createOutputDecoder`) | value/state holder | yes (`agentTexts`, `sessionId`, `apiErrorKind`, `lastResult`) | one per output stream; accumulates decoded lines |
| 8 | CliRuntimeRegistry | src/cli/cli-runtime.ts:183 | `({ runtimes })` | src 1: src/cli/supported-runtimes.ts:11<br>scripts 0<br>tests 9 | asFunction -> `createCliRuntimeRegistry` (`awilix-cradle.ts:166`); second registry built in `app-startup.ts:89` | service | no | readonly lookup over fixed `[ClaudeCodeRuntime, CopilotRuntime]`; two independent instances exist today |
| 9 | CopilotAgentWriter | src/cli/copilot/copilot-agent-writer.ts:17 | none (implicit) | src 1: src/cli/copilot/copilot-runtime.ts:38<br>scripts 0<br>tests 1 | not registered; field initialiser `copilot-runtime.ts:38` | strategy | no | IAgentFileWriter owned by CopilotRuntime; no fields; `write`/`modelOf` close over module helpers only; stateless too |
| 10 | CopilotRuntime | src/cli/copilot/copilot-runtime.ts:33 | none (implicit) | src 1: src/cli/supported-runtimes.ts:11<br>scripts 0<br>tests 6 | not registered; built inside `createCliRuntimeRegistry` | strategy | no (readonly constants) | ICliRuntime selected by `CliType`; fields are constants |
| 11 | PlainTextDecoder | src/cli/plain-text-decoder.ts:4 | none (implicit) | src 2: src/cli/copilot/copilot-runtime.ts:123, src/container/stream-capture.ts:45<br>scripts 0<br>tests 5 | not registered; `copilot-runtime.ts:123`; default param of `StreamCapture` ctor (`stream-capture.ts:45`) | value/state holder | yes (`lines`) | one per output stream |
| 12 | AgentSessionRunner | src/container/agent-session-runner.ts:44 | `({ continuationRunner, promptBuilder, logger })` | src 2: src/awilix-cradle.ts:90, src/awilix-cradle.ts:115<br>scripts 0<br>tests 2 | not registered; hand `new` in `buildContainerFactory` (`awilix-cradle.ts:90`, `:115`) | service | no | built per task / per local session but carries no task data: all three deps are app-wide; `continuationRunner` is not a cradle token |
| 13 | CliExecutorFactory | src/container/cli-executor-factory.ts:60 | `({ cliRuntimes, agentCatalogs, rootDir })` | src 1: src/awilix-cradle.ts:174<br>scripts 0<br>tests 1 | asFunction + hand `new` (`awilix-cradle.ts:174`, `rootDir: process.cwd()`) | service | no | builds executors per task/stage (switch on `stage.cli`); fields are 2 deps + `rootDir` (used by `hostCliBinary`, `profileBuildPaths`) |
| 14 | ClaudeCodeExecutor | src/container/cli-executors/claude-code-executor.ts:47 | `({ compose, profile, stage, agentName, subagentDepth, runtime, logger })` | src 1: src/container/cli-executor-factory.ts:91<br>scripts 0<br>tests 1 | not registered; `new` in `cli-executor-factory.ts:91` | per-task service | yes (`sessions: ClaudeSessionIds`) | per container stage; closes over the task's `compose`, stage, agent name and subagent depth |
| 15 | CopilotExecutor | src/container/cli-executors/copilot-executor.ts:32 | `({ compose, profile, runtime, logger })` | src 1: src/container/cli-executor-factory.ts:102<br>scripts 0<br>tests 1 | not registered; `new` in `cli-executor-factory.ts:102` | per-task service | no | ICliExecutor chosen by `stage.cli`; closes over the task's `compose` + stage profile |
| 16 | LocalClaudeCodeExecutor | src/container/cli-executors/local-claude-code-executor.ts:60 | `(deps: LocalClaudeCodeExecutorDeps)`: profile, stage, agentName, subagentDepth, subagents, workspace, runtime, binary, hooksDir, logger | src 1: src/container/cli-executor-factory.ts:124<br>scripts 0<br>tests 1 | not registered; `new` in `cli-executor-factory.ts:124` | per-task service | yes (`sessions: ClaudeSessionIds`) | per host stage with workspace, subagents, hooksDir |
| 17 | LocalCopilotExecutor | src/container/cli-executors/local-copilot-executor.ts:36 | `({ profile, workspace, runtime, binary, logger })` | src 1: src/container/cli-executor-factory.ts:120<br>scripts 0<br>tests 1 | not registered; `new` in `cli-executor-factory.ts:120` | per-task service | no | per host stage with workspace |
| 18 | ComposeClient | src/container/compose-client.ts:58 | `(composeFilePaths: string \| string[], envConfig: ComposeEnvConfig)` positional | src 1: src/awilix-cradle.ts:56<br>scripts 0<br>tests 9 | not registered; `buildComposeClient` (`awilix-cradle.ts:56`, called from `:85` and `:108`) | per-task service | no (readonly `fileArgs`, `env`) | built per task with profile compose files, `workspacePath`, `squidConfPath`; `env` also reads `process.cwd()` (`compose-client.ts:72`) |
| 19 | ContinuationRunner | src/container/continuation-runner.ts:54 | `({ logger })`; statics `continuationBackoff`, `sleep` | src 2: src/awilix-cradle.ts:89, src/awilix-cradle.ts:114<br>scripts 0<br>tests 1 | not registered; hand `new` `awilix-cradle.ts:89`, `:114` | service | no | only field `logger`; no task data; statics are called as `ContinuationRunner.sleep` and spied in tests (`continuation-loop.test.ts:131`) |
| 20 | ContainerLogCollector | src/container/log-collector.ts:100 | `({ compose, logDir, logger })` | src 1: src/awilix-cradle.ts:86<br>scripts 0<br>tests 1 | not registered; hand `new` `awilix-cradle.ts:86` | per-task service | yes (`sources`, `exports`, `attached`, `taskId`, `streamProcs`) | one per task; `compose` is per task |
| 21 | LogSourceRegistry | src/container/log-source-registry.ts:43 | none (implicit); statics `PRE_TOOL_PATH`, `TOOL_OUTPUT_PATH` | src 1: src/awilix-cradle.ts:88<br>scripts 0<br>tests 1 | not registered; hand `new` `awilix-cradle.ts:88` | stateless | no | no instance fields; `registerAll(logs, profile, taskId, workItemId, callbacks, runtimes)` takes everything as args; closes over 2 static path constants; built per task |
| 22 | ContainerManager | src/container/manager.ts:111 | `({ profile, workspacePath, compose, cliRuntimes, executorFactory, logs, cleaner, logRegistry, sessionRunner, logger, containerLogger, enableContinuation = false })` | src 1: src/awilix-cradle.ts:91<br>scripts 0<br>tests 2 | not registered; hand `new` `awilix-cradle.ts:91` | per-task service | yes (`activeExecutor`, `_running`) | holds profile, workspacePath, compose of one task; 7 of the 12 keys are not cradle tokens |
| 23 | AgentCatalogProvider | src/container/setup/agent-catalogs.ts:17 | `({ rootDir })` | src 2: src/awilix-cradle.ts:171, src/container/setup/profile-setup.ts:91<br>scripts 0<br>tests 4 | asFunction + hand `new` (`awilix-cradle.ts:171`, `rootDir: process.cwd()`); second hand `new` in `profile-setup.ts:91` (before cradle exists) | stateless | no | only field `rootDir`; `load(profileId)` closes over `rootDir` -> `profileBuildPaths(rootDir, id).agentsDir`, then static `AgentCatalog.load` |
| 24 | AgentTemplateRenderer | src/container/setup/agent-includes.ts:406 | `({ agentCatalogs, cliRuntimes })` | src 0<br>scripts 0<br>tests 1 | asClass singleton (`templateRenderer`) | service | no | 2 injected deps; `render` also reads `process.cwd()` (`agent-includes.ts:422`) |
| 25 | ComposeFileResolver | src/container/setup/compose-files.ts:16 | `(rootDir?: string)` defaulting to `process.cwd()` | src 1: src/awilix-cradle.ts:51<br>scripts 0<br>tests 3 | not registered; hand `new` `awilix-cradle.ts:51` | stateless | no | only field `rootDir`; `resolve(profile)` closes over `rootDir` + `existsSync`; built per task and per `forceDown` only to call one method |
| 26 | ComposeOverlayWriter | src/container/setup/compose-overlay-writer.ts:101 | `({ cliRuntimes, agentCatalogs })` | src 0<br>scripts 0<br>tests 2 | asClass singleton (`overlayWriter`) | service | no | 2 injected deps; `write` calls `writeComposeArtifacts({ rootDir: process.cwd(), ... })` (`compose-overlay-writer.ts:118`) |
| 27 | JitMcpConfigWriter | src/container/setup/jit-mcp-params.ts:116 | none (implicit) | src 0<br>scripts 0<br>tests 1 | asClass singleton (`jitMcpConfig`) | stateless | no | no fields; `write()` closes over module helpers; private `resolveGatewayPath` reads `process.cwd()` (`jit-mcp-params.ts:159`) |
| 28 | SectionTag | src/container/setup/liquid-tags.ts:26 | `(tagToken, remainTokens, liquid, parser)` (liquidjs) | src 0<br>scripts 0<br>tests 0 | not registered; `engine.registerTag("section", SectionTag)` `liquid-tags.ts:52` | framework subclass | yes (`sectionName`, `templates`) | extends liquidjs `Tag`; liquid constructs it per tag occurrence |
| 29 | SkillTemplateRenderer | src/container/setup/skill-includes.ts:137 | empty `constructor() {}` | src 0<br>scripts 0<br>tests 3 | asClass singleton (`skillRenderer`) | stateless | no | no fields; `render(context, target, logger?)` closes over `process.cwd()` (`skill-includes.ts:141`) and calls module `renderSkills` |
| 30 | StreamCapture | src/container/stream-capture.ts:20 | `(proc, logger, tag, decoder = new PlainTextDecoder())` positional | src 3: src/container/manager.ts:218, src/container/manager.ts:248, src/container/cli-executors/shared-exec.ts:51<br>scripts 0<br>tests 21 | not registered; `new` `manager.ts:218`, `manager.ts:248`, `shared-exec.ts:51` | value/state holder | yes (`stdoutBuf`, `stdoutChunks`, `stderrChunks`, `agentTexts`, `_resultBlockResolved`) | per child process |
| 31 | ContainerWorkspaceCleaner | src/container/workspace-cleaner.ts:29 | `({ compose, logger })` | src 1: src/awilix-cradle.ts:87<br>scripts 0<br>tests 8 | not registered; hand `new` `awilix-cradle.ts:87` | per-task service | no | closes over the task's `compose` |
| 32 | JiraFieldExtractor | src/datasource/connectors/jira/field-extractor.ts:34 | none (implicit) | src 0<br>scripts 0<br>tests 1 | not registered; no `new` anywhere in `src/`; module is not imported by any `src/` file | stateless | no | no fields; `extractCustomFields`/`extractFieldValue` close over module const `KNOWN_CUSTOM_FIELDS`; only tests construct it (1) |
| 33 | JiraIssueParser | src/datasource/connectors/jira/issue-parser.ts:16 | `(excludedFieldIds: readonly string[] = [])` | src 0<br>scripts 0<br>tests 8 | not registered; no `new` in `src/`; not imported by any `src/` file | value/state holder | no (immutable `Set`) | immutable config holder; only tests construct it (8) |
| 34 | JiraClient | src/datasource/connectors/jira/jira-client.ts:41 | `({ connection, logger? }, retryOptions?)` | src 1: src/datasource/connectors/jira/factory.ts:62<br>scripts 1: scripts/lookup-users.ts:52<br>tests 3 | not registered; `new` in `jira/factory.ts:62`, `scripts/lookup-users.ts:52` | service | no | one per data source; secrets-bearing; 2nd positional param |
| 35 | JiraConnector | src/datasource/connectors/jira/jira-connector.ts:41 | `(sourceKey, client, excludeFields = [], allowedUsers = [], logger?)` positional | src 1: src/datasource/connectors/jira/factory.ts:63<br>scripts 0<br>tests 2 | not registered; `new` in `jira/factory.ts:63` | service | no | one per data source; implements IDataSourceConnector + 2 capability interfaces |
| 36 | JiraWorkItemPoller | src/datasource/connectors/jira/jira-poller.ts:21 | `(connector, queries, pollIntervalMs, logger?)` positional | src 1: src/datasource/connectors/jira/factory.ts:68<br>scripts 0<br>tests 1 | not registered; `new` in `jira/factory.ts:68` | service | yes (`timer`, `running`, `buffer`) | one per data source; interval timer |
| 37 | LogCollector | src/logs/collector.ts:83 | `({ outputConfig })` | src 0<br>scripts 0<br>tests 1 | asClass singleton (`logCollector`) | service | no (`config` slice) | writes summaries under `outputConfig.logDir`; only slice + pure helpers |
| 38 | HookRulesRedactor | src/logs/text-redactor.ts:28 | `({ scriptPath = <sharedHooksDir(process.cwd())>/lib/redact.pl, env = process.env } = {})` | src 1: src/awilix-cradle.ts:197<br>scripts 0<br>tests 8 | asFunction + hand `new` (`awilix-cradle.ts:197`) | stateless | no | readonly `scriptPath` + `env`; `redact`/`redactEach` spawn `perl` through `run(mode, input)`; default path is built from `process.cwd()` (`text-redactor.ts:38`); tests inject both |
| 39 | OrchestratorObserver | src/orchestrator-observer.ts:31 | `(context: () => ObservableContext)` positional closure over Orchestrator | src 1: src/orchestrator.ts:127<br>scripts 0<br>tests 19 | not registered; `new` `orchestrator.ts:127` | service | yes (`completedToday`, `emitting`, `stateCallbacks`) | owned 1:1 by Orchestrator; its ctor arg closes over `this` (`activeTask`, `running`, `ledger`...), so it is not constructible from the cradle alone |
| 40 | Orchestrator | src/orchestrator.ts:50 | `({ dataSources, profiles, activityLog, pollers, router, issueManager, resources, vcsSourceClient, taskRunner, triggerScanner, ledger, heartbeat, ralphchivesConfig, outputConfig })`; type also lists `logger?` (never destructured) | src 1: src/index.tsx:14<br>scripts 0<br>tests 24 | not registered; `new Orchestrator(cradle)` `index.tsx:14` | service | yes (loop state) | long-lived; owns `observer` (hand `new OrchestratorObserver` at `orchestrator.ts:127`); tests pass a hand-built deps object (23 + 1) |
| 41 | PromptBuilder | src/prompt/prompt-builder.ts:41 | `({ promptAuditConfig, logger })` | src 0<br>scripts 0<br>tests 7 | asClass singleton (`promptBuilder`); no interface (cradle + `AgentSessionRunner` use the class type) | service | no (`mode`) | stale JSDoc `new PromptBuilder(AuditMode.Warn, logger)` at `prompt-builder.ts:35` |
| 42 | ActivityLog | src/services/activity-log.ts:43 | `({ outputConfig }, maxLines = 500)` | src 0<br>scripts 0<br>tests 13 | asClass singleton (`activityLog`); `maxLines` never supplied by awilix | service | yes (`buffer`, `taskFilePath`) | creates both loggers (`createLogger`, `createContainerLogger`); resolves `outputConfig.logDir` against `process.cwd()` (`activity-log.ts:65`) |
| 43 | AgentPipelineExecutor | src/services/agent-pipeline-executor.ts:34 | `({ logger, profileSetup, stageWorkspaces })` | src 0<br>scripts 0<br>tests 2 | asClass singleton (`pipelineExecutor`) | service | no | long-lived; 3 injected deps, no mutable fields |
| 44 | DashboardServer | src/services/dashboard-server.ts:24 | `(observer, logger, port?)` positional | src 1: src/index.tsx:17<br>scripts 0<br>tests 0 | not registered; `new` `index.tsx:17` | service | yes (`wss`) | needs `orchestrator.observer`, which only exists after `new Orchestrator` |
| 45 | HeartbeatSender | src/services/heartbeat.ts:45 | `({ dashboardConfig, logger? })` | src 1: src/awilix-cradle.ts:205<br>scripts 0<br>tests 1 | asFunction + hand `new` (`awilix-cradle.ts:205`), `null` when `dashboardConfig.enabled` is false | service | yes (`timer`, `lastError`) | interval timer |
| 46 | IssueManager | src/services/issue-manager.ts:38 | `({ connectors, logger })`; public settable `retryOptions?` | src 0<br>scripts 0<br>tests 1 | asClass singleton (`issueManager`) | service | no (`retryOptions` is test-set) | 2 deps |
| 47 | OperationLedger | src/services/operation-ledger.ts:141 | `({ outputConfig })` | src 0<br>scripts 0<br>tests 9 | asClass singleton (`ledger`) | service | yes (`pendingCallback`; reads `historyDir` per call) | file-backed; `onPending` callback |
| 48 | PostTaskHookRunner | src/services/post-task-hook-runner.ts:29 | `({ logger, profileSetup, containerFactory, stageWorkspaces })` | src 0<br>scripts 0<br>tests 1 | asClass singleton (`hookRunner`) | service | no | 4 deps |
| 49 | ProfileRouter | src/services/profile-router.ts:35 | `({ profiles }, fetchComments?)` | src 0<br>scripts 0<br>tests 44 | asClass singleton (`router`); 2nd positional param never supplied by awilix | service | no | `profiles` slice + optional test-injected `fetchComments` |
| 50 | ProfileSetupService | src/services/profile-setup-service.ts:50 | `({ logger, cliRuntimes, templateRenderer, skillRenderer, overlayWriter, jitMcpConfig, stageWorkspaces })` | src 0<br>scripts 0<br>tests 1 | asClass singleton (`profileSetup`) | service | no | 7 deps |
| 51 | RunArtifactsDeriver | src/services/run-artifacts-deriver.ts:38 | `({ cliRuntimes, textRedactor, logger })` | src 0<br>scripts 0<br>tests 1 | asClass singleton (`runArtifacts`) | service | no | 3 deps |
| 52 | StageWorkspaceResolver | src/services/stage-workspace.ts:40 | `({ cliRuntimes, rootDir })` | src 1: src/awilix-cradle.ts:178<br>scripts 0<br>tests 3 | asFunction + hand `new` (`awilix-cradle.ts:178`, `rootDir: process.cwd()`) | service | no | pure path computation (`forStage`, `forHookStage`) over 1 dep + `rootDir`; candidate for function-with-args |
| 53 | TaskResourceManager | src/services/task-resource-manager.ts:17 | `({ connectors, logger })`; public settable `retryOptions?` | src 0<br>scripts 0<br>tests 1 | asClass singleton (`resources`) | service | no (`retryOptions` is test-set) | 2 deps |
| 54 | TaskResultWriter | src/services/task-result-writer.ts:20 | `({ logCollector, resources, runArtifacts, logger })` | src 0<br>scripts 0<br>tests 1 | asClass singleton (`resultWriter`) | service | no | 4 deps |
| 55 | TaskRunner | src/services/task-runner.ts:43 | `({ logger, containerFactory, resources, resultWriter, issueManager, profileSetup, pipelineExecutor, workspaceManager, hookRunner })` | src 0<br>scripts 0<br>tests 22 | asClass singleton (`taskRunner`) | service | no | 9 deps; all per-task state lives in `run(ctx)` |
| 56 | TaskWorkspaceManager | src/services/task-workspace-manager.ts:113 | `({ logger, cliRuntimes, sourceReposDir })` | src 1: src/awilix-cradle.ts:187<br>scripts 0<br>tests 2 | asFunction + hand `new` (`awilix-cradle.ts:187`, `sourceReposDir: repoCachePaths(process.cwd()).sourceReposDir`) | service | no | long-lived; `sourceReposDir` is not a cradle token |
| 57 | TriggerScanner | src/services/trigger-scanner.ts:74 | `({ issueManager, router, ledger, logger, connectors })` | src 0<br>scripts 0<br>tests 4 | asClass singleton (`triggerScanner`) | service | yes (`lastScanTimestamps`, `cacheLoaded`) | persists `cache/trigger-cache.json` |
| 58 | AdoVcsSourceProviderClient | src/services/vcs-source-client.ts:71 | none (implicit) | src 1: src/services/vcs-source-client.ts:156<br>scripts 0<br>tests 0 | not registered; default element of VcsSourceClient ctor param | strategy | no | IVcsSourceProviderClient chosen by VcsProvider; only field is `readonly provider = VcsProvider.Ado`; method closes over module fetch helpers; stateless too; file-private class |
| 59 | GitHubVcsSourceProviderClient | src/services/vcs-source-client.ts:110 | none (implicit) | src 1: src/services/vcs-source-client.ts:157<br>scripts 0<br>tests 0 | not registered; default element of VcsSourceClient ctor param | strategy | no | IVcsSourceProviderClient chosen by VcsProvider; only field `readonly provider`; stateless too; file-private class |
| 60 | VcsSourceClient | src/services/vcs-source-client.ts:151 | `(clients = [new AdoVcsSourceProviderClient(), new GitHubVcsSourceProviderClient()])` positional | src 1: src/awilix-cradle.ts:158<br>scripts 0<br>tests 2 | asFunction + hand `new` (`awilix-cradle.ts:158`) | service | no | readonly provider map built in ctor; dispatch only |
| 61 | FrontmatterError | src/util/frontmatter.ts:29 | `(message)` | src 3: src/util/frontmatter.ts:60, src/util/frontmatter.ts:66, src/util/frontmatter.ts:87<br>scripts 0<br>tests 0 | n/a | error | no | extends Error; `name = "FrontmatterError"`; `instanceof` in 2 places |

Totals: 61 classes. `new` sites by directory (code sites only; the `prompt-builder.ts:35` JSDoc example is excluded): src 51, scripts 3, tests 326.

Classification counts: entry/bootstrap 1, error 2, framework subclass 1, per-task service 8, service 30, stateless 7, strategy 6, value/state holder 6.

Stateless classes (no instance state beyond constants or a fixed root dir): LogSourceRegistry, AgentCatalogProvider, ComposeFileResolver, JitMcpConfigWriter, SkillTemplateRenderer, JiraFieldExtractor, HookRulesRedactor. Strategy objects that are also stateless: ClaudeAgentWriter, CopilotAgentWriter, AdoVcsSourceProviderClient, GitHubVcsSourceProviderClient.

Registered-today summary (cradle tokens in `awilix-cradle.ts`):

- `asClass(...).singleton()`: 18 (activityLog, issueManager, resources, ledger, router, triggerScanner, logCollector, promptBuilder, templateRenderer, skillRenderer, jitMcpConfig, overlayWriter, profileSetup, pipelineExecutor, runArtifacts, resultWriter, hookRunner, taskRunner).
- `asFunction` with a hand `new`: 7 (vcsSourceClient :158, agentCatalogs :171, executorFactory :174, stageWorkspaces :178, workspaceManager :187, textRedactor :197, heartbeat :205).
- `asFunction` delegating to a factory function: logger, containerLogger (via `activityLog`), cliRuntimes (`createCliRuntimeRegistry`, which news 3 classes), containerFactory (`buildContainerFactory`, which news 8 classes per call).
- `asValue`: 9 config slices + `connectors`, `pollers` (built by `buildDataSourceMaps`, `awilix-cradle.ts:134`).
- Not registered and hand-built: everything else in the table (per-task objects, executors, Jira objects, Orchestrator, DashboardServer, AppStartup, value holders, errors).

Other construction paths that hide a `new`:

- `createCliRuntimeRegistry` is called twice: `awilix-cradle.ts:167` and `app-startup.ts:89` (two independent registries per process); 16 test call sites.
- `resolveAllProfileSetup` (`container/setup/profile-setup.ts:89-91`) builds its own `AgentCatalogProvider` with `rootDir = process.cwd()` default; it runs inside `AppStartup`, before config exists.
- `buildDataSourceMaps(config)` (`datasource/registry.ts`) invokes factory functions registered by `registerDataSourceFactory`; the Jira factory (`jira/factory.ts:62-68`) news client, connector, poller.
- Third-party `new`: `new Liquid` and `new WebSocketServer` in `src/` (not repo classes).
- Dead in `src/`: `JiraFieldExtractor` and `JiraIssueParser` are imported by no `src/` file (verified with `grep -rnE 'issue-parser|field-extractor' src`: only the class files themselves); only tests construct them.

## 2. Every `new` in `src/` of a class outside its own file, by constructing file

- `src/awilix-cradle.ts` (17): ComposeFileResolver `:51`, ComposeClient `:56`, ContainerLogCollector `:86`, ContainerWorkspaceCleaner `:87`, LogSourceRegistry `:88`, ContinuationRunner `:89`, AgentSessionRunner `:90`, ContainerManager `:91`, ContinuationRunner `:114`, AgentSessionRunner `:115`, VcsSourceClient `:158`, AgentCatalogProvider `:171`, CliExecutorFactory `:174`, StageWorkspaceResolver `:178`, TaskWorkspaceManager `:187`, HookRulesRedactor `:197`, HeartbeatSender `:205`
- `src/cli/claude/claude-runtime.ts` (2): ClaudeAgentWriter `:53`, ClaudeStreamJsonDecoder `:123`
- `src/cli/copilot/copilot-runtime.ts` (2): CopilotAgentWriter `:38`, PlainTextDecoder `:123`
- `src/cli/supported-runtimes.ts` (3): ClaudeCodeRuntime `:11`, CliRuntimeRegistry `:11`, CopilotRuntime `:11`
- `src/container/cli-executor-factory.ts` (4): ClaudeCodeExecutor `:91`, CopilotExecutor `:102`, LocalCopilotExecutor `:120`, LocalClaudeCodeExecutor `:124`
- `src/container/cli-executors/claude-code-executor.ts` (1): ClaudeSessionIds `:57`
- `src/container/cli-executors/local-claude-code-executor.ts` (1): ClaudeSessionIds `:73`
- `src/container/cli-executors/shared-exec.ts` (1): StreamCapture `:51`
- `src/container/manager.ts` (2): StreamCapture `:218`, StreamCapture `:248`
- `src/container/setup/profile-setup.ts` (1): AgentCatalogProvider `:91`
- `src/container/stream-capture.ts` (1): PlainTextDecoder `:45`
- `src/datasource/connectors/jira/factory.ts` (3): JiraClient `:62`, JiraConnector `:63`, JiraWorkItemPoller `:68`
- `src/index.tsx` (3): AppStartup `:10`, Orchestrator `:14`, DashboardServer `:17`
- `src/orchestrator.ts` (1): OrchestratorObserver `:127`
- `src/validate/agents.ts` (1): AgentCatalog `:92`

Cross-file `new` sites: 43 in 15 files. Same-file sites (excluded above): 8: AgentCatalog `src/cli/agent-catalog.ts:124`, AgentDefinitionError `src/cli/agent-definition.ts:121`, AgentDefinitionError `src/cli/agent-definition.ts:127`, AdoVcsSourceProviderClient `src/services/vcs-source-client.ts:156`, GitHubVcsSourceProviderClient `src/services/vcs-source-client.ts:157`, FrontmatterError `src/util/frontmatter.ts:60`, FrontmatterError `src/util/frontmatter.ts:66`, FrontmatterError `src/util/frontmatter.ts:87`.
`supported-runtimes.ts:11` holds three `new` on one line (CliRuntimeRegistry, ClaudeCodeRuntime, CopilotRuntime), so line count is one less than site count.
`scripts/` (3 sites): `run-agent.ts:42` and `run-hooks.ts:85` (`new AppStartup()`), `lookup-users.ts:52` (`new JiraClient`).


## 3. Cradle consumers: `createCradle`, `container.cradle`, cradle keys

`createCradle(config)` is the only call that builds the container (`awilix-cradle.ts:128`); it returns `container.cradle`. The `container` itself is never exposed, so no scope, `resolve()` or `createScope()` exists today. `OrchestratorCradle` is referenced by no file outside `src/awilix-cradle.ts` and `src/awilix-cradle-types.ts` (`grep -rn OrchestratorCradle src scripts tests`).

### 3a. Callers of `createCradle` and the keys they read

| caller | `createCradle` line | keys read |
|---|---|---|
| `src/index.tsx` | `:12` | whole cradle passed to `new Orchestrator(cradle)` (`:14`); `logger` (`:17`, `new DashboardServer(orchestrator.observer, cradle.logger)`) |
| `scripts/run-agent.ts` | `:53` | `profileSetup` (`:88`), `workspaceManager` (`:89`), `containerFactory` (`:91`), `stageWorkspaces` (`:101`) |
| `scripts/run-hooks.ts` | `:97` | `hookRunner` (`:144`) |
| `tests/orchestrator-factory.test.ts` | `:39, :55, :63, :70, :81, :92, :105, :113` (8 calls) | activityLog, claudeAuth, cliRuntimes, connectors, containerFactory, dataSources, executorFactory, heartbeat, issueManager, ledger, logger, overlayWriter, pollers, profiles, resources, router, taskRunner, triggerScanner, workspaceManager (19 distinct) |

No other file in `src/`, `scripts/` or `tests/` calls `createCradle` (`grep -rn createCradle`: 4 files + `src/awilix-cradle.ts`).

### 3b. `Orchestrator` constructor (receives the proxy)

Destructures 14 keys: dataSources, profiles, activityLog, pollers, router, issueManager, resources, vcsSourceClient, taskRunner, triggerScanner, ledger, heartbeat, ralphchivesConfig, outputConfig. Its type also declares `logger?: Logger` which is never read. The declared type is a hand-written inline object, not `Pick<OrchestratorCradle, ...>`. Tests (`tests/orchestrator/orchestrator-e2e.test.ts` 23, `shutdown.test.ts` 1) pass a hand-built deps object.

### 3c. Keys read by each registered service (constructor deps = cradle keys; PROXY mode)

| token | read by (keys) |
|---|---|
| activityLog | outputConfig |
| logger, containerLogger | activityLog |
| issueManager, resources | connectors, logger |
| vcsSourceClient | none |
| ledger, logCollector | outputConfig |
| router | profiles |
| triggerScanner | issueManager, router, ledger, logger, connectors |
| cliRuntimes | claudeAuth |
| promptBuilder | promptAuditConfig, logger |
| agentCatalogs | none (hand `rootDir`) |
| executorFactory | cliRuntimes, agentCatalogs (+ hand `rootDir`) |
| stageWorkspaces | cliRuntimes (+ hand `rootDir`) |
| templateRenderer | agentCatalogs, cliRuntimes |
| skillRenderer, jitMcpConfig | none |
| overlayWriter | cliRuntimes, agentCatalogs |
| containerFactory (`buildContainerFactory`) | outputConfig, enableContinuation, cliRuntimes, executorFactory, promptBuilder, logger, containerLogger |
| workspaceManager | logger, cliRuntimes (+ hand `sourceReposDir`) |
| profileSetup | logger, cliRuntimes, templateRenderer, skillRenderer, overlayWriter, jitMcpConfig, stageWorkspaces |
| pipelineExecutor | logger, profileSetup, stageWorkspaces |
| textRedactor | none |
| runArtifacts | cliRuntimes, textRedactor, logger |
| resultWriter | logCollector, resources, runArtifacts, logger |
| hookRunner | logger, profileSetup, containerFactory, stageWorkspaces |
| taskRunner | logger, containerFactory, resources, resultWriter, issueManager, profileSetup, pipelineExecutor, workspaceManager, hookRunner |
| heartbeat | dashboardConfig, logger |

Tokens with no reader in `src/`: `secrets` (registered at `awilix-cradle.ts:141`, typed at `awilix-cradle-types.ts:55`, read by nothing). Tokens read by `Orchestrator` and by no other service: dataSources, ralphchivesConfig, pollers, vcsSourceClient, heartbeat.

### 3d. Constructor deps that are NOT cradle tokens (would fail a compile-time cradle check unless registered or scoped)

- `AgentSessionRunner.continuationRunner` (built just before it, `awilix-cradle.ts:89-90, :114-115`).
- `ContainerManager`: profile, workspacePath, compose, logs, cleaner, logRegistry, sessionRunner (7 of 12 keys; the other 5: cliRuntimes, executorFactory, logger, containerLogger, enableContinuation).
- `ContainerLogCollector`, `ContainerWorkspaceCleaner`: `compose` (per task); `ContainerLogCollector.logDir` (= `outputConfig.logDir`, renamed key).
- `CliExecutorFactory`, `StageWorkspaceResolver`, `AgentCatalogProvider`: `rootDir`. `TaskWorkspaceManager`: `sourceReposDir`. `HookRulesRedactor`: optional `scriptPath`, `env`.
- Positional / non-destructured constructors (cannot be resolved by `InjectionMode.PROXY`): AgentCatalog, ComposeClient, ComposeFileResolver, JiraConnector, JiraWorkItemPoller, JiraIssueParser, OrchestratorObserver, DashboardServer, StreamCapture, VcsSourceClient, AppStartup (optional single bag, not destructured). Second positional params that awilix never supplies: `ActivityLog.maxLines`, `ProfileRouter.fetchComments`, `JiraClient.retryOptions`.
- Executors: ClaudeCodeExecutor, CopilotExecutor, LocalClaudeCodeExecutor, LocalCopilotExecutor take per-stage data (compose, profile, stage, agentName, subagentDepth, subagents, workspace, binary, hooksDir, runtime).
- `OrchestratorCradle.promptBuilder` is typed by the class `PromptBuilder` (no `IPromptBuilder`); `containerFactory`, `connectors`, `pollers`, `heartbeat` are not `I`-prefixed service interfaces.

## 4. Tests that construct a class directly

| class | classification | sites | files (sites) |
|---|---|---|---|
| ProfileRouter | service | 44 | tests/orchestrator/e2e-helpers.ts(2), tests/orchestrator/orchestrator.test.ts(4), tests/services/comment-flow.test.ts(1), tests/services/profile-routing.test.ts(4), tests/services/trigger-cache.test.ts(4), tests/services/trigger-scanner.test.ts(29) |
| Orchestrator | service | 24 | tests/orchestrator/orchestrator-e2e.test.ts(23), tests/orchestrator/shutdown.test.ts(1) |
| TaskRunner | service | 22 | tests/services/task-runner.test.ts(22) |
| StreamCapture | value/state holder | 21 | tests/container/stream-capture.test.ts(21) |
| OrchestratorObserver | service | 19 | tests/orchestrator/orchestrator-observer.test.ts(19) |
| ClaudeCodeRuntime | strategy | 18 | tests/cli/claude/claude-runtime.test.ts(11), tests/container/cli-executors/claude-code-executor.test.ts(2), tests/container/cli-executors/local-claude-code-executor.test.ts(2), tests/container/log-source-registry.test.ts(1), tests/services/run-artifacts-deriver.test.ts(2) |
| ClaudeStreamJsonDecoder | value/state holder | 15 | tests/cli/claude/stream-json-decoder.test.ts(12), tests/container/stream-capture.test.ts(3) |
| ActivityLog | service | 13 | tests/orchestrator/e2e-helpers.ts(2), tests/services/activity-log.test.ts(11) |
| AppStartup | entry/bootstrap | 12 | tests/app-startup.test.ts(12) |
| AgentCatalog | value/state holder | 11 | tests/cli/agent-catalog.test.ts(6), tests/cli/claude/claude-runtime.test.ts(1), tests/cli/copilot/copilot-runtime.test.ts(1), tests/container/cli-executor-factory.test.ts(1), tests/container/cli-executors/claude-code-executor.test.ts(1), tests/container/compose-overlay-writer.test.ts(1) |
| CliRuntimeRegistry | service | 9 | tests/cli/cli-runtime.test.ts(6), tests/container/continuation-loop.test.ts(1), tests/container/manager.test.ts(1), tests/services/run-artifacts-deriver.test.ts(1) |
| ComposeClient | per-task service | 9 | tests/container/compose-client.test.ts(9) |
| OperationLedger | service | 9 | tests/orchestrator/e2e-helpers.ts(2), tests/services/comment-flow.test.ts(3), tests/services/operation-ledger.test.ts(2), tests/services/trigger-cache.test.ts(1), tests/services/trigger-scanner.test.ts(1) |
| ContainerWorkspaceCleaner | per-task service | 8 | tests/container/workspace-cleaner.test.ts(8) |
| HookRulesRedactor | stateless | 8 | tests/logs/text-redactor.test.ts(6), tests/services/run-artifacts-deriver.test.ts(2) |
| JiraIssueParser | value/state holder | 8 | tests/datasource/connectors/jira/issue-parser.test.ts(8) |
| PromptBuilder | service | 7 | tests/prompt/prompt-builder.test.ts(1), tests/prompt/prompt-pipeline.test.ts(6) |
| CopilotRuntime | strategy | 6 | tests/cli/copilot/copilot-runtime.test.ts(2), tests/container/cli-executors/copilot-executor.test.ts(1), tests/container/cli-executors/local-copilot-executor.test.ts(2), tests/container/log-source-registry.test.ts(1) |
| PlainTextDecoder | value/state holder | 5 | tests/cli/plain-text-decoder.test.ts(3), tests/container/cli-executors/shared-exec.test.ts(1), tests/helpers/mocks.ts(1) |
| AgentCatalogProvider | stateless | 4 | tests/container/agent-catalogs.test.ts(3), tests/container/agent-includes.test.ts(1) |
| TriggerScanner | service | 4 | tests/orchestrator/e2e-helpers.ts(2), tests/services/trigger-cache.test.ts(1), tests/services/trigger-scanner.test.ts(1) |
| ComposeFileResolver | stateless | 3 | tests/container/compose-files.test.ts(3) |
| JiraClient | service | 3 | tests/datasource/connectors/jira/jira-client.test.ts(3) |
| SkillTemplateRenderer | stateless | 3 | tests/container/skill-includes.test.ts(3) |
| StageWorkspaceResolver | service | 3 | tests/services/post-task-hook-runner.test.ts(1), tests/services/profile-setup-service.test.ts(1), tests/services/stage-workspace.test.ts(1) |
| AgentPipelineExecutor | service | 2 | tests/services/agent-pipeline-executor.test.ts(2) |
| AgentSessionRunner | service | 2 | tests/container/agent-session-runner.test.ts(1), tests/container/continuation-loop.test.ts(1) |
| ClaudeSessionIds | value/state holder | 2 | tests/cli/claude/claude-session.test.ts(2) |
| ComposeOverlayWriter | service | 2 | tests/container/compose-overlay-writer.test.ts(2) |
| ContainerManager | per-task service | 2 | tests/container/continuation-loop.test.ts(1), tests/container/manager.test.ts(1) |
| JiraConnector | service | 2 | tests/datasource/connector-compliance.test.ts(1), tests/datasource/connectors/jira/jira-connector.test.ts(1) |
| TaskWorkspaceManager | service | 2 | tests/services/task-workspace-manager.git.test.ts(1), tests/services/task-workspace-manager.test.ts(1) |
| VcsSourceClient | service | 2 | tests/services/vcs-source-client.test.ts(2) |
| AgentTemplateRenderer | service | 1 | tests/container/agent-includes.test.ts(1) |
| ClaudeAgentWriter | strategy | 1 | tests/cli/claude/claude-agent-writer.test.ts(1) |
| CliExecutorFactory | service | 1 | tests/container/cli-executor-factory.test.ts(1) |
| ContainerLogCollector | per-task service | 1 | tests/container/container-log-collector.test.ts(1) |
| ContinuationRunner | service | 1 | tests/container/continuation-loop.test.ts(1) |
| CopilotAgentWriter | strategy | 1 | tests/cli/copilot/copilot-agent-writer.test.ts(1) |
| CopilotExecutor | per-task service | 1 | tests/container/cli-executors/copilot-executor.test.ts(1) |
| HeartbeatSender | service | 1 | tests/services/heartbeat.test.ts(1) |
| IssueManager | service | 1 | tests/services/issue-manager.test.ts(1) |
| JiraFieldExtractor | stateless | 1 | tests/datasource/connectors/jira/field-extractor.test.ts(1) |
| JiraWorkItemPoller | service | 1 | tests/datasource/connectors/jira/jira-poller.test.ts(1) |
| JitMcpConfigWriter | stateless | 1 | tests/container/jit-mcp-params.test.ts(1) |
| LocalClaudeCodeExecutor | per-task service | 1 | tests/container/cli-executors/local-claude-code-executor.test.ts(1) |
| LocalCopilotExecutor | per-task service | 1 | tests/container/cli-executors/local-copilot-executor.test.ts(1) |
| LogCollector | service | 1 | tests/logs/collector.test.ts(1) |
| LogSourceRegistry | stateless | 1 | tests/container/log-source-registry.test.ts(1) |
| PostTaskHookRunner | service | 1 | tests/services/post-task-hook-runner.test.ts(1) |
| ProfileSetupService | service | 1 | tests/services/profile-setup-service.test.ts(1) |
| RunArtifactsDeriver | service | 1 | tests/services/run-artifacts-deriver.test.ts(1) |
| TaskResourceManager | service | 1 | tests/services/task-resource-manager.test.ts(1) |
| TaskResultWriter | service | 1 | tests/services/task-result-writer.test.ts(1) |
| ClaudeCodeExecutor | per-task service | 1 | tests/container/cli-executors/claude-code-executor.test.ts(1) |

Total: 326 sites in 65 files, across 55 classes. Classes with no direct test construction: AdoVcsSourceProviderClient, AgentDefinitionError, DashboardServer, FrontmatterError, GitHubVcsSourceProviderClient, SectionTag.

Tests that would change if the stateless classes become functions: AdoVcsSourceProviderClient 0; AgentCatalogProvider 4; ClaudeAgentWriter 1; ComposeFileResolver 3; CopilotAgentWriter 1; GitHubVcsSourceProviderClient 0; HookRulesRedactor 8; JiraFieldExtractor 1; JitMcpConfigWriter 1; LogSourceRegistry 1; SkillTemplateRenderer 3 (sum 23).
Tests that also call statics: `ContinuationRunner.continuationBackoff` (4 calls, `tests/container/continuation-loop.test.ts:113-123`), `vi.spyOn(ContinuationRunner, "sleep")` (`:131`), `vi.mocked(ContinuationRunner.sleep)` (`:339`, `:347`); `AgentCatalog.load` (11 calls in 6 test files).

### Appendix 4a: every test `new X(` site (file:line)

- ActivityLog (13): tests/orchestrator/e2e-helpers.ts:72, tests/orchestrator/e2e-helpers.ts:211, tests/services/activity-log.test.ts:33, tests/services/activity-log.test.ts:38, tests/services/activity-log.test.ts:47, tests/services/activity-log.test.ts:58, tests/services/activity-log.test.ts:65, tests/services/activity-log.test.ts:76, tests/services/activity-log.test.ts:87, tests/services/activity-log.test.ts:98, tests/services/activity-log.test.ts:105, tests/services/activity-log.test.ts:115, tests/services/activity-log.test.ts:123
- AgentCatalog (11): tests/cli/claude/claude-runtime.test.ts:16, tests/cli/agent-catalog.test.ts:78, tests/cli/agent-catalog.test.ts:85, tests/cli/agent-catalog.test.ts:107, tests/cli/agent-catalog.test.ts:114, tests/cli/agent-catalog.test.ts:123, tests/cli/agent-catalog.test.ts:137, tests/container/cli-executor-factory.test.ts:14, tests/container/compose-overlay-writer.test.ts:16, tests/cli/copilot/copilot-runtime.test.ts:14, tests/container/cli-executors/claude-code-executor.test.ts:218
- AgentCatalogProvider (4): tests/container/agent-includes.test.ts:389, tests/container/agent-catalogs.test.ts:25, tests/container/agent-catalogs.test.ts:34, tests/container/agent-catalogs.test.ts:48
- AgentPipelineExecutor (2): tests/services/agent-pipeline-executor.test.ts:71, tests/services/agent-pipeline-executor.test.ts:153
- AgentSessionRunner (2): tests/container/agent-session-runner.test.ts:44, tests/container/continuation-loop.test.ts:87
- AgentTemplateRenderer (1): tests/container/agent-includes.test.ts:388
- AppStartup (12): tests/app-startup.test.ts:29, tests/app-startup.test.ts:46, tests/app-startup.test.ts:62, tests/app-startup.test.ts:74, tests/app-startup.test.ts:84, tests/app-startup.test.ts:97, tests/app-startup.test.ts:107, tests/app-startup.test.ts:119, tests/app-startup.test.ts:131, tests/app-startup.test.ts:140, tests/app-startup.test.ts:151, tests/app-startup.test.ts:164
- ClaudeAgentWriter (1): tests/cli/claude/claude-agent-writer.test.ts:18
- ClaudeCodeExecutor (1): tests/container/cli-executors/claude-code-executor.test.ts:76
- ClaudeCodeRuntime (18): tests/cli/claude/claude-runtime.test.ts:25, tests/cli/claude/claude-runtime.test.ts:30, tests/cli/claude/claude-runtime.test.ts:53, tests/cli/claude/claude-runtime.test.ts:129, tests/cli/claude/claude-runtime.test.ts:136, tests/cli/claude/claude-runtime.test.ts:144, tests/cli/claude/claude-runtime.test.ts:173, tests/cli/claude/claude-runtime.test.ts:191, tests/cli/claude/claude-runtime.test.ts:211, tests/cli/claude/claude-runtime.test.ts:220, tests/cli/claude/claude-runtime.test.ts:231, tests/container/log-source-registry.test.ts:33, tests/container/cli-executors/claude-code-executor.test.ts:82, tests/container/cli-executors/claude-code-executor.test.ts:215, tests/container/cli-executors/local-claude-code-executor.test.ts:60, tests/container/cli-executors/local-claude-code-executor.test.ts:105, tests/services/run-artifacts-deriver.test.ts:224, tests/services/run-artifacts-deriver.test.ts:253
- ClaudeSessionIds (2): tests/cli/claude/claude-session.test.ts:91, tests/cli/claude/claude-session.test.ts:96
- ClaudeStreamJsonDecoder (15): tests/container/stream-capture.test.ts:238, tests/container/stream-capture.test.ts:259, tests/container/stream-capture.test.ts:283, tests/cli/claude/stream-json-decoder.test.ts:18, tests/cli/claude/stream-json-decoder.test.ts:151, tests/cli/claude/stream-json-decoder.test.ts:166, tests/cli/claude/stream-json-decoder.test.ts:192, tests/cli/claude/stream-json-decoder.test.ts:213, tests/cli/claude/stream-json-decoder.test.ts:224, tests/cli/claude/stream-json-decoder.test.ts:235, tests/cli/claude/stream-json-decoder.test.ts:255, tests/cli/claude/stream-json-decoder.test.ts:268, tests/cli/claude/stream-json-decoder.test.ts:273, tests/cli/claude/stream-json-decoder.test.ts:283, tests/cli/claude/stream-json-decoder.test.ts:300
- CliExecutorFactory (1): tests/container/cli-executor-factory.test.ts:22
- CliRuntimeRegistry (9): tests/cli/cli-runtime.test.ts:42, tests/cli/cli-runtime.test.ts:50, tests/cli/cli-runtime.test.ts:62, tests/cli/cli-runtime.test.ts:73, tests/cli/cli-runtime.test.ts:81, tests/cli/cli-runtime.test.ts:94, tests/container/continuation-loop.test.ts:98, tests/container/manager.test.ts:124, tests/services/run-artifacts-deriver.test.ts:51
- ComposeClient (9): tests/container/compose-client.test.ts:33, tests/container/compose-client.test.ts:45, tests/container/compose-client.test.ts:57, tests/container/compose-client.test.ts:68, tests/container/compose-client.test.ts:77, tests/container/compose-client.test.ts:88, tests/container/compose-client.test.ts:98, tests/container/compose-client.test.ts:112, tests/container/compose-client.test.ts:121
- ComposeFileResolver (3): tests/container/compose-files.test.ts:22, tests/container/compose-files.test.ts:38, tests/container/compose-files.test.ts:51
- ComposeOverlayWriter (2): tests/container/compose-overlay-writer.test.ts:322, tests/container/compose-overlay-writer.test.ts:339
- ContainerLogCollector (1): tests/container/container-log-collector.test.ts:68
- ContainerManager (2): tests/container/continuation-loop.test.ts:94, tests/container/manager.test.ts:120
- ContainerWorkspaceCleaner (8): tests/container/workspace-cleaner.test.ts:11, tests/container/workspace-cleaner.test.ts:51, tests/container/workspace-cleaner.test.ts:71, tests/container/workspace-cleaner.test.ts:83, tests/container/workspace-cleaner.test.ts:122, tests/container/workspace-cleaner.test.ts:134, tests/container/workspace-cleaner.test.ts:156, tests/container/workspace-cleaner.test.ts:167
- ContinuationRunner (1): tests/container/continuation-loop.test.ts:86
- CopilotAgentWriter (1): tests/cli/copilot/copilot-agent-writer.test.ts:13
- CopilotExecutor (1): tests/container/cli-executors/copilot-executor.test.ts:14
- CopilotRuntime (6): tests/cli/copilot/copilot-runtime.test.ts:21, tests/cli/copilot/copilot-runtime.test.ts:26, tests/container/cli-executors/copilot-executor.test.ts:17, tests/container/log-source-registry.test.ts:32, tests/container/cli-executors/local-copilot-executor.test.ts:41, tests/container/cli-executors/local-copilot-executor.test.ts:64
- HeartbeatSender (1): tests/services/heartbeat.test.ts:22
- HookRulesRedactor (8): tests/logs/text-redactor.test.ts:27, tests/logs/text-redactor.test.ts:76, tests/logs/text-redactor.test.ts:116, tests/logs/text-redactor.test.ts:126, tests/logs/text-redactor.test.ts:138, tests/logs/text-redactor.test.ts:150, tests/services/run-artifacts-deriver.test.ts:225, tests/services/run-artifacts-deriver.test.ts:254
- IssueManager (1): tests/services/issue-manager.test.ts:19
- JiraClient (3): tests/datasource/connectors/jira/jira-client.test.ts:59, tests/datasource/connectors/jira/jira-client.test.ts:124, tests/datasource/connectors/jira/jira-client.test.ts:145
- JiraConnector (2): tests/datasource/connector-compliance.test.ts:169, tests/datasource/connectors/jira/jira-connector.test.ts:15
- JiraFieldExtractor (1): tests/datasource/connectors/jira/field-extractor.test.ts:5
- JiraIssueParser (8): tests/datasource/connectors/jira/issue-parser.test.ts:14, tests/datasource/connectors/jira/issue-parser.test.ts:24, tests/datasource/connectors/jira/issue-parser.test.ts:32, tests/datasource/connectors/jira/issue-parser.test.ts:50, tests/datasource/connectors/jira/issue-parser.test.ts:59, tests/datasource/connectors/jira/issue-parser.test.ts:67, tests/datasource/connectors/jira/issue-parser.test.ts:75, tests/datasource/connectors/jira/issue-parser.test.ts:83
- JiraWorkItemPoller (1): tests/datasource/connectors/jira/jira-poller.test.ts:26
- JitMcpConfigWriter (1): tests/container/jit-mcp-params.test.ts:30
- LocalClaudeCodeExecutor (1): tests/container/cli-executors/local-claude-code-executor.test.ts:98
- LocalCopilotExecutor (1): tests/container/cli-executors/local-copilot-executor.test.ts:61
- LogCollector (1): tests/logs/collector.test.ts:15
- LogSourceRegistry (1): tests/container/log-source-registry.test.ts:77
- OperationLedger (9): tests/services/trigger-cache.test.ts:42, tests/services/operation-ledger.test.ts:21, tests/services/operation-ledger.test.ts:299, tests/services/trigger-scanner.test.ts:50, tests/services/comment-flow.test.ts:21, tests/services/comment-flow.test.ts:172, tests/services/comment-flow.test.ts:188, tests/orchestrator/e2e-helpers.ts:74, tests/orchestrator/e2e-helpers.ts:194
- Orchestrator (24): tests/orchestrator/shutdown.test.ts:115, tests/orchestrator/orchestrator-e2e.test.ts:48, tests/orchestrator/orchestrator-e2e.test.ts:88, tests/orchestrator/orchestrator-e2e.test.ts:128, tests/orchestrator/orchestrator-e2e.test.ts:158, tests/orchestrator/orchestrator-e2e.test.ts:188, tests/orchestrator/orchestrator-e2e.test.ts:214, tests/orchestrator/orchestrator-e2e.test.ts:266, tests/orchestrator/orchestrator-e2e.test.ts:304, tests/orchestrator/orchestrator-e2e.test.ts:325, tests/orchestrator/orchestrator-e2e.test.ts:346, tests/orchestrator/orchestrator-e2e.test.ts:383, tests/orchestrator/orchestrator-e2e.test.ts:404, tests/orchestrator/orchestrator-e2e.test.ts:425, tests/orchestrator/orchestrator-e2e.test.ts:450, tests/orchestrator/orchestrator-e2e.test.ts:508, tests/orchestrator/orchestrator-e2e.test.ts:533, tests/orchestrator/orchestrator-e2e.test.ts:563, tests/orchestrator/orchestrator-e2e.test.ts:607, tests/orchestrator/orchestrator-e2e.test.ts:657, tests/orchestrator/orchestrator-e2e.test.ts:699, tests/orchestrator/orchestrator-e2e.test.ts:741, tests/orchestrator/orchestrator-e2e.test.ts:781, tests/orchestrator/orchestrator-e2e.test.ts:825
- OrchestratorObserver (19): tests/orchestrator/orchestrator-observer.test.ts:31, tests/orchestrator/orchestrator-observer.test.ts:41, tests/orchestrator/orchestrator-observer.test.ts:50, tests/orchestrator/orchestrator-observer.test.ts:55, tests/orchestrator/orchestrator-observer.test.ts:77, tests/orchestrator/orchestrator-observer.test.ts:85, tests/orchestrator/orchestrator-observer.test.ts:90, tests/orchestrator/orchestrator-observer.test.ts:99, tests/orchestrator/orchestrator-observer.test.ts:111, tests/orchestrator/orchestrator-observer.test.ts:120, tests/orchestrator/orchestrator-observer.test.ts:125, tests/orchestrator/orchestrator-observer.test.ts:139, tests/orchestrator/orchestrator-observer.test.ts:151, tests/orchestrator/orchestrator-observer.test.ts:160, tests/orchestrator/orchestrator-observer.test.ts:165, tests/orchestrator/orchestrator-observer.test.ts:175, tests/orchestrator/orchestrator-observer.test.ts:188, tests/orchestrator/orchestrator-observer.test.ts:194, tests/orchestrator/orchestrator-observer.test.ts:195
- PlainTextDecoder (5): tests/helpers/mocks.ts:240, tests/cli/plain-text-decoder.test.ts:7, tests/cli/plain-text-decoder.test.ts:15, tests/cli/plain-text-decoder.test.ts:24, tests/container/cli-executors/shared-exec.test.ts:30
- PostTaskHookRunner (1): tests/services/post-task-hook-runner.test.ts:55
- ProfileRouter (44): tests/orchestrator/e2e-helpers.ts:73, tests/orchestrator/e2e-helpers.ts:195, tests/services/comment-flow.test.ts:107, tests/services/trigger-cache.test.ts:56, tests/services/trigger-cache.test.ts:79, tests/services/trigger-cache.test.ts:100, tests/services/trigger-cache.test.ts:115, tests/orchestrator/orchestrator.test.ts:24, tests/orchestrator/orchestrator.test.ts:37, tests/orchestrator/orchestrator.test.ts:48, tests/orchestrator/orchestrator.test.ts:59, tests/services/profile-routing.test.ts:11, tests/services/profile-routing.test.ts:140, tests/services/profile-routing.test.ts:204, tests/services/profile-routing.test.ts:224, tests/services/trigger-scanner.test.ts:64, tests/services/trigger-scanner.test.ts:84, tests/services/trigger-scanner.test.ts:100, tests/services/trigger-scanner.test.ts:118, tests/services/trigger-scanner.test.ts:132, tests/services/trigger-scanner.test.ts:146, tests/services/trigger-scanner.test.ts:160, tests/services/trigger-scanner.test.ts:180, tests/services/trigger-scanner.test.ts:197, tests/services/trigger-scanner.test.ts:212, tests/services/trigger-scanner.test.ts:227, tests/services/trigger-scanner.test.ts:240, tests/services/trigger-scanner.test.ts:254, tests/services/trigger-scanner.test.ts:271, tests/services/trigger-scanner.test.ts:283, tests/services/trigger-scanner.test.ts:296, tests/services/trigger-scanner.test.ts:313, tests/services/trigger-scanner.test.ts:333, tests/services/trigger-scanner.test.ts:354, tests/services/trigger-scanner.test.ts:373, tests/services/trigger-scanner.test.ts:393, tests/services/trigger-scanner.test.ts:413, tests/services/trigger-scanner.test.ts:427, tests/services/trigger-scanner.test.ts:440, tests/services/trigger-scanner.test.ts:460, tests/services/trigger-scanner.test.ts:477, tests/services/trigger-scanner.test.ts:496, tests/services/trigger-scanner.test.ts:509, tests/services/trigger-scanner.test.ts:522
- ProfileSetupService (1): tests/services/profile-setup-service.test.ts:43
- PromptBuilder (7): tests/prompt/prompt-builder.test.ts:16, tests/prompt/prompt-pipeline.test.ts:40, tests/prompt/prompt-pipeline.test.ts:62, tests/prompt/prompt-pipeline.test.ts:91, tests/prompt/prompt-pipeline.test.ts:105, tests/prompt/prompt-pipeline.test.ts:122, tests/prompt/prompt-pipeline.test.ts:132
- RunArtifactsDeriver (1): tests/services/run-artifacts-deriver.test.ts:51
- SkillTemplateRenderer (3): tests/container/skill-includes.test.ts:250, tests/container/skill-includes.test.ts:265, tests/container/skill-includes.test.ts:277
- StageWorkspaceResolver (3): tests/services/post-task-hook-runner.test.ts:51, tests/services/profile-setup-service.test.ts:50, tests/services/stage-workspace.test.ts:10
- StreamCapture (21): tests/container/stream-capture.test.ts:18, tests/container/stream-capture.test.ts:29, tests/container/stream-capture.test.ts:41, tests/container/stream-capture.test.ts:52, tests/container/stream-capture.test.ts:62, tests/container/stream-capture.test.ts:74, tests/container/stream-capture.test.ts:87, tests/container/stream-capture.test.ts:99, tests/container/stream-capture.test.ts:111, tests/container/stream-capture.test.ts:118, tests/container/stream-capture.test.ts:134, tests/container/stream-capture.test.ts:149, tests/container/stream-capture.test.ts:164, tests/container/stream-capture.test.ts:181, tests/container/stream-capture.test.ts:198, tests/container/stream-capture.test.ts:215, tests/container/stream-capture.test.ts:238, tests/container/stream-capture.test.ts:259, tests/container/stream-capture.test.ts:283, tests/container/stream-capture.test.ts:306, tests/container/stream-capture.test.ts:320
- TaskResourceManager (1): tests/services/task-resource-manager.test.ts:23
- TaskResultWriter (1): tests/services/task-result-writer.test.ts:43
- TaskRunner (22): tests/services/task-runner.test.ts:94, tests/services/task-runner.test.ts:126, tests/services/task-runner.test.ts:200, tests/services/task-runner.test.ts:233, tests/services/task-runner.test.ts:254, tests/services/task-runner.test.ts:279, tests/services/task-runner.test.ts:299, tests/services/task-runner.test.ts:320, tests/services/task-runner.test.ts:341, tests/services/task-runner.test.ts:372, tests/services/task-runner.test.ts:395, tests/services/task-runner.test.ts:416, tests/services/task-runner.test.ts:441, tests/services/task-runner.test.ts:466, tests/services/task-runner.test.ts:492, tests/services/task-runner.test.ts:517, tests/services/task-runner.test.ts:541, tests/services/task-runner.test.ts:563, tests/services/task-runner.test.ts:585, tests/services/task-runner.test.ts:607, tests/services/task-runner.test.ts:629, tests/services/task-runner.test.ts:662
- TaskWorkspaceManager (2): tests/services/task-workspace-manager.git.test.ts:56, tests/services/task-workspace-manager.test.ts:75
- TriggerScanner (4): tests/services/trigger-cache.test.ts:22, tests/services/trigger-scanner.test.ts:29, tests/orchestrator/e2e-helpers.ts:108, tests/orchestrator/e2e-helpers.ts:199
- VcsSourceClient (2): tests/services/vcs-source-client.test.ts:8, tests/services/vcs-source-client.test.ts:107

## 5. References outside the import graph

Search scope: tracked files (`git grep`) outside `src/`, `tests/`, `scripts/`, excluding `containment/`; plus the in-tree places below. Word-boundary match on class name (for `Orchestrator`: backticked `Orchestrator`, `new Orchestrator`, `class Orchestrator` only, since the bare word is also the product name).

### 5a. Class names in docs / markdown / skills (hits, files)

| class | hits | files | where (file(hits)) |
| ActivityLog | 5 | 2 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/log-map.md(4)  |
| AgentCatalog | 2 | 2 | AGENTS.md(1) docs/dev-doc/agent-templates.md(1)  |
| AgentCatalogProvider | 1 | 1 | docs/dev-doc/agent-templates.md(1)  |
| AgentPipelineExecutor | 5 | 4 | .claude/skills/task-failure-diagnosis/references/code-paths.md(2) AGENTS.md(1) ARCHITECTURE.md(1) docs/dev-doc/dataflow.drawio(1)  |
| AgentSessionRunner | 4 | 4 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1)  |
| AgentTemplateRenderer | 8 | 7 | .claude/skills/ralph-agent-authoring/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(2) CONFIGURATION.md(1) docs/dev-doc/agent-templates.md(1) docs/user-guide/template-variables.md(1)  |
| AppStartup | 6 | 5 | AGENTS.md(2) ARCHITECTURE.md(1) docs/dev-doc/data-source-registration.md(1) docs/dev-doc/dependency-injection.md(1) docs/user-guide/trigger-parameters.md(1)  |
| ClaudeCodeExecutor | 12 | 5 | .ai/agent-working-rules.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(2) ARCHITECTURE.md(2) plans/claude-cli-parity-audit.md(6) todos/cli-optimization.md(1)  |
| CliExecutorFactory | 6 | 5 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) docs/dev-doc/dependency-injection.md(1) todos/cli-optimization.md(2)  |
| CliRuntimeRegistry | 1 | 1 | AGENTS.md(1)  |
| ComposeClient | 13 | 7 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(2) SECURITY.md(2) docs/dev-doc/compose-layering.md(4) shared/security/docker-compose.security.yml(1) todos/parallelism.md(2)  |
| ComposeFileResolver | 4 | 3 | AGENTS.md(1) ARCHITECTURE.md(2) docs/dev-doc/compose-layering.md(1)  |
| ComposeOverlayWriter | 4 | 4 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(1) MCP.md(1)  |
| ContainerLogCollector | 3 | 3 | .claude/skills/task-failure-diagnosis/references/log-map.md(1) ARCHITECTURE.md(1) SECURITY.md(1)  |
| ContainerManager | 16 | 8 | .claude/skills/task-failure-diagnosis/references/code-paths.md(5) .claude/skills/task-failure-diagnosis/references/log-map.md(1) AGENTS.md(2) ARCHITECTURE.md(2) README.md(3) docs/dev-doc/dependency-injection.md(1) plans/claude-cli-parity-audit.md(1) todos/parallelism.md(1)  |
| ContainerWorkspaceCleaner | 3 | 3 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) todos/container-security.md(1)  |
| ContinuationRunner | 7 | 5 | .claude/skills/task-failure-diagnosis/references/code-paths.md(2) .claude/skills/task-failure-diagnosis/references/failure-signatures.md(1) .claude/skills/test-patterns/SKILL.md(2) AGENTS.md(1) ARCHITECTURE.md(1)  |
| CopilotExecutor | 8 | 4 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) ARCHITECTURE.md(2) plans/claude-cli-parity-audit.md(2) todos/cli-optimization.md(1)  |
| DashboardServer | 6 | 4 | AGENTS.md(2) ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1) todos/dashboard.md(2)  |
| IssueManager | 4 | 3 | .claude/rules/testing.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) .claude/skills/test-patterns/SKILL.md(2)  |
| JiraClient | 9 | 7 | .claude/skills/test-patterns/SKILL.md(1) AGENTS.md(1) docs/conventions/stack-profile.md(1) docs/dev-doc/data-source-registration.md(1) docs/dev-doc/dependency-injection.md(2) todos/jira-image-attachments.md(1) todos/jira-linked-issues.md(2)  |
| JiraConnector | 3 | 2 | docs/dev-doc/data-source-registration.md(2) docs/dev-doc/dependency-injection.md(1)  |
| JiraWorkItemPoller | 6 | 4 | ARCHITECTURE.md(2) docs/dev-doc/data-source-registration.md(1) docs/dev-doc/dataflow.drawio(2) docs/dev-doc/dependency-injection.md(1)  |
| JitMcpConfigWriter | 8 | 6 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(1) CONFIGURATION.md(1) MCP.md(3) docs/dev-doc/dataflow.drawio(1)  |
| LocalClaudeCodeExecutor | 7 | 4 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) ARCHITECTURE.md(2) SECURITY.md(1) docs/dev-doc/multistage-pipelines.md(1)  |
| LocalCopilotExecutor | 7 | 4 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) ARCHITECTURE.md(2) SECURITY.md(1) docs/dev-doc/multistage-pipelines.md(1)  |
| LogCollector | 4 | 4 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/log-map.md(1) dashboard-local/src/types.ts(1) docs/research/approach-1-trajectory-process.md(1)  |
| LogSourceRegistry | 2 | 2 | .claude/skills/task-failure-diagnosis/references/log-map.md(1) ARCHITECTURE.md(1)  |
| OperationLedger | 10 | 6 | .claude/skills/task-failure-diagnosis/references/log-map.md(1) dashboard-local/src/logApiPlugin.test.ts(1) dashboard-local/src/logApiPlugin.ts(2) docs/dev-doc/dataflow.drawio(2) docs/dev-doc/dependency-injection.md(1) shared/skills/domain/test-structure-patterns/references/examples.md(3)  |
| Orchestrator | 6 | 4 | AGENTS.md(2) ARCHITECTURE.md(2) docs/conventions/test-layout.md(1) docs/dev-doc/dependency-injection.md(1)  |
| OrchestratorObserver | 2 | 2 | ARCHITECTURE.md(1) todos/parallelism.md(1)  |
| PostTaskHookRunner | 5 | 3 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(3) docs/dev-doc/multistage-pipelines.md(1)  |
| ProfileSetupService | 9 | 7 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) AGENTS.md(1) ARCHITECTURE.md(1) README.md(1) docs/dev-doc/agent-templates.md(1) docs/dev-doc/multistage-pipelines.md(1) docs/gotchas.md(1)  |
| PromptBuilder | 9 | 6 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(2) ARCHITECTURE.md(1) docs/conventions/stack-profile.md(2) docs/conventions/test-layout.md(1) docs/dev-doc/dependency-injection.md(2)  |
| RunArtifactsDeriver | 2 | 2 | AGENTS.md(1) ARCHITECTURE.md(1)  |
| SkillTemplateRenderer | 3 | 3 | .claude/skills/ralph-agent-authoring/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1)  |
| StageWorkspaceResolver | 6 | 6 | .claude/skills/ralph-agent-authoring/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(1) docs/dev-doc/agent-as-function.md(1) docs/dev-doc/multistage-pipelines.md(1)  |
| StreamCapture | 10 | 6 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(2) .claude/skills/task-failure-diagnosis/references/failure-signatures.md(3) .claude/skills/task-failure-diagnosis/references/log-map.md(1) ARCHITECTURE.md(1) todos/cli-optimization.md(2)  |
| TaskResourceManager | 1 | 1 | .claude/skills/test-patterns/SKILL.md(1)  |
| TaskResultWriter | 14 | 5 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(4) README.md(3) docs/dev-doc/dataflow.drawio(5)  |
| TaskRunner | 41 | 13 | .claude/skills/task-failure-diagnosis/references/code-paths.md(2) .claude/skills/task-failure-diagnosis/references/log-map.md(1) AGENTS.md(1) ARCHITECTURE.md(12) README.md(8) docs/dev-doc/agent-templates.md(1) docs/dev-doc/dataflow.drawio(5) docs/dev-doc/dependency-injection.md(3) docs/dev-doc/multistage-pipelines.md(1) docs/dev-doc/ralphchives.md(1) docs/research/approach-1-trajectory-process.md(1) docs/user-guide/trigger-parameters.md(2) shared/skills/domain/test-mocking-strategy/references/examples.md(3)  |
| TaskWorkspaceManager | 18 | 7 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) .claude/skills/task-failure-diagnosis/references/failure-signatures.md(1) AGENTS.md(2) ARCHITECTURE.md(6) README.md(3) docs/dev-doc/compose-layering.md(1) docs/user-guide/trigger-parameters.md(2)  |
| TriggerScanner | 6 | 4 | AGENTS.md(2) ARCHITECTURE.md(1) docs/dev-doc/dataflow.drawio(2) docs/gotchas.md(1)  |
| VcsSourceClient | 3 | 3 | AGENTS.md(1) ARCHITECTURE.md(1) docs/conventions/stack-profile.md(1)  |

Total: 309 hits in 41 files across 44 classes. `todos/`, `plans/` and `docs/research/` hold journals/notes; the `dashboard-local/src/*` hits (OperationLedger 3, LogCollector 1) and `shared/skills/domain/*/references/examples.md` hits (OperationLedger 3, TaskRunner 3) are illustrative text, not imports. No doc hit: AdoVcsSourceProviderClient, AgentDefinitionError, ClaudeAgentWriter, ClaudeCodeRuntime, ClaudeSessionIds, ClaudeStreamJsonDecoder, CopilotAgentWriter, CopilotRuntime, FrontmatterError, GitHubVcsSourceProviderClient, HeartbeatSender, HookRulesRedactor, JiraFieldExtractor, JiraIssueParser, PlainTextDecoder, ProfileRouter, SectionTag (17 classes).

### 5b. Doc statements that describe the current wiring and will go stale

- `AGENTS.md:107-110` (§ Adding a DI service: one deps object, `asClass(Foo).singleton()`, "Tests construct `Foo` directly"); `AGENTS.md:114-` ("`awilix-cradle.ts` is the composition root ... but not the only place that constructs things": index.tsx, buildContainerFactory, connector factories, PromptBuilder without an interface); `AGENTS.md:62` (`createCradle(config) -> new Orchestrator(cradle) + DashboardServer`); `AGENTS.md:186` (`mocks.ts` factories).
- `docs/dev-doc/dependency-injection.md` (137 lines): § Rules 2 (`:24-29`, lists code outside the cradle that constructs classes), `:31` (PromptBuilder exception), `:49-114` (abridged `OrchestratorCradle`, omits `cliRuntimes`, `agentCatalogs`, `claudeAuth`, `textRedactor`, `runArtifacts`), `:111-112` (asClass / asFunction list), § Constructors in PROXY Mode (`:116-130`), § Adding a New Service (`:132-137`).
- `docs/conventions/stack-profile.md:75-81` (forbids `new`-ing concrete services; "Per-task objects belong in `buildContainerFactory`"); `docs/conventions/stack-profile.md:5,25,174` (awilix mentions).
- `.claude/rules/testing.md:11` and `.claude/skills/test-patterns/SKILL.md:32` ("Construct services the way the awilix cradle does, with one deps object: `new IssueManager({ connectors, logger })`"); `SKILL.md:34` mentions `manager.retryOptions = { delayMs: 1 }` (set in `tests/services/issue-manager.test.ts:20`, `task-resource-manager.test.ts:27`).
- `ARCHITECTURE.md:142` ("Stateless, single-issue execution pipeline ... Dependencies are injected") and `ARCHITECTURE.md:82` (JIT `AgentTemplateRenderer`).
- `docs/dev-doc/data-source-registration.md` (Jira factory builds JiraClient/JiraConnector/JiraWorkItemPoller; 4 hits across the three classes).
- Stale already: `src/prompt/prompt-builder.ts:35` JSDoc `new PromptBuilder(AuditMode.Warn, logger)` (real ctor is `({ promptAuditConfig, logger })`); `shared/skills/domain/test-mocking-strategy/references/examples.md:141,167` (`new TaskRunner(ledger, ...)` positional) and `shared/skills/domain/test-structure-patterns/references/examples.md:53` (`new OperationLedger(tempDir)`).
- Reading-order docs that cite the files: `.claude/skills/task-failure-diagnosis/references/code-paths.md` (25 class names on 32 lines of its 70) and `.../log-map.md`.

### 5c. Source-path locators to class files in non-code files (file:line, tracked, outside `src/` `tests/` `scripts/`)

89 locators in 36 of the class files; matched with `-F` on `src/<path>.ts` or the extensionless `src/<path>` (so `src/orchestrator` also matches `src/orchestrator-observer`, an upper bound). Per class file (count): 
- `src/container/setup/agent-includes.ts` (8): .claude/rules/runtime-agents.md:11, .claude/skills/ralph-agent-authoring/SKILL.md:22, AGENTS.md:84, AGENTS.md:146, ARCHITECTURE.md:275, docs/conventions/stack-profile.md:106, docs/dev-doc/agent-as-function.md:61, todos/preflight-improvements.md:119
- `src/container/cli-executor-factory.ts` (7): .claude/skills/task-failure-diagnosis/SKILL.md:10, .claude/skills/task-failure-diagnosis/references/code-paths.md:35, plans/claude-cli-parity-audit.md:28, plans/claude-cli-parity-audit.md:140, plans/claude-cli-parity-audit.md:272, todos/cli-optimization.md:59, todos/cli-optimization.md:108
- `src/app-startup.ts` (5): .claude/skills/task-failure-diagnosis/references/code-paths.md:51, AGENTS.md:157, ARCHITECTURE.md:71, docs/dev-doc/data-source-registration.md:11, docs/dev-doc/data-source-registration.md:154
- `src/container/manager.ts` (5): .claude/skills/task-failure-diagnosis/references/code-paths.md:21, ARCHITECTURE.md:109, docs/dev-doc/mcp-sidecar-design.md:344, docs/dev-doc/security-audit-exfiltration.md:148, docs/dev-doc/security-audit-exfiltration.md:167
- `src/services/stage-workspace.ts` (5): .claude/skills/ralph-agent-authoring/SKILL.md:25, .claude/skills/task-failure-diagnosis/references/code-paths.md:18, AGENTS.md:160, docs/dev-doc/agent-as-function.md:61, docs/dev-doc/multistage-pipelines.md:110
- `src/container/cli-executors/claude-code-executor.ts` (4): plans/claude-cli-parity-audit.md:57, plans/claude-cli-parity-audit.md:143, plans/claude-cli-parity-audit.md:270, todos/cli-optimization.md:109
- `src/services/task-runner.ts` (4): .claude/skills/task-failure-diagnosis/references/code-paths.md:10, ARCHITECTURE.md:140, docs/conventions/test-layout.md:15, todos/container-security.md:40
- `src/services/task-workspace-manager.ts` (4): .claude/skills/task-failure-diagnosis/references/code-paths.md:13, AGENTS.md:136, ARCHITECTURE.md:153, docs/dev-doc/compose-layering.md:110
- `src/cli/agent-definition.ts` (3): .claude/rules/runtime-agents.md:14, .claude/skills/ralph-agent-authoring/SKILL.md:29, AGENTS.md:146
- `src/logs/collector.ts` (3): .claude/skills/task-failure-diagnosis/SKILL.md:14, ARCHITECTURE.md:176, shared/agent-includes/post-hooks/agent-improver.md:77
- `src/orchestrator.ts` (3): .claude/skills/task-failure-diagnosis/references/code-paths.md:8, ARCHITECTURE.md:124, todos/preflight-improvements.md:115
- `src/container/agent-session-runner.ts` (2): .claude/skills/task-failure-diagnosis/references/code-paths.md:22, ARCHITECTURE.md:114
- `src/container/cli-executors/copilot-executor.ts` (2): .claude/skills/task-failure-diagnosis/references/code-paths.md:25, plans/claude-cli-parity-audit.md:271
- `src/container/compose-client.ts` (2): .claude/skills/task-failure-diagnosis/references/code-paths.md:27, docs/dev-doc/security-audit-exfiltration.md:196
- `src/container/continuation-runner.ts` (2): .claude/skills/task-failure-diagnosis/references/code-paths.md:24, ARCHITECTURE.md:114
- `src/container/log-collector.ts` (2): .claude/skills/task-failure-diagnosis/references/log-map.md:28, ARCHITECTURE.md:172
- `src/container/log-source-registry.ts` (2): .claude/skills/task-failure-diagnosis/references/log-map.md:28, ARCHITECTURE.md:172
- `src/container/setup/compose-files.ts` (2): AGENTS.md:132, docs/dev-doc/compose-layering.md:125
- `src/container/setup/jit-mcp-params.ts` (2): .claude/skills/mcp-deployment/SKILL.md:41, AGENTS.md:150
- `src/datasource/connectors/jira/jira-client.ts` (2): ARCHITECTURE.md:100, docs/dev-doc/dependency-injection.md:8
- `src/services/agent-pipeline-executor.ts` (2): .claude/skills/task-failure-diagnosis/references/code-paths.md:17, ARCHITECTURE.md:149
- `src/services/dashboard-server.ts` (2): docs/conventions/stack-profile.md:124, todos/dashboard.md:84
- `src/services/operation-ledger.ts` (2): .claude/skills/task-failure-diagnosis/references/log-map.md:36, ARCHITECTURE.md:92
- `src/services/task-result-writer.ts` (2): .claude/skills/task-failure-diagnosis/references/code-paths.md:30, ARCHITECTURE.md:163
- `src/cli/agent-catalog.ts` (1): AGENTS.md:146
- `src/container/setup/liquid-tags.ts` (1): .claude/skills/ralph-agent-authoring/SKILL.md:23
- `src/container/setup/skill-includes.ts` (1): .claude/skills/ralph-agent-authoring/references/skill-wiring.md:14
- `src/container/stream-capture.ts` (1): .claude/skills/task-failure-diagnosis/references/code-paths.md:28
- `src/container/workspace-cleaner.ts` (1): todos/container-security.md:75
- `src/datasource/connectors/jira/jira-poller.ts` (1): ARCHITECTURE.md:84
- `src/prompt/prompt-builder.ts` (1): .claude/skills/task-failure-diagnosis/references/code-paths.md:23
- `src/services/activity-log.ts` (1): .claude/skills/task-failure-diagnosis/references/log-map.md:34
- `src/services/heartbeat.ts` (1): docs/conventions/stack-profile.md:159
- `src/services/issue-manager.ts` (1): .claude/skills/test-patterns/SKILL.md:18
- `src/services/post-task-hook-runner.ts` (1): .claude/skills/task-failure-diagnosis/references/code-paths.md:31
- `src/services/profile-setup-service.ts` (1): .claude/skills/task-failure-diagnosis/references/code-paths.md:11

### 5d. String literals

- `src/cli/agent-definition.ts:97` `this.name = "AgentDefinitionError"`; `src/util/frontmatter.ts:32` `this.name = "FrontmatterError"` (errors stay classes). `instanceof`: AgentDefinitionError 3, FrontmatterError 2 (plus Error 8, ExecaError 3, SyntaxError 1).
- No `constructor.name`, no string equal to a repo class name used as a lookup key (`grep -rnE "constructor\.name"` = 0 in `src`, `tests`, `scripts`). The `"Orchestrator ..."` strings (`orchestrator.ts:182,218,378`, `operation-ledger.ts:308`, `App.tsx:42`, `orchestrator-comments.ts:10`, `task-resource-manager.ts:49`) are product wording, not class refs; the comment prefix `[Ralph-Orchestrator]` is matched by `task-resource-manager.ts:49`.
- Test titles: `describe("PlainTextDecoder" | "CopilotRuntime" | "ClaudeCodeRuntime" | "AgentSessionRunner" | "ContainerManager" | "StreamCapture" | "ComposeClient" | "TaskRunner", ...)`, `describe("ContinuationRunner.continuationBackoff", ...)`, `describe("createCradle", ...)`.

### 5e. `vi.mock` / `vi.spyOn`

- No `vi.mock` targets a `src/` module path. The 10 `vi.mock` calls mock `node:fs` (config, jit-mcp-params, task-runner, task-resource-manager), `node:fs/promises` (task-workspace-manager), `execa` (manager, compose-client, local-copilot-executor, local-claude-code-executor, task-workspace-manager, validate/host-tools). Files that mock `node:fs` and construct a to-be-function class: `tests/container/jit-mcp-params.test.ts:8` (JitMcpConfigWriter, stateless), `tests/services/task-runner.test.ts:36`.
- `vi.spyOn` on a repo class: `tests/container/continuation-loop.test.ts:131` `vi.spyOn(ContinuationRunner, "sleep")` (static method; `continuation-runner.ts:100` calls `ContinuationRunner.sleep`).
- `vi.spyOn(process, "exit")` `tests/app-startup.test.ts:53`; `console` spies in `orchestrator-factory.test.ts:26-27`, `logger.test.ts`, `tests/scripts/reset-testenv/local.test.ts:24`.

### 5f. `tests/helpers/mocks.ts` (`Mocked<I...>` factories; line)

`createSilentLogger` :69, `createMockLogger` :74, `createMockJiraClient` :102, `createMockIssueManager` :118, `createMockResources` :134, `createMockVcsSourceClient` :144, `createMockConnector` :152, `createMockExecutor` :198, `createMockCliRuntime` :211, `createMockCompose` :252, `createMockContainer` :278, `createMockTextRedactor` :337, `createMockLogCollector` :346, `createMockResultWriter` :354, `createMockPoller` :363, `createMockTaskRunner` :377, `createMockProfileSetupService` :386, `createMockWorkspaceManager` :397, `createMockStageWorkspaces` :411, `createMockHookRunner` :433, `createMockPipelineExecutor` :443, `createMockAgentCatalogProvider` :453, `createMockTemplateRenderer` :458, `createMockSkillRenderer` :468, `createMockJitMcpConfigWriter` :478, `createMockOverlayWriter` :488, `createMockStartupDeps` :498 (27 exported, including 2 loggers).

- Factories for interfaces of the stateless classes: `createMockStageWorkspaces` (StageWorkspaceResolver, a `service` here), `createMockAgentCatalogProvider(catalog)` (stateless), `createMockSkillRenderer` (stateless), `createMockJitMcpConfigWriter` (stateless), `createMockTextRedactor` (HookRulesRedactor, stateless).
- `mocks.ts:240` constructs a real `PlainTextDecoder` inside `createMockCliRuntime`; `mocks.ts` and `tests/helpers/factories.ts:301` call `createCliRuntimeRegistry`.
- `tests/orchestrator/e2e-helpers.ts` constructs ActivityLog (2), OperationLedger (2), ProfileRouter (2), TriggerScanner (2) directly (section 4a).
- Interfaces tied to stateless classes in `src/`: `IAgentCatalogProvider`, `ISkillTemplateRenderer`, `IJitMcpConfigWriter`, `ITextRedactor`, `ILogSourceRegistry`, `IAgentFileWriter`; `ComposeFileResolver` has no interface.

## 6. `process.cwd()` uses in `src/`

31 occurrences in `src/` (`grep -rn "process\.cwd()" src`). Those that feed or sit inside constructors:

| file:line | what it feeds | kind |
|---|---|---|
| `src/awilix-cradle.ts:171` | `AgentCatalogProvider({ rootDir })` | ctor arg |
| `src/awilix-cradle.ts:174` | `CliExecutorFactory({ rootDir })` | ctor arg |
| `src/awilix-cradle.ts:178` | `StageWorkspaceResolver({ rootDir })` | ctor arg |
| `src/awilix-cradle.ts:190` | `TaskWorkspaceManager({ sourceReposDir: repoCachePaths(process.cwd()).sourceReposDir })` | ctor arg (derived) |
| `src/awilix-cradle.ts:52` | `buildComposeClient`: `squidConfPath` for `ComposeClient` env config | ctor arg (derived) |
| `src/awilix-cradle.ts:108` | `forceDown`: `workspacesDir` for `ComposeClient` env config | ctor arg (derived) |
| `src/container/setup/profile-setup.ts:89` | default of `rootDir` -> `new AgentCatalogProvider({ rootDir })` (`:91`) | ctor arg via default param |
| `src/container/setup/compose-files.ts:20` | `ComposeFileResolver(rootDir?)` default | ctor default |
| `src/logs/text-redactor.ts:38` | `HookRulesRedactor` `scriptPath` default | ctor default |
| `src/services/activity-log.ts:65` | `ActivityLog` ctor body: `logDir = resolve(process.cwd(), outputConfig.logDir)` | hidden in ctor |
| `src/container/compose-client.ts:72` | `ComposeClient` ctor: `SHARED_HOOKS_PATH` | hidden in ctor |

Not feeding a constructor (inside methods or free functions; hidden root-dir dependencies of services):

- `src/container/setup/agent-includes.ts:422` (AgentTemplateRenderer), `src/container/setup/compose-overlay-writer.ts:118` (ComposeOverlayWriter), `src/container/setup/jit-mcp-params.ts:159` (JitMcpConfigWriter), `src/container/setup/skill-includes.ts:141` (SkillTemplateRenderer), `src/services/task-context.ts:83` (`taskWorkspacePath`), `src/container/setup/mcp-builder.ts:18` (default of `rootDir`).
- Config / validation, run before the cradle: `src/config/loader.ts:54,98,115,116`; `src/validate/index.ts:41`, `env.ts:6`, `config.ts:17`, `host-tools.ts:100`, `profiles.ts:32,78,138,139`, `security.ts:16,36`.
- `scripts/`: `run-hooks.ts:68,135`, `reset-issue.ts:79`, `run-agent.ts:83` (not in `src/`; listed for completeness).

Summary: 6 constructor-argument sites in `awilix-cradle.ts`, 1 default-param site feeding a hand `new`, 2 constructor-default sites, 2 hidden-in-constructor sites, 6 in methods/free functions of services, 14 in config/validation/startup code (`loader` 4 + `validate` 10) = 31.

## Validation (two independent counts)

| quantity | table / generated from this file | independent query |
|---|---|---|
| classes in `src/` | 61 table rows | 61 (`grep -rEh "^\s*(export )?(abstract )?class \w+" src \| wc -l`) |
| `new X(` sites in src (code) | 51 (sum of per-row src counts) | 52 (`grep -rEo` occurrences) minus 1 JSDoc example (`prompt-builder.ts:35`) = 51 |
| `new X(` sites in scripts | 3 | 3 |
| `new X(` sites in tests | 326 (sum of per-row tests counts) | 326 |
| section 4 total | 326 sites in 65 files | 326 occurrences (same as above) |
| section 2 cross-file + same-file | 43 + 8 = 51 | 51 src code sites |
| `asClass(` registrations | 18 listed | 18 (`grep -c "asClass(" src/awilix-cradle.ts`) |
| `process.cwd()` in src | 31 (6+1+2+2+6+14, section 6) | 31 |
| class names with a doc hit | 44 of 61 (`git grep -w` via shell, then re-run through `git --no-pager grep` in python: identical 309 hits) | 309 |

Line-count caveat: tests have 322 matching *lines* but 326 occurrences (some lines construct more than one class); src has 50 lines but 52 occurrences (`supported-runtimes.ts:11` holds 3).

Items inferred rather than read in full (flag for the reader): classification reasons for the 61 classes come from reading each class's field list and constructor (grep-derived for fields; method bodies were read only for the ~15 stateless/strategy candidates); `mutable` is "reassigned or appended" judged from `this.<field>` usage counts, not from a full data-flow read. The doc-hit counts treat every word match as a reference (no semantic filter beyond `Orchestrator`).

---

## Addendum at 04dce62

Task 0 re-derivation on `refactor/awilix-single-wiring` @ 04dce62, the branch base. Since 81a8980 main gained per-task workspace follow-ups, the P6 fixes (`prepareHostStage` in `src/container/cli-executors/host-stage.ts`, `src/services/hook-manifest.ts`, `locateStages`), the structured result (`src/container/agent-result.ts`, result gate removed) and the Claude Code contract test (`tests/cli/claude/claude-contract.test.ts`). Counts come from the commands in plan Task 0; `containment/` excluded. Gate figures: `baseline.md`.

### A1. Constructors and classes in `src/` (Step 4)

- **No constructor signature changed.** `constructor(...)` text in `src/` was extracted at 81a8980 and at 04dce62 (50 constructors in both) and compared: identical. Named deps types (`*Deps`, `*Options`, `*Config` interfaces) differ only in `ClaudeSessionOptions` (`settingSources: ClaudeSettingSources`, new `resultSchema?`), `IDataSourceConfig` (`maxResults` removed) and `IOutputConfig` (`handoffDir` removed); none is a constructor deps type of a table class.
- **Same 61 classes**, same names. No class added or removed (`hook-manifest.ts`, `host-stage.ts`, `agent-result.ts` hold functions and constants only).
- **No change** to `src/awilix-cradle.ts`, `awilix-cradle-types.ts`, `orchestrator.ts`, `index.tsx` or `app-startup.ts`, so §2 and §3 stand, and no later task's rename list needs adjusting.
- **Classification and `mutable` unchanged:** the diffs to `ClaudeAgentWriter`, `ContinuationRunner`, `StageWorkspaceResolver`, `LocalClaudeCodeExecutor` and `ClaudeSessionIds` add no instance field (they change method bodies, new imports and exported constants).
- **Method signature drift** (not constructors): `PostTaskHookRunner.run(ctx, hooks, run: AnalysedRun)` and `TaskRunner` private methods changed; `ContainerLogCollector` and `ContinuationRunner` method bodies changed for the structured result. Task 0 does not depend on these.
- **`new X(` sites in `src/` and `scripts/` (repo classes):** 55 at both revisions, same classes and files. Only line numbers moved:
  - `scripts/run-hooks.ts:85` -> `:64` (AppStartup);
  - `src/container/cli-executors/claude-code-executor.ts:57` -> `:60` (ClaudeSessionIds);
  - `src/container/cli-executors/local-claude-code-executor.ts:73` -> `:74` (ClaudeSessionIds);
  - `src/container/cli-executors/shared-exec.ts:51` -> `:53` (StreamCapture).
- **Class declaration lines that moved** (inventory §1 `file:line`; use these): ActivityLog `src/services/activity-log.ts:42`; AgentTemplateRenderer `src/container/setup/agent-includes.ts:418`; ClaudeAgentWriter `src/cli/claude/claude-agent-writer.ts:72`; ClaudeCodeExecutor `src/container/cli-executors/claude-code-executor.ts:50`; ClaudeSessionIds `src/cli/claude/claude-session.ts:110`; ContainerLogCollector `src/container/log-collector.ts:104`; ContinuationRunner `src/container/continuation-runner.ts:53`; LocalClaudeCodeExecutor `src/container/cli-executors/local-claude-code-executor.ts:61`; LocalCopilotExecutor `src/container/cli-executors/local-copilot-executor.ts:38`; PostTaskHookRunner `src/services/post-task-hook-runner.ts:33`; RunArtifactsDeriver `src/services/run-artifacts-deriver.ts:39`; StageWorkspaceResolver `src/services/stage-workspace.ts:46`; TaskResultWriter `src/services/task-result-writer.ts:19`; TaskRunner `src/services/task-runner.ts:42`.

### A2. §4 re-derived: tests that construct a class directly

`git grep -nE '\bnew [A-Z][A-Za-z0-9]*\(' -- tests` returns 513 lines and 517 occurrences, including classes outside `src/` (`Map`, `Error`, ...). Restricted to the 61 `src/` classes: **347 sites in 69 files across 55 classes** (inventory: 326 / 65 / 55). The 6 classes with no test construction are unchanged: AdoVcsSourceProviderClient, AgentDefinitionError, DashboardServer, FrontmatterError, GitHubVcsSourceProviderClient, SectionTag.

Per-class changes against §4: ActivityLog 13 -> 14, AgentCatalog 11 -> 13, ClaudeCodeRuntime 18 -> 19, ClaudeSessionIds 2 -> 9, ClaudeStreamJsonDecoder 15 -> 18, CopilotRuntime 6 -> 10, PostTaskHookRunner 1 -> 2, StageWorkspaceResolver 3 -> 5, StreamCapture 21 -> 20, TaskRunner 22 -> 23. New files: `tests/cli/claude/claude-contract.test.ts` (ClaudeCodeRuntime 1, ClaudeSessionIds 7, AgentCatalog 1), `tests/cli/claude/claude-host-settings.test.ts` (StageWorkspaceResolver 1), `tests/container/cli-executors/host-stage.test.ts` (CopilotRuntime 4).

Classes the refactor deletes or converts, with their test sites now: AgentCatalogProvider 4, ClaudeAgentWriter 1, CliExecutorFactory 1, ComposeFileResolver 3, CopilotAgentWriter 1, HookRulesRedactor 8, JitMcpConfigWriter 1, LogSourceRegistry 1, SkillTemplateRenderer 3, JiraFieldExtractor 1 (23 for the stateless set as in §4, plus CliExecutorFactory 1).

| class | sites | files (sites) |
|---|---|---|
| ProfileRouter | 44 | tests/orchestrator/e2e-helpers.ts(2), tests/orchestrator/orchestrator.test.ts(4), tests/services/comment-flow.test.ts(1), tests/services/profile-routing.test.ts(4), tests/services/trigger-cache.test.ts(4), tests/services/trigger-scanner.test.ts(29) |
| Orchestrator | 24 | tests/orchestrator/orchestrator-e2e.test.ts(23), tests/orchestrator/shutdown.test.ts(1) |
| TaskRunner | 23 | tests/services/task-runner.test.ts(23) |
| StreamCapture | 20 | tests/container/stream-capture.test.ts(20) |
| ClaudeCodeRuntime | 19 | tests/cli/claude/claude-contract.test.ts(1), tests/cli/claude/claude-runtime.test.ts(11), tests/container/cli-executors/claude-code-executor.test.ts(2), tests/container/cli-executors/local-claude-code-executor.test.ts(2), tests/container/log-source-registry.test.ts(1), tests/services/run-artifacts-deriver.test.ts(2) |
| OrchestratorObserver | 19 | tests/orchestrator/orchestrator-observer.test.ts(19) |
| ClaudeStreamJsonDecoder | 18 | tests/cli/claude/stream-json-decoder.test.ts(15), tests/container/cli-executors/shared-exec.test.ts(1), tests/container/stream-capture.test.ts(2) |
| ActivityLog | 14 | tests/orchestrator/e2e-helpers.ts(2), tests/services/activity-log.test.ts(12) |
| AgentCatalog | 13 | tests/cli/agent-catalog.test.ts(6), tests/cli/claude/claude-contract.test.ts(1), tests/cli/claude/claude-runtime.test.ts(1), tests/cli/copilot/copilot-runtime.test.ts(1), tests/container/cli-executor-factory.test.ts(1), tests/container/cli-executors/claude-code-executor.test.ts(1), tests/container/compose-overlay-writer.test.ts(1), tests/container/template-integration.test.ts(1) |
| AppStartup | 12 | tests/app-startup.test.ts(12) |
| CopilotRuntime | 10 | tests/cli/copilot/copilot-runtime.test.ts(2), tests/container/cli-executors/copilot-executor.test.ts(1), tests/container/cli-executors/host-stage.test.ts(4), tests/container/cli-executors/local-copilot-executor.test.ts(2), tests/container/log-source-registry.test.ts(1) |
| ClaudeSessionIds | 9 | tests/cli/claude/claude-contract.test.ts(7), tests/cli/claude/claude-session.test.ts(2) |
| CliRuntimeRegistry | 9 | tests/cli/cli-runtime.test.ts(6), tests/container/continuation-loop.test.ts(1), tests/container/manager.test.ts(1), tests/services/run-artifacts-deriver.test.ts(1) |
| ComposeClient | 9 | tests/container/compose-client.test.ts(9) |
| OperationLedger | 9 | tests/orchestrator/e2e-helpers.ts(2), tests/services/comment-flow.test.ts(3), tests/services/operation-ledger.test.ts(2), tests/services/trigger-cache.test.ts(1), tests/services/trigger-scanner.test.ts(1) |
| ContainerWorkspaceCleaner | 8 | tests/container/workspace-cleaner.test.ts(8) |
| HookRulesRedactor | 8 | tests/logs/text-redactor.test.ts(6), tests/services/run-artifacts-deriver.test.ts(2) |
| JiraIssueParser | 8 | tests/datasource/connectors/jira/issue-parser.test.ts(8) |
| PromptBuilder | 7 | tests/prompt/prompt-builder.test.ts(1), tests/prompt/prompt-pipeline.test.ts(6) |
| PlainTextDecoder | 5 | tests/cli/plain-text-decoder.test.ts(3), tests/container/cli-executors/shared-exec.test.ts(1), tests/helpers/mocks.ts(1) |
| StageWorkspaceResolver | 5 | tests/cli/claude/claude-host-settings.test.ts(1), tests/services/post-task-hook-runner.test.ts(1), tests/services/profile-setup-service.test.ts(1), tests/services/stage-workspace.test.ts(1), tests/services/task-runner.test.ts(1) |
| AgentCatalogProvider | 4 | tests/container/agent-catalogs.test.ts(3), tests/container/agent-includes.test.ts(1) |
| TriggerScanner | 4 | tests/orchestrator/e2e-helpers.ts(2), tests/services/trigger-cache.test.ts(1), tests/services/trigger-scanner.test.ts(1) |
| ComposeFileResolver | 3 | tests/container/compose-files.test.ts(3) |
| JiraClient | 3 | tests/datasource/connectors/jira/jira-client.test.ts(3) |
| SkillTemplateRenderer | 3 | tests/container/skill-includes.test.ts(3) |
| AgentPipelineExecutor | 2 | tests/services/agent-pipeline-executor.test.ts(2) |
| AgentSessionRunner | 2 | tests/container/agent-session-runner.test.ts(1), tests/container/continuation-loop.test.ts(1) |
| ComposeOverlayWriter | 2 | tests/container/compose-overlay-writer.test.ts(2) |
| ContainerManager | 2 | tests/container/continuation-loop.test.ts(1), tests/container/manager.test.ts(1) |
| JiraConnector | 2 | tests/datasource/connector-compliance.test.ts(1), tests/datasource/connectors/jira/jira-connector.test.ts(1) |
| PostTaskHookRunner | 2 | tests/services/post-task-hook-runner.test.ts(1), tests/services/task-runner.test.ts(1) |
| TaskWorkspaceManager | 2 | tests/services/task-workspace-manager.git.test.ts(1), tests/services/task-workspace-manager.test.ts(1) |
| VcsSourceClient | 2 | tests/services/vcs-source-client.test.ts(2) |
| AgentTemplateRenderer | 1 | tests/container/agent-includes.test.ts(1) |
| ClaudeAgentWriter | 1 | tests/cli/claude/claude-agent-writer.test.ts(1) |
| ClaudeCodeExecutor | 1 | tests/container/cli-executors/claude-code-executor.test.ts(1) |
| CliExecutorFactory | 1 | tests/container/cli-executor-factory.test.ts(1) |
| ContainerLogCollector | 1 | tests/container/container-log-collector.test.ts(1) |
| ContinuationRunner | 1 | tests/container/continuation-loop.test.ts(1) |
| CopilotAgentWriter | 1 | tests/cli/copilot/copilot-agent-writer.test.ts(1) |
| CopilotExecutor | 1 | tests/container/cli-executors/copilot-executor.test.ts(1) |
| HeartbeatSender | 1 | tests/services/heartbeat.test.ts(1) |
| IssueManager | 1 | tests/services/issue-manager.test.ts(1) |
| JiraFieldExtractor | 1 | tests/datasource/connectors/jira/field-extractor.test.ts(1) |
| JiraWorkItemPoller | 1 | tests/datasource/connectors/jira/jira-poller.test.ts(1) |
| JitMcpConfigWriter | 1 | tests/container/jit-mcp-params.test.ts(1) |
| LocalClaudeCodeExecutor | 1 | tests/container/cli-executors/local-claude-code-executor.test.ts(1) |
| LocalCopilotExecutor | 1 | tests/container/cli-executors/local-copilot-executor.test.ts(1) |
| LogCollector | 1 | tests/logs/collector.test.ts(1) |
| LogSourceRegistry | 1 | tests/container/log-source-registry.test.ts(1) |
| ProfileSetupService | 1 | tests/services/profile-setup-service.test.ts(1) |
| RunArtifactsDeriver | 1 | tests/services/run-artifacts-deriver.test.ts(1) |
| TaskResourceManager | 1 | tests/services/task-resource-manager.test.ts(1) |
| TaskResultWriter | 1 | tests/services/task-result-writer.test.ts(1) |

Appendix A2a: every test `new X(` site (file:line), 61-class restriction:

- ActivityLog (14): tests/orchestrator/e2e-helpers.ts:72, tests/orchestrator/e2e-helpers.ts:211, tests/services/activity-log.test.ts:34, tests/services/activity-log.test.ts:39, tests/services/activity-log.test.ts:48, tests/services/activity-log.test.ts:59, tests/services/activity-log.test.ts:66, tests/services/activity-log.test.ts:80, tests/services/activity-log.test.ts:95, tests/services/activity-log.test.ts:106, tests/services/activity-log.test.ts:117, tests/services/activity-log.test.ts:124, tests/services/activity-log.test.ts:134, tests/services/activity-log.test.ts:142
- AgentCatalog (13): tests/cli/agent-catalog.test.ts:78, tests/cli/agent-catalog.test.ts:85, tests/cli/agent-catalog.test.ts:107, tests/cli/agent-catalog.test.ts:114, tests/cli/agent-catalog.test.ts:123, tests/cli/agent-catalog.test.ts:137, tests/cli/claude/claude-contract.test.ts:131, tests/cli/claude/claude-runtime.test.ts:16, tests/cli/copilot/copilot-runtime.test.ts:14, tests/container/cli-executor-factory.test.ts:14, tests/container/cli-executors/claude-code-executor.test.ts:239, tests/container/compose-overlay-writer.test.ts:16, tests/container/template-integration.test.ts:308
- AgentCatalogProvider (4): tests/container/agent-catalogs.test.ts:25, tests/container/agent-catalogs.test.ts:34, tests/container/agent-catalogs.test.ts:48, tests/container/agent-includes.test.ts:430
- AgentPipelineExecutor (2): tests/services/agent-pipeline-executor.test.ts:71, tests/services/agent-pipeline-executor.test.ts:153
- AgentSessionRunner (2): tests/container/agent-session-runner.test.ts:44, tests/container/continuation-loop.test.ts:87
- AgentTemplateRenderer (1): tests/container/agent-includes.test.ts:429
- AppStartup (12): tests/app-startup.test.ts:29, tests/app-startup.test.ts:46, tests/app-startup.test.ts:62, tests/app-startup.test.ts:74, tests/app-startup.test.ts:84, tests/app-startup.test.ts:97, tests/app-startup.test.ts:107, tests/app-startup.test.ts:119, tests/app-startup.test.ts:131, tests/app-startup.test.ts:140, tests/app-startup.test.ts:151, tests/app-startup.test.ts:164
- ClaudeAgentWriter (1): tests/cli/claude/claude-agent-writer.test.ts:18
- ClaudeCodeExecutor (1): tests/container/cli-executors/claude-code-executor.test.ts:78
- ClaudeCodeRuntime (19): tests/cli/claude/claude-contract.test.ts:230, tests/cli/claude/claude-runtime.test.ts:25, tests/cli/claude/claude-runtime.test.ts:30, tests/cli/claude/claude-runtime.test.ts:53, tests/cli/claude/claude-runtime.test.ts:129, tests/cli/claude/claude-runtime.test.ts:136, tests/cli/claude/claude-runtime.test.ts:144, tests/cli/claude/claude-runtime.test.ts:173, tests/cli/claude/claude-runtime.test.ts:191, tests/cli/claude/claude-runtime.test.ts:211, tests/cli/claude/claude-runtime.test.ts:220, tests/cli/claude/claude-runtime.test.ts:231, tests/container/cli-executors/claude-code-executor.test.ts:84, tests/container/cli-executors/claude-code-executor.test.ts:236, tests/container/cli-executors/local-claude-code-executor.test.ts:63, tests/container/cli-executors/local-claude-code-executor.test.ts:116, tests/container/log-source-registry.test.ts:33, tests/services/run-artifacts-deriver.test.ts:224, tests/services/run-artifacts-deriver.test.ts:253
- ClaudeSessionIds (9): tests/cli/claude/claude-contract.test.ts:397, tests/cli/claude/claude-contract.test.ts:523, tests/cli/claude/claude-contract.test.ts:557, tests/cli/claude/claude-contract.test.ts:612, tests/cli/claude/claude-contract.test.ts:642, tests/cli/claude/claude-contract.test.ts:654, tests/cli/claude/claude-contract.test.ts:697, tests/cli/claude/claude-session.test.ts:107, tests/cli/claude/claude-session.test.ts:112
- ClaudeStreamJsonDecoder (18): tests/cli/claude/stream-json-decoder.test.ts:18, tests/cli/claude/stream-json-decoder.test.ts:151, tests/cli/claude/stream-json-decoder.test.ts:166, tests/cli/claude/stream-json-decoder.test.ts:192, tests/cli/claude/stream-json-decoder.test.ts:210, tests/cli/claude/stream-json-decoder.test.ts:230, tests/cli/claude/stream-json-decoder.test.ts:243, tests/cli/claude/stream-json-decoder.test.ts:272, tests/cli/claude/stream-json-decoder.test.ts:283, tests/cli/claude/stream-json-decoder.test.ts:294, tests/cli/claude/stream-json-decoder.test.ts:314, tests/cli/claude/stream-json-decoder.test.ts:327, tests/cli/claude/stream-json-decoder.test.ts:332, tests/cli/claude/stream-json-decoder.test.ts:342, tests/cli/claude/stream-json-decoder.test.ts:359, tests/container/cli-executors/shared-exec.test.ts:168, tests/container/stream-capture.test.ts:238, tests/container/stream-capture.test.ts:259
- CliExecutorFactory (1): tests/container/cli-executor-factory.test.ts:22
- CliRuntimeRegistry (9): tests/cli/cli-runtime.test.ts:42, tests/cli/cli-runtime.test.ts:50, tests/cli/cli-runtime.test.ts:62, tests/cli/cli-runtime.test.ts:73, tests/cli/cli-runtime.test.ts:81, tests/cli/cli-runtime.test.ts:94, tests/container/continuation-loop.test.ts:98, tests/container/manager.test.ts:124, tests/services/run-artifacts-deriver.test.ts:51
- ComposeClient (9): tests/container/compose-client.test.ts:33, tests/container/compose-client.test.ts:45, tests/container/compose-client.test.ts:57, tests/container/compose-client.test.ts:68, tests/container/compose-client.test.ts:77, tests/container/compose-client.test.ts:88, tests/container/compose-client.test.ts:98, tests/container/compose-client.test.ts:112, tests/container/compose-client.test.ts:121
- ComposeFileResolver (3): tests/container/compose-files.test.ts:22, tests/container/compose-files.test.ts:38, tests/container/compose-files.test.ts:51
- ComposeOverlayWriter (2): tests/container/compose-overlay-writer.test.ts:322, tests/container/compose-overlay-writer.test.ts:339
- ContainerLogCollector (1): tests/container/container-log-collector.test.ts:68
- ContainerManager (2): tests/container/continuation-loop.test.ts:94, tests/container/manager.test.ts:120
- ContainerWorkspaceCleaner (8): tests/container/workspace-cleaner.test.ts:11, tests/container/workspace-cleaner.test.ts:51, tests/container/workspace-cleaner.test.ts:71, tests/container/workspace-cleaner.test.ts:83, tests/container/workspace-cleaner.test.ts:122, tests/container/workspace-cleaner.test.ts:134, tests/container/workspace-cleaner.test.ts:156, tests/container/workspace-cleaner.test.ts:167
- ContinuationRunner (1): tests/container/continuation-loop.test.ts:86
- CopilotAgentWriter (1): tests/cli/copilot/copilot-agent-writer.test.ts:13
- CopilotExecutor (1): tests/container/cli-executors/copilot-executor.test.ts:14
- CopilotRuntime (10): tests/cli/copilot/copilot-runtime.test.ts:21, tests/cli/copilot/copilot-runtime.test.ts:26, tests/container/cli-executors/copilot-executor.test.ts:17, tests/container/cli-executors/host-stage.test.ts:46, tests/container/cli-executors/host-stage.test.ts:58, tests/container/cli-executors/host-stage.test.ts:74, tests/container/cli-executors/host-stage.test.ts:88, tests/container/cli-executors/local-copilot-executor.test.ts:40, tests/container/cli-executors/local-copilot-executor.test.ts:67, tests/container/log-source-registry.test.ts:32
- HeartbeatSender (1): tests/services/heartbeat.test.ts:22
- HookRulesRedactor (8): tests/logs/text-redactor.test.ts:27, tests/logs/text-redactor.test.ts:76, tests/logs/text-redactor.test.ts:116, tests/logs/text-redactor.test.ts:126, tests/logs/text-redactor.test.ts:138, tests/logs/text-redactor.test.ts:150, tests/services/run-artifacts-deriver.test.ts:225, tests/services/run-artifacts-deriver.test.ts:254
- IssueManager (1): tests/services/issue-manager.test.ts:19
- JiraClient (3): tests/datasource/connectors/jira/jira-client.test.ts:59, tests/datasource/connectors/jira/jira-client.test.ts:124, tests/datasource/connectors/jira/jira-client.test.ts:145
- JiraConnector (2): tests/datasource/connector-compliance.test.ts:169, tests/datasource/connectors/jira/jira-connector.test.ts:15
- JiraFieldExtractor (1): tests/datasource/connectors/jira/field-extractor.test.ts:5
- JiraIssueParser (8): tests/datasource/connectors/jira/issue-parser.test.ts:14, tests/datasource/connectors/jira/issue-parser.test.ts:24, tests/datasource/connectors/jira/issue-parser.test.ts:32, tests/datasource/connectors/jira/issue-parser.test.ts:50, tests/datasource/connectors/jira/issue-parser.test.ts:59, tests/datasource/connectors/jira/issue-parser.test.ts:67, tests/datasource/connectors/jira/issue-parser.test.ts:75, tests/datasource/connectors/jira/issue-parser.test.ts:83
- JiraWorkItemPoller (1): tests/datasource/connectors/jira/jira-poller.test.ts:26
- JitMcpConfigWriter (1): tests/container/jit-mcp-params.test.ts:30
- LocalClaudeCodeExecutor (1): tests/container/cli-executors/local-claude-code-executor.test.ts:109
- LocalCopilotExecutor (1): tests/container/cli-executors/local-copilot-executor.test.ts:64
- LogCollector (1): tests/logs/collector.test.ts:15
- LogSourceRegistry (1): tests/container/log-source-registry.test.ts:77
- OperationLedger (9): tests/orchestrator/e2e-helpers.ts:74, tests/orchestrator/e2e-helpers.ts:194, tests/services/comment-flow.test.ts:21, tests/services/comment-flow.test.ts:172, tests/services/comment-flow.test.ts:188, tests/services/operation-ledger.test.ts:21, tests/services/operation-ledger.test.ts:299, tests/services/trigger-cache.test.ts:42, tests/services/trigger-scanner.test.ts:50
- Orchestrator (24): tests/orchestrator/orchestrator-e2e.test.ts:48, tests/orchestrator/orchestrator-e2e.test.ts:88, tests/orchestrator/orchestrator-e2e.test.ts:128, tests/orchestrator/orchestrator-e2e.test.ts:158, tests/orchestrator/orchestrator-e2e.test.ts:188, tests/orchestrator/orchestrator-e2e.test.ts:214, tests/orchestrator/orchestrator-e2e.test.ts:266, tests/orchestrator/orchestrator-e2e.test.ts:304, tests/orchestrator/orchestrator-e2e.test.ts:325, tests/orchestrator/orchestrator-e2e.test.ts:346, tests/orchestrator/orchestrator-e2e.test.ts:383, tests/orchestrator/orchestrator-e2e.test.ts:404, tests/orchestrator/orchestrator-e2e.test.ts:425, tests/orchestrator/orchestrator-e2e.test.ts:450, tests/orchestrator/orchestrator-e2e.test.ts:508, tests/orchestrator/orchestrator-e2e.test.ts:533, tests/orchestrator/orchestrator-e2e.test.ts:563, tests/orchestrator/orchestrator-e2e.test.ts:607, tests/orchestrator/orchestrator-e2e.test.ts:657, tests/orchestrator/orchestrator-e2e.test.ts:699, tests/orchestrator/orchestrator-e2e.test.ts:741, tests/orchestrator/orchestrator-e2e.test.ts:781, tests/orchestrator/orchestrator-e2e.test.ts:825, tests/orchestrator/shutdown.test.ts:115
- OrchestratorObserver (19): tests/orchestrator/orchestrator-observer.test.ts:31, tests/orchestrator/orchestrator-observer.test.ts:41, tests/orchestrator/orchestrator-observer.test.ts:50, tests/orchestrator/orchestrator-observer.test.ts:55, tests/orchestrator/orchestrator-observer.test.ts:77, tests/orchestrator/orchestrator-observer.test.ts:85, tests/orchestrator/orchestrator-observer.test.ts:90, tests/orchestrator/orchestrator-observer.test.ts:99, tests/orchestrator/orchestrator-observer.test.ts:111, tests/orchestrator/orchestrator-observer.test.ts:120, tests/orchestrator/orchestrator-observer.test.ts:125, tests/orchestrator/orchestrator-observer.test.ts:139, tests/orchestrator/orchestrator-observer.test.ts:151, tests/orchestrator/orchestrator-observer.test.ts:160, tests/orchestrator/orchestrator-observer.test.ts:165, tests/orchestrator/orchestrator-observer.test.ts:175, tests/orchestrator/orchestrator-observer.test.ts:188, tests/orchestrator/orchestrator-observer.test.ts:194, tests/orchestrator/orchestrator-observer.test.ts:195
- PlainTextDecoder (5): tests/cli/plain-text-decoder.test.ts:7, tests/cli/plain-text-decoder.test.ts:15, tests/cli/plain-text-decoder.test.ts:24, tests/container/cli-executors/shared-exec.test.ts:31, tests/helpers/mocks.ts:248
- PostTaskHookRunner (2): tests/services/post-task-hook-runner.test.ts:58, tests/services/task-runner.test.ts:803
- ProfileRouter (44): tests/orchestrator/e2e-helpers.ts:73, tests/orchestrator/e2e-helpers.ts:195, tests/orchestrator/orchestrator.test.ts:24, tests/orchestrator/orchestrator.test.ts:37, tests/orchestrator/orchestrator.test.ts:48, tests/orchestrator/orchestrator.test.ts:59, tests/services/comment-flow.test.ts:107, tests/services/profile-routing.test.ts:11, tests/services/profile-routing.test.ts:140, tests/services/profile-routing.test.ts:204, tests/services/profile-routing.test.ts:224, tests/services/trigger-cache.test.ts:56, tests/services/trigger-cache.test.ts:79, tests/services/trigger-cache.test.ts:100, tests/services/trigger-cache.test.ts:115, tests/services/trigger-scanner.test.ts:64, tests/services/trigger-scanner.test.ts:84, tests/services/trigger-scanner.test.ts:100, tests/services/trigger-scanner.test.ts:118, tests/services/trigger-scanner.test.ts:132, tests/services/trigger-scanner.test.ts:146, tests/services/trigger-scanner.test.ts:160, tests/services/trigger-scanner.test.ts:180, tests/services/trigger-scanner.test.ts:197, tests/services/trigger-scanner.test.ts:212, tests/services/trigger-scanner.test.ts:227, tests/services/trigger-scanner.test.ts:240, tests/services/trigger-scanner.test.ts:254, tests/services/trigger-scanner.test.ts:271, tests/services/trigger-scanner.test.ts:283, tests/services/trigger-scanner.test.ts:296, tests/services/trigger-scanner.test.ts:313, tests/services/trigger-scanner.test.ts:333, tests/services/trigger-scanner.test.ts:354, tests/services/trigger-scanner.test.ts:373, tests/services/trigger-scanner.test.ts:393, tests/services/trigger-scanner.test.ts:413, tests/services/trigger-scanner.test.ts:427, tests/services/trigger-scanner.test.ts:440, tests/services/trigger-scanner.test.ts:460, tests/services/trigger-scanner.test.ts:477, tests/services/trigger-scanner.test.ts:496, tests/services/trigger-scanner.test.ts:509, tests/services/trigger-scanner.test.ts:522
- ProfileSetupService (1): tests/services/profile-setup-service.test.ts:43
- PromptBuilder (7): tests/prompt/prompt-builder.test.ts:16, tests/prompt/prompt-pipeline.test.ts:40, tests/prompt/prompt-pipeline.test.ts:62, tests/prompt/prompt-pipeline.test.ts:91, tests/prompt/prompt-pipeline.test.ts:105, tests/prompt/prompt-pipeline.test.ts:122, tests/prompt/prompt-pipeline.test.ts:132
- RunArtifactsDeriver (1): tests/services/run-artifacts-deriver.test.ts:51
- SkillTemplateRenderer (3): tests/container/skill-includes.test.ts:250, tests/container/skill-includes.test.ts:265, tests/container/skill-includes.test.ts:277
- StageWorkspaceResolver (5): tests/cli/claude/claude-host-settings.test.ts:68, tests/services/post-task-hook-runner.test.ts:54, tests/services/profile-setup-service.test.ts:50, tests/services/stage-workspace.test.ts:10, tests/services/task-runner.test.ts:807
- StreamCapture (20): tests/container/stream-capture.test.ts:18, tests/container/stream-capture.test.ts:29, tests/container/stream-capture.test.ts:41, tests/container/stream-capture.test.ts:52, tests/container/stream-capture.test.ts:62, tests/container/stream-capture.test.ts:74, tests/container/stream-capture.test.ts:87, tests/container/stream-capture.test.ts:99, tests/container/stream-capture.test.ts:111, tests/container/stream-capture.test.ts:118, tests/container/stream-capture.test.ts:134, tests/container/stream-capture.test.ts:149, tests/container/stream-capture.test.ts:164, tests/container/stream-capture.test.ts:181, tests/container/stream-capture.test.ts:198, tests/container/stream-capture.test.ts:215, tests/container/stream-capture.test.ts:238, tests/container/stream-capture.test.ts:259, tests/container/stream-capture.test.ts:287, tests/container/stream-capture.test.ts:301
- TaskResourceManager (1): tests/services/task-resource-manager.test.ts:23
- TaskResultWriter (1): tests/services/task-result-writer.test.ts:44
- TaskRunner (23): tests/services/task-runner.test.ts:101, tests/services/task-runner.test.ts:133, tests/services/task-runner.test.ts:207, tests/services/task-runner.test.ts:240, tests/services/task-runner.test.ts:261, tests/services/task-runner.test.ts:286, tests/services/task-runner.test.ts:368, tests/services/task-runner.test.ts:389, tests/services/task-runner.test.ts:410, tests/services/task-runner.test.ts:441, tests/services/task-runner.test.ts:464, tests/services/task-runner.test.ts:485, tests/services/task-runner.test.ts:510, tests/services/task-runner.test.ts:535, tests/services/task-runner.test.ts:561, tests/services/task-runner.test.ts:586, tests/services/task-runner.test.ts:610, tests/services/task-runner.test.ts:632, tests/services/task-runner.test.ts:654, tests/services/task-runner.test.ts:676, tests/services/task-runner.test.ts:698, tests/services/task-runner.test.ts:731, tests/services/task-runner.test.ts:812
- TaskWorkspaceManager (2): tests/services/task-workspace-manager.git.test.ts:56, tests/services/task-workspace-manager.test.ts:75
- TriggerScanner (4): tests/orchestrator/e2e-helpers.ts:108, tests/orchestrator/e2e-helpers.ts:199, tests/services/trigger-cache.test.ts:22, tests/services/trigger-scanner.test.ts:29
- VcsSourceClient (2): tests/services/vcs-source-client.test.ts:8, tests/services/vcs-source-client.test.ts:107

### A3. §5 re-derived: class names in docs

Command: `git grep -nwE '<61 names joined by |>' -- '*.md' '*.drawio' ':!containment'` returns 354 lines. Counting each class-name occurrence: **456 hits in 71 files across 49 classes** (inventory: 309 / 41 / 44). `git grep` skips the untracked journal files and the gitignored worktrees.

- **The jump is scope and one word, not drift.** `Orchestrator` alone has 109 hits in 49 files, because the bare word matches the product name ("Ralph Orchestrator", "the orchestrator"); §5a's 6 `Orchestrator` hits are the code-formatted ones (`` `Orchestrator` ``, `new Orchestrator`, `Orchestrator(`: AGENTS.md 2, ARCHITECTURE.md 2, docs/dev-doc/dependency-injection.md 1, docs/conventions/test-layout.md 1; same six at the base). Without the prose: 347 hits, and 353 with the six.
- **Files new to the count** (the 81a8980 query covered fewer trees, or the files changed): `.claude/skills/{agent-eval,cli-debug-log-analysis}`, `.claude/skills/ralph-agent-authoring/references/{planner-loop,subagent-wiring}.md`, `dashboard-local/AGENTS.md`, `docs/dev-doc/{egress-security,local-testing,security-audit-exfiltration}.md`, `docs/user-guide/{README,deploying-mcp-servers,skills}.md`, `docs/research/{oh-my-opencode-analysis,skill-context-state-management-plan}.md`, `profiles/*/agents/*.agent.md` (4), `ralph-dashboard/README.md`, `ralphchives/{CONFIGURATION,README}.md`, `shared/agent-includes/**` (4), `shared/hooks/README.md`, `shared/skills/analysis/**` (5), `todos/{discord-connector,over-ralph,stacky-agent-as-function-audit}.md`. Their hits are mostly `Orchestrator` prose (not checked file by file); the per-class rows below carry the rest.
- **Files in §5a and not here:** `dashboard-local/src/*.ts` and `shared/security/docker-compose.security.yml` (the glob is `*.md` and `*.drawio`).
- **Per-class hit changes against §5a** (old -> new, rows whose count moved other than `Orchestrator`): AgentCatalog 2 -> 4, AgentCatalogProvider 1 -> 2, AgentPipelineExecutor 5 -> 7, AgentSessionRunner 4 -> 6, AppStartup 6 -> 8, ClaudeAgentWriter 0 -> 1, ClaudeCodeExecutor 12 -> 13, ClaudeCodeRuntime 0 -> 2, CliExecutorFactory 6 -> 9, CliRuntimeRegistry 1 -> 3, ContainerLogCollector 3 -> 4, ContainerManager 16 -> 15, ContainerWorkspaceCleaner 3 -> 4, ContinuationRunner 7 -> 8, CopilotAgentWriter 0 -> 1, CopilotRuntime 0 -> 2, HookRulesRedactor 0 -> 3, JitMcpConfigWriter 8 -> 9, LocalClaudeCodeExecutor 7 -> 8, LocalCopilotExecutor 7 -> 8, LogCollector 4 -> 3, LogSourceRegistry 2 -> 4, OperationLedger 10 -> 7, PostTaskHookRunner 5 -> 12, RunArtifactsDeriver 2 -> 11, SkillTemplateRenderer 3 -> 5, StageWorkspaceResolver 6 -> 10, StreamCapture 10 -> 7, TaskResultWriter 14 -> 15, TaskRunner 41 -> 37, TaskWorkspaceManager 18 -> 19, TriggerScanner 0 -> 6, VcsSourceClient 0 -> 3. §5a's old column was read back from the table (it sums to 300, the table states 309), so treat per-class deltas of 1 to 2 as approximate; the new column is exact.
- **No doc hit:** AdoVcsSourceProviderClient, AgentDefinitionError, ClaudeSessionIds, ClaudeStreamJsonDecoder, FrontmatterError, GitHubVcsSourceProviderClient, HeartbeatSender, JiraFieldExtractor, JiraIssueParser, PlainTextDecoder, ProfileRouter, SectionTag (12 classes).

| class | hits | files | where (file(hits)) |
|---|---|---|---|
| ActivityLog | 5 | 2 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/log-map.md(4) |
| AgentCatalog | 4 | 2 | AGENTS.md(1) docs/dev-doc/agent-templates.md(3) |
| AgentCatalogProvider | 2 | 2 | docs/dev-doc/agent-templates.md(1) docs/dev-doc/dependency-injection.md(1) |
| AgentPipelineExecutor | 7 | 5 | .claude/skills/task-failure-diagnosis/references/code-paths.md(2) AGENTS.md(1) ARCHITECTURE.md(2) docs/dev-doc/dataflow.drawio(1) docs/dev-doc/multistage-pipelines.md(1) |
| AgentSessionRunner | 6 | 4 | .claude/skills/task-failure-diagnosis/references/code-paths.md(2) AGENTS.md(1) ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(2) |
| AgentTemplateRenderer | 8 | 7 | .claude/skills/ralph-agent-authoring/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(2) CONFIGURATION.md(1) docs/dev-doc/agent-templates.md(1) docs/user-guide/template-variables.md(1) |
| AppStartup | 8 | 6 | AGENTS.md(2) ARCHITECTURE.md(1) docs/dev-doc/data-source-registration.md(1) docs/dev-doc/dependency-injection.md(2) docs/dev-doc/ralphchives.md(1) docs/user-guide/trigger-parameters.md(1) |
| ClaudeAgentWriter | 1 | 1 | docs/dev-doc/agent-templates.md(1) |
| ClaudeCodeExecutor | 13 | 6 | .ai/agent-working-rules.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(2) ARCHITECTURE.md(2) docs/dev-doc/dependency-injection.md(1) plans/claude-cli-parity-audit.md(6) todos/cli-optimization.md(1) |
| ClaudeCodeRuntime | 2 | 2 | ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1) |
| CliExecutorFactory | 9 | 7 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(1) README.md(2) docs/dev-doc/dependency-injection.md(1) todos/cli-optimization.md(2) |
| CliRuntimeRegistry | 3 | 3 | AGENTS.md(1) ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1) |
| ComposeClient | 13 | 7 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(2) SECURITY.md(2) docs/dev-doc/compose-layering.md(4) docs/dev-doc/dependency-injection.md(1) todos/parallelism.md(2) |
| ComposeFileResolver | 4 | 3 | AGENTS.md(1) ARCHITECTURE.md(2) docs/dev-doc/compose-layering.md(1) |
| ComposeOverlayWriter | 4 | 4 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(1) MCP.md(1) |
| ContainerLogCollector | 4 | 4 | .claude/skills/task-failure-diagnosis/references/log-map.md(1) ARCHITECTURE.md(1) SECURITY.md(1) docs/dev-doc/dependency-injection.md(1) |
| ContainerManager | 15 | 8 | .claude/skills/task-failure-diagnosis/references/code-paths.md(5) .claude/skills/task-failure-diagnosis/references/log-map.md(1) AGENTS.md(2) ARCHITECTURE.md(2) README.md(2) docs/dev-doc/dependency-injection.md(1) plans/claude-cli-parity-audit.md(1) todos/parallelism.md(1) |
| ContainerWorkspaceCleaner | 4 | 4 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) docs/dev-doc/dependency-injection.md(1) todos/container-security.md(1) |
| ContinuationRunner | 8 | 6 | .claude/skills/task-failure-diagnosis/references/code-paths.md(2) .claude/skills/task-failure-diagnosis/references/failure-signatures.md(1) .claude/skills/test-patterns/SKILL.md(2) AGENTS.md(1) ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1) |
| CopilotAgentWriter | 1 | 1 | docs/dev-doc/agent-templates.md(1) |
| CopilotExecutor | 8 | 5 | .claude/skills/task-failure-diagnosis/references/code-paths.md(2) ARCHITECTURE.md(2) docs/dev-doc/dependency-injection.md(1) plans/claude-cli-parity-audit.md(2) todos/cli-optimization.md(1) |
| CopilotRuntime | 2 | 2 | ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1) |
| DashboardServer | 6 | 4 | AGENTS.md(2) ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1) todos/dashboard.md(2) |
| HookRulesRedactor | 3 | 3 | ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1) shared/hooks/README.md(1) |
| IssueManager | 4 | 3 | .claude/rules/testing.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) .claude/skills/test-patterns/SKILL.md(2) |
| JiraClient | 9 | 7 | .claude/skills/test-patterns/SKILL.md(1) AGENTS.md(1) docs/conventions/stack-profile.md(1) docs/dev-doc/data-source-registration.md(1) docs/dev-doc/dependency-injection.md(2) todos/jira-image-attachments.md(1) todos/jira-linked-issues.md(2) |
| JiraConnector | 3 | 2 | docs/dev-doc/data-source-registration.md(2) docs/dev-doc/dependency-injection.md(1) |
| JiraWorkItemPoller | 6 | 4 | ARCHITECTURE.md(2) docs/dev-doc/data-source-registration.md(1) docs/dev-doc/dataflow.drawio(2) docs/dev-doc/dependency-injection.md(1) |
| JitMcpConfigWriter | 9 | 7 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(1) CONFIGURATION.md(1) MCP.md(3) docs/dev-doc/dataflow.drawio(1) docs/dev-doc/egress-security.md(1) |
| LocalClaudeCodeExecutor | 8 | 5 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) ARCHITECTURE.md(2) SECURITY.md(1) docs/dev-doc/dependency-injection.md(1) docs/dev-doc/multistage-pipelines.md(1) |
| LocalCopilotExecutor | 8 | 5 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) ARCHITECTURE.md(2) SECURITY.md(1) docs/dev-doc/dependency-injection.md(1) docs/dev-doc/multistage-pipelines.md(1) |
| LogCollector | 3 | 3 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/log-map.md(1) docs/research/approach-1-trajectory-process.md(1) |
| LogSourceRegistry | 4 | 4 | .claude/skills/task-failure-diagnosis/references/log-map.md(1) ARCHITECTURE.md(1) docs/dev-doc/dependency-injection.md(1) docs/dev-doc/security-audit-exfiltration.md(1) |
| OperationLedger | 7 | 4 | .claude/skills/task-failure-diagnosis/references/log-map.md(1) docs/dev-doc/dataflow.drawio(2) docs/dev-doc/dependency-injection.md(1) shared/skills/domain/test-structure-patterns/references/examples.md(3) |
| Orchestrator | 109 | 49 | .claude/skills/agent-eval/SKILL.md(6) .claude/skills/agent-eval/references/eval-plan-template.md(2) .claude/skills/agent-eval/references/eval-scored-template.md(1) .claude/skills/cli-debug-log-analysis/SKILL.md(1) .claude/skills/ralph-agent-authoring/references/planner-loop.md(1) .claude/skills/ralph-agent-authoring/references/subagent-wiring.md(3) .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(3) .claude/skills/task-failure-diagnosis/references/log-map.md(1) .claude/skills/test-patterns/SKILL.md(1) AGENTS.md(4) ARCHITECTURE.md(9) CONFIGURATION.md(2) MCP.md(1) README.md(7) dashboard-local/AGENTS.md(1) docs/conventions/stack-profile.md(2) docs/conventions/test-layout.md(1) docs/dev-doc/agent-as-function.md(5) docs/dev-doc/agent-templates.md(1) docs/dev-doc/dataflow.drawio(8) docs/dev-doc/dependency-injection.md(3) docs/dev-doc/local-testing.md(1) docs/dev-doc/security-audit-exfiltration.md(3) docs/research/oh-my-opencode-analysis.md(2) docs/research/skill-context-state-management-plan.md(1) docs/user-guide/README.md(2) docs/user-guide/deploying-mcp-servers.md(1) docs/user-guide/trigger-parameters.md(1) plans/claude-cli-parity-audit.md(1) profiles/ralph-docs/agents/ralph.malph.agent.md(1) profiles/ralph-docs/agents/ralph.ralph.agent.md(1) profiles/ralph-docs/agents/ralph.stacky.agent.md(1) profiles/ralph-vscode/agents/ralph.ralph.agent.md(1) ralph-dashboard/README.md(3) ralphchives/CONFIGURATION.md(1) ralphchives/README.md(1) shared/agent-includes/agent-as-function-contract.md(1) shared/agent-includes/post-hooks/run-analyzer.md(1) shared/agent-includes/post-hooks/run-synthesizer.md(5) shared/agent-includes/post-hooks/subagent-mapper.md(1) shared/skills/analysis/agent-eval/SKILL.md(6) shared/skills/analysis/agent-eval/references/eval-plan-template.md(2) shared/skills/analysis/agent-eval/references/eval-scored-template.md(1) shared/skills/analysis/run-telemetry-analysis/references/copilot-debug-log.md(1) todos/discord-connector.md(3) todos/jira-linked-issues.md(1) todos/over-ralph.md(1) todos/stacky-agent-as-function-audit.md(1) |
| OrchestratorObserver | 2 | 2 | ARCHITECTURE.md(1) todos/parallelism.md(1) |
| PostTaskHookRunner | 12 | 7 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(3) ARCHITECTURE.md(3) README.md(1) docs/dev-doc/dependency-injection.md(1) docs/dev-doc/local-testing.md(1) docs/dev-doc/multistage-pipelines.md(2) |
| ProfileSetupService | 9 | 7 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) AGENTS.md(1) ARCHITECTURE.md(1) README.md(1) docs/dev-doc/agent-templates.md(1) docs/dev-doc/multistage-pipelines.md(1) docs/gotchas.md(1) |
| PromptBuilder | 9 | 6 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(2) ARCHITECTURE.md(1) docs/conventions/stack-profile.md(2) docs/conventions/test-layout.md(1) docs/dev-doc/dependency-injection.md(2) |
| RunArtifactsDeriver | 11 | 6 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(4) README.md(3) SECURITY.md(1) shared/hooks/README.md(1) |
| SkillTemplateRenderer | 5 | 5 | .claude/skills/ralph-agent-authoring/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) docs/user-guide/skills.md(1) docs/user-guide/template-variables.md(1) |
| StageWorkspaceResolver | 10 | 6 | .claude/skills/ralph-agent-authoring/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(2) ARCHITECTURE.md(3) docs/dev-doc/agent-as-function.md(1) docs/dev-doc/multistage-pipelines.md(2) |
| StreamCapture | 7 | 5 | .claude/skills/task-failure-diagnosis/SKILL.md(1) .claude/skills/task-failure-diagnosis/references/code-paths.md(2) .claude/skills/task-failure-diagnosis/references/log-map.md(1) ARCHITECTURE.md(1) todos/cli-optimization.md(2) |
| TaskResourceManager | 1 | 1 | .claude/skills/test-patterns/SKILL.md(1) |
| TaskResultWriter | 15 | 5 | .claude/skills/task-failure-diagnosis/references/code-paths.md(1) AGENTS.md(1) ARCHITECTURE.md(4) README.md(4) docs/dev-doc/dataflow.drawio(5) |
| TaskRunner | 37 | 12 | .claude/skills/task-failure-diagnosis/references/code-paths.md(2) .claude/skills/task-failure-diagnosis/references/log-map.md(1) AGENTS.md(1) ARCHITECTURE.md(10) README.md(7) docs/dev-doc/agent-templates.md(1) docs/dev-doc/dataflow.drawio(5) docs/dev-doc/dependency-injection.md(4) docs/dev-doc/multistage-pipelines.md(1) docs/research/approach-1-trajectory-process.md(1) docs/user-guide/trigger-parameters.md(1) shared/skills/domain/test-mocking-strategy/references/examples.md(3) |
| TaskWorkspaceManager | 19 | 8 | .claude/skills/task-failure-diagnosis/references/code-paths.md(3) .claude/skills/task-failure-diagnosis/references/failure-signatures.md(1) AGENTS.md(2) ARCHITECTURE.md(6) README.md(3) docs/dev-doc/compose-layering.md(1) docs/dev-doc/egress-security.md(1) docs/user-guide/trigger-parameters.md(2) |
| TriggerScanner | 6 | 4 | AGENTS.md(2) ARCHITECTURE.md(1) docs/dev-doc/dataflow.drawio(2) docs/gotchas.md(1) |
| VcsSourceClient | 3 | 3 | AGENTS.md(1) ARCHITECTURE.md(1) docs/conventions/stack-profile.md(1) |
