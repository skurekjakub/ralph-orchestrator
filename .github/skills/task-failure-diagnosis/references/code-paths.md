# Execution Code Paths

The full call chain from task scheduling to CLI process spawn. Use this to trace where a failure occurred when logs are insufficient.

## Primary Chain

```
TaskRunner.executeOperation()
  → AgentPipelineExecutor.execute()           # src/services/agent-pipeline-executor.ts
    → ContainerManager.executeWithExecutor()   # src/container/manager.ts
      → AgentSessionRunner.run()               # src/container/agent-session-runner.ts
        → ContinuationRunner.run()             # src/container/continuation-runner.ts
          → CopilotExecutor.run()              # src/container/cli-executors/copilot-executor.ts
          │ or ClaudeCodeExecutor.run()         # src/container/cli-executors/claude-code-executor.ts
            → executeCliCommand()              # src/container/cli-executors/shared-exec.ts
              → ComposeClient.exec()           # src/container/compose-client.ts
                → execa("docker", ["compose", ...])
                  → StreamCapture.attach()     # src/container/stream-capture.ts
```

## Key Files and What They Do

### AgentPipelineExecutor (`src/services/agent-pipeline-executor.ts`)

Iterates the variant's `stages` array. For each stage:
1. Derives a stage-specific profile via `deriveStageProfile()`
2. Creates a CLI executor via `ContainerManager.createExecutor()`
3. Calls `container.executeWithExecutor()`
4. Checks result — if `status !== "completed"`, logs stderr snippet and aborts

**What to read here:** The `pipelineAborted` block logs the stage exit code and stderr. If you see "stage failed — aborting pipeline" in the activity log, this is where it came from.

### AgentSessionRunner (`src/container/agent-session-runner.ts`)

Builds the full prompt via `PromptBuilder`, renders agent templates, writes MCP config, then delegates to `ContinuationRunner`. After execution, parses result blocks from stdout.

**What to read here:** If the prompt was malformed (e.g. Liquid template error), the CLI might crash immediately. Check `PromptBuilder` and `AgentTemplateRenderer`.

### ContinuationRunner (`src/container/continuation-runner.ts`)

Manages the retry loop when `maxContinuations > 0`. On each iteration:
1. Runs the CLI executor (initial or `--continue`)
2. Checks if stdout contains the `===RALPH_RESULT_START===` block
3. If not found and continuations remain, waits (exponential backoff) and retries

**What to read here:** If `maxContinuations` is 0 and the CLI produced output but no result block, the run will be marked as error even though the agent may have done work.

### shared-exec.ts (`src/container/cli-executors/shared-exec.ts`)

The actual `execa` invocation wrapper. Catches `ExecaError` and extracts:
- `exitCode` from the error
- `stderr` from the error's `stderr` property
- Rethrows with a structured `CliExecutionError`

**What to read here:** If execa fails (command not found, Docker error), the error is caught here. The `stderr` field on the result comes from this catch block.

### StreamCapture (`src/container/stream-capture.ts`)

Attaches to the spawned process's stdout and stderr streams:
- Line-buffers output (splits on `\n`)
- Logs each line via the container logger
- Flushes residual buffer content on stream `close`

**What to read here:** If the CLI writes a partial line (no trailing newline) and dies, the `close` handler flushes it. If you're seeing truncated last lines, this is the place to check.

### ComposeClient (`src/container/compose-client.ts`)

Wraps `docker compose` commands. The `exec()` method builds the full command with all `-f` flags (base + security + overlay) and runs it via execa.

**What to read here:** If the Docker command itself fails (container not running, service name wrong), the error surfaces here as an execa error. Check the three-file compose merge if you suspect a configuration issue.

## Error Propagation

Errors propagate up the chain as exceptions:

```
execa throws ExecaError (non-zero exit, signal, etc.)
  → shared-exec catches, wraps as CliExecutionError with exitCode + stderr
    → ContinuationRunner receives error, stores exitCode/stderr on result
      → AgentSessionRunner passes result up
        → ContainerManager passes result up
          → AgentPipelineExecutor checks result.status, logs failure, aborts
            → TaskRunner catches any thrown error, transitions to error state
              → TaskResultWriter collects logs + writes summary
```

The `RalphResult` object accumulates state as it propagates:
- `stdout` / `stderr` — set by ContinuationRunner from CLI output
- `exitCode` — set by shared-exec from ExecaError
- `status` — set to `"error"` when result block is missing or exit is non-zero
- `collectedLogs` — populated by TaskResultWriter after execution

## Pre-Execution Setup Chain

If the failure happens before the CLI runs (during container setup):

```
ProfileSetup.setupProfile()
  → AgentTemplateRenderer.renderAll()     # Renders Liquid → .build/
  → McpConfigWriter.write()               # Writes mcp-config.json + gateway.json
  → ComposeOverlayGenerator.generate()    # Writes docker-compose.overlay.yml
  → SquidConfigGenerator.generate()       # Writes squid.conf with domain allowlist

ContainerManager.start()
  → ComposeClient.up()                    # docker compose up -d
  → LifecycleHooks (RepoSyncHook)         # git exclude + checkout + sync
  → WorkspaceCleaner.prepare()            # Creates /workspace/.ralph/ in container
```

If any of these fail, the CLI never runs. Check the activity log for errors during these phases.
