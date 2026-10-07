# Execution code paths

Use this to locate where a failure happened when the logs alone don't explain it. Verify line-level details in the source before acting; names below were checked against `src/`.

## Primary chain

```
Orchestrator.executeOperation()            # src/orchestrator.ts — resolve profile, refresh issue, preflight
  → Orchestrator.runTask()                 # builds taskId = <issueKey>-<startTs>, starts per-task log, ledger → active
    → TaskRunner.run(ctx)                  # src/services/task-runner.ts
      1. prepareProfile   → ProfileSetupService.prepareForTask()     # src/services/profile-setup-service.ts
      2. transitionIssue  → IssueManager.transitionWorkItem() + postStartComment()
      3. prepareContainer → TaskWorkspaceManager.prepare()           # src/services/task-workspace-manager.ts
                            ContainerManager.start() / checkPrerequisites()
                            ContainerWorkspaceCleaner.prepareConfigDir() / cleanPaths()
                            ContainerManager.registerLogSources() / setup()
      4. executeAgent     → AgentPipelineExecutor.run()              # src/services/agent-pipeline-executor.ts
           per stage: StageWorkspaceResolver.forStage()              # src/services/stage-workspace.ts
                      ProfileSetupService.prepareForStage()          # multi-stage pipelines and local stages
                      ContainerManager.createExecutorForStage()      # container → ClaudeCodeExecutor / CopilotExecutor, local → LocalClaudeCodeExecutor / LocalCopilotExecutor
                      ContainerManager.executeWithExecutor()         # src/container/manager.ts
                        → AgentSessionRunner.run()                   # src/container/agent-session-runner.ts
                          → PromptBuilder.build()                    # src/prompt/prompt-builder.ts
                          → ContinuationRunner.run()                 # src/container/continuation-runner.ts
                            → <executor>.run() / continueSession()   # src/container/cli-executors/ — the stage's CLI executor
                              → executeCliCommand()                  # src/container/cli-executors/shared-exec.ts
                                → ComposeClient.execWithTimeout()    # container stages: docker compose exec (src/container/compose-client.ts)
                                  or execa(node_modules/.bin/<cli>)  # host stages
                                → new StreamCapture(proc, ...)       # src/container/stream-capture.ts
                          → readReportedResult() + resolveStatus()   # src/container/result-parser.ts
      5. TaskResultWriter.collectResults()                           # src/services/task-result-writer.ts — logs, then RunArtifactsDeriver
                                                                     # (redacted transcripts, run telemetry), transcript attachment, summary
      6. teardown, then PostTaskHookRunner.run()                      # src/services/post-task-hook-runner.ts — host hook stages (e.g. ralph.scientist); skip_hooks writes hook-manifest.json instead
      7. TaskWorkspaceManager.cleanup()                               # deletes the workspace on success, keeps it otherwise
```

`CliExecutorFactory` (`src/container/cli-executor-factory.ts`) dispatches on each stage's `cli`: `ClaudeCodeExecutor` or `CopilotExecutor` in the container, `LocalClaudeCodeExecutor` or `LocalCopilotExecutor` on the host. Credentials are checked by startup validation, not by the factory.

## Where things are logged or decided

| Component                     | What to look for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentPipelineExecutor.run()` | `[i/n] <role>: finished — status=…, exit=…, failure=…`; on `status === error` logs `stage failed — aborting pipeline`, a 2000-char stderr snippet, or `CLI produced no output — check container health or CLI installation`. Only `error` aborts; `partial` continues. Warns `the audit log has no session_start for claude session …` for a container session Ralph's hooks did not run in (`hooklessSessions`).                                                                                             |
| `executeCliCommand()`         | Catches `ExecaError`: logs `CLI exited with code N — stderr: …` or `— no stderr captured (message: …)` and returns `{exitCode, stdout, stderr, timedOut}`. It never throws a wrapped error. Non-execa errors are rethrown. For Copilot, once the decoded agent text holds a result block with an accepted `STATUS`, the CLI gets 10 s to exit before SIGTERM; Claude Code's own result event ends its output.                                                                                                 |
| `StreamCapture`               | Line-buffers stdout through the CLI's output decoder (info; Claude Code's stream-json becomes `assistant: …`, `[<subagent>] tool …`, `result: …`) and stderr (warn) into the container logger with a `[tag]` prefix (`build`, `setup`, `claude`, `copilot`, `local-claude`, `local-copilot`). Flushes partial last lines on `close`. For a decoder with `answerEndsAtResultBlock` (Copilot), resolves `resultBlockDetected` once the agent text holds a result block with an accepted `STATUS`.               |
| `ContinuationRunner.run()`    | Continues only when `maxContinuations > 0`, continuation is enabled and the stage requires a result (`AgentSessionRunner`). Claude Code resumes the same session (`--resume <id>`, with `--json-schema` again), Copilot runs `--continue`. Skips if `timedOut`. Logs `No result found — continuation k/N (backoff: …)`, `Result found after k continuation(s)`, `All N continuation(s) exhausted without a result`. Backoff is 5 s doubling to a 30 s cap.                                                    |
| `resolveStatus()`             | The agent's `STATUS` (completed/partial/blocked) wins: `readReportedResult()` takes it from Claude Code's structured output, validated with `agentResultSchema`, else from the result block. Otherwise timeout → `partial`, a CLI-reported error → `error` with the reason its subtype maps to (`error_max_structured_output_retries` → `missing-result-block`), a non-zero exit → `error` (`exit-code`), a missing result in a stage that requires one → `error` (`missing-result-block`), else `completed`. |
| `TaskRunner.run()` catch      | Any thrown error (workspace creation, template render, compose up, setup script, a host stage whose agent was not rendered) becomes `status: error, exitCode: 1, stderr: <message>`, followed by `collectLogs` only: no transcript redaction or attachment, no run telemetry, no `summary.json`. Collected logs without a summary mean the failure came before or outside the CLI; the activity log and the ledger's `reason` hold the message.                                                               |
| `Orchestrator.runTask()`      | Ledger → `completed` for completed/partial, otherwise `error` with `reason` from `describeFailure()` (`src/container/failure-message.ts`: the failure reason in words, else stderr). Posts that reason as an error comment; a success moves the issue to `afterAgent.targetStatus`.                                                                                                                                                                                                                           |

## Pre-execution setup

Startup (`src/app-startup.ts`) runs once: it builds custom MCP servers and the gateway (`buildCustomMcpServers()` in `src/container/setup/mcp-builder.ts`), then `resolveAllProfileSetup()` (`src/container/setup/profile-setup.ts`) writes `profiles/<id>/.build/`: `mcp-config.json`, `gateway.json`, `docker-compose.overlay.yml`, `pre-init.sh`, `squid.conf`, and each container-stage CLI's files (`copilot-settings.json`, `claude/`).

Per task, `ProfileSetupService.prepareForTask()` runs `AgentTemplateRenderer.render()` (Liquid → `profiles/<id>/.build/<cli>/agents/`), `renderStageSkills()`, `ComposeOverlayWriter.write()` and `writeJitMcpConfig()` (macro resolution into `gateway.json`). A Liquid error or an unknown MCP macro throws here, before any container starts.

`TaskWorkspaceManager.prepare()` runs host-side git before any container starts: it clones or fetches the profile's bare clone in `cache/repos/<profileId>` from `repoUrl`, clones `cache/workspaces/<taskId>` from it and checks out the task branch. `ContainerManager.start()` then runs `docker compose up -d --build` with that workspace mounted at `/workspace` (output tagged `[build]`), and `setup()` runs the profile's setup script as `vscode` (tagged `[setup]`). A failed task keeps its workspace; the activity log names its path.

## Local stages

`mode: "local"` stages (variant stages, and post-task hook stages such as `ralph.scientist`) run `node_modules/.bin/<cli>` on the host through `LocalClaudeCodeExecutor` or `LocalCopilotExecutor`, each in its own workspace. They have no container logs; everything they leave is in the task's output directory. A variant's host stage fails the task like a container stage; post-task hook failures are only warnings that never change the task result. Copilot host stages run without Ralph's audit hooks.

| Path (under `<outputDir>/`)                | Holds                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/<hook>/artifacts/`                  | The hook's subagent artifacts (`{{ artifactDir }}`), improver proposals under `agent-improver/<subagent>/proposals/`                     |
| `hooks/<hook>/<role>/work/`                | The CLI's cwd; Copilot's rendered agents and skills in `.github/`                                                                        |
| `hooks/<hook>/<role>/home/`                | Private CLI home: Claude Code's rendered agents and skills and its session transcripts (`projects/`); Copilot's config and session state |
| `hooks/<hook>/<role>/logs/`                | Claude Code's debug log (`claude.log`) and audit hook output (`audit.jsonl`, `ralph.log`, …); Copilot's `cli-debug/`                     |
| `hooks/<hook>/<role>/claude-settings.json` | Claude Code's hooks and permission rules for the stage                                                                                   |
| `stages/<role>/`                           | The same layout for a variant's local stage; its artifacts are the container stages' own                                                 |

A host stage that ends at once usually never started its CLI: look for `Rendered … agent … not found` (the stage's agents were not rendered into its workspace) or a missing binary (startup validation reports `node_modules/.bin/<cli> not found` or a version mismatch). A Claude Code stage whose tool calls fail with permission errors hit its `dontAsk` rules; compare the denied call with `claude-settings.json`.
