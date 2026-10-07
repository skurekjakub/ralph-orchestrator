# Execution code paths

Use this to locate where a failure happened when the logs alone don't explain it. Verify line-level details in the source before acting; names below were checked against `src/`.

## Primary chain

```
Orchestrator.executeOperation()            # src/orchestrator.ts — resolve profile, refresh issue, preflight
  → Orchestrator.runTask()                 # builds taskId = <issueKey>-<startTs>, starts per-task log, ledger → active
    → TaskRunner.run(ctx)                  # src/services/task-runner.ts
      1. prepareProfile   → ProfileSetupService.prepareForTask()     # src/services/profile-setup-service.ts
      2. transitionIssue  → IssueManager.transitionWorkItem() + postStartComment()
      3. prepareContainer → ContainerManager.start() / checkPrerequisites()
                            ContainerWorkspaceCleaner.prepareConfigDir() / cleanPaths()
                            ContainerManager.registerLogSources() / setup()
                            preExecuteHooks (RepoSyncHook)           # src/container/lifecycle.ts
      4. executeAgent     → AgentPipelineExecutor.run()              # src/services/agent-pipeline-executor.ts
           per stage: ProfileSetupService.prepareForStage()          # multi-stage only
                      ContainerManager.createExecutorForStage()      # container → CopilotExecutor, local → LocalCopilotExecutor
                      ContainerManager.executeWithExecutor()         # src/container/manager.ts
                        → AgentSessionRunner.run()                   # src/container/agent-session-runner.ts
                          → PromptBuilder.build()                    # src/prompt/prompt-builder.ts
                          → ContinuationRunner.run()                 # src/container/continuation-runner.ts
                            → CopilotExecutor.run() / continueSession()   # src/container/cli-executors/copilot-executor.ts
                              → executeCliCommand()                  # src/container/cli-executors/shared-exec.ts
                                → ComposeClient.execWithTimeout()    # src/container/compose-client.ts (docker compose exec)
                                → new StreamCapture(proc, ...)       # src/container/stream-capture.ts
                          → parseResultBlock() + resolveStatus()     # src/container/result-parser.ts
      5. TaskResultWriter.collectResults()                           # src/services/task-result-writer.ts — logs, transcript, summary
      6. teardown, then executePostTaskHooks()                        # local-only hook stages (e.g. ralph.scientist)
```

`CliExecutorFactory` (`src/container/cli-executor-factory.ts`) only builds Copilot executors and throws `GH_TOKEN is required` without a token. `ClaudeCodeExecutor` exists in `src/container/cli-executors/claude-code-executor.ts` but nothing instantiates it, so `cli: "claude"` profiles still run Copilot.

## Where things are logged or decided

| Component                     | What to look for                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentPipelineExecutor.run()` | `[i/n] <role>: finished — status=…, exit=…`; on `status === error` logs `stage failed — aborting pipeline`, a 2000-char stderr snippet, or `CLI produced no output — check container health or CLI installation`. Only `error` aborts; `partial` continues.                                                 |
| `executeCliCommand()`         | Catches `ExecaError`: logs `CLI exited with code N — stderr: …` or `— no stderr captured (message: …)` and returns `{exitCode, stdout, stderr, timedOut}`. It never throws a wrapped error. Non-execa errors are rethrown. Once `===RALPH_RESULT_END===` is seen, the CLI gets 10 s to exit before SIGTERM. |
| `StreamCapture`               | Line-buffers stdout (info) and stderr (warn) into the container logger with a `[tag]` prefix (`build`, `setup`, `copilot`). Flushes partial last lines on `close`. Resolves `resultBlockDetected` on the end marker.                                                                                        |
| `ContinuationRunner.run()`    | Runs only when `maxContinuations > 0` and continuation is enabled. Skips if `timedOut`. Logs `No result block found — continuation k/N (backoff: …)`, `Result block found after k continuation(s)`, `All N continuation(s) exhausted without a result block`. Backoff is 5 s doubling to a 30 s cap.        |
| `resolveStatus()`             | Agent `STATUS:` (completed/partial/blocked) wins. Otherwise timeout → `partial`, exit 0 → `completed`, else `error`. A missing result block with exit 0 is therefore `completed`.                                                                                                                           |
| `TaskRunner.run()` catch      | Any thrown error (template render, compose up, setup script, hook) becomes `status: error, exitCode: 1, stderr: <message>, durationMs: 0`, followed by `collectLogs`. A summary with `durationMs: 0` means the failure came before or outside the CLI.                                                      |
| `Orchestrator.runTask()`      | Ledger → `completed` for completed/partial, otherwise `error` with `reason` = stderr. Posts an error comment to the issue.                                                                                                                                                                                  |

## Pre-execution setup

Startup (`src/app-startup.ts`) runs once: it builds custom MCP servers and the gateway (`buildCustomMcpServers()` in `src/container/setup/mcp-builder.ts`), then `resolveAllProfileSetup()` (`src/container/setup/profile-setup.ts`) writes `profiles/<id>/.build/`: `mcp-config.json`, `gateway.json`, `docker-compose.overlay.yml`, `pre-init.sh`, `squid.conf`, and each container-stage CLI's files (`copilot-settings.json`, `claude/`).

Per task, `ProfileSetupService.prepareForTask()` runs `AgentTemplateRenderer.render()` (Liquid → `profiles/<id>/.build/<cli>/agents/`), `SkillTemplateRenderer.render()`, `ComposeOverlayWriter.write()` and `JitMcpConfigWriter.write()` (macro resolution into `gateway.json`). A Liquid error or an unknown MCP macro throws here, before any container starts.

`ContainerManager.start()` runs `docker compose up -d --build` (output tagged `[build]`), and `setup()` runs the profile's setup script as `vscode` (tagged `[setup]`). `RepoSyncHook` runs host-side git against `profile.repoPath` after setup.

## Local stages

`mode: "local"` stages (post-task hooks such as `ralph.scientist`) use `LocalCopilotExecutor` with `cwd = process.cwd()`, i.e. this repo's root. They have no container logs. Their output lands under `<outputDir>/hooks/<hookName>/`, and hook failures are only warnings that never change the task result.
