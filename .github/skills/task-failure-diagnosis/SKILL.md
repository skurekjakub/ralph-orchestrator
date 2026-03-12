---
name: task-failure-diagnosis
description: "Diagnose why a Ralph Orchestrator task failed — especially when the execution ended with an unhelpful error, a bare exit code, missing logs, or no CLI output at all. Use this skill whenever the user reports a task died without useful output, wants to investigate a task failure or exit code, says 'audit this run', 'why did this fail', 'no error message', 'the run just died', or references a failed DOC-* issue key. Also use when stderr is empty, when logs show 'Failed to collect', when a run completed in suspiciously few seconds, or any time the user needs to trace what went wrong in the JIRA→Docker→CLI pipeline. Covers log forensics, code path tracing, container diagnostics, and common failure signatures."
---

# Task Failure Diagnosis

Systematic diagnostic workflow for investigating failed Ralph Orchestrator task runs. This skill encodes the full log forensics and code-path tracing procedure — from execution summary through container logs to CLI executor internals — and catalogs known failure signatures so you can quickly identify root causes.

## When to Use

- A task run ended with a non-zero exit code and no meaningful error message
- Execution summary shows `status: "error"` with a short duration (< 30s)
- Log collection entries say "Failed to collect" for most artifacts
- The user says something like "this run just died" or "audit this failure"
- You need to determine whether the failure was in Docker setup, CLI launch, agent execution, or result parsing

## Before You Start

Read `references/log-map.md` to understand where every log artifact lives and what each file contains. This is essential — without knowing the log layout, you'll waste time searching.

## Diagnostic Decision Tree

Follow this sequence. Each step narrows the failure domain. Stop when you find the root cause.

### Step 1: Read the execution summary

**File:** `output/logs/<key>-<startTs>/<key>-<startTs>-<endTs>-summary.json`

Look at these fields first:
- `status` — `"completed"` vs `"error"`
- `exitCode` — 0 = clean, 1 = CLI error, 137 = OOM kill, 143 = timeout/SIGTERM
- `durationMs` — under 10s usually means the CLI never started or crashed immediately
- `stderrSnippet` — if present, this often contains the actual error (added recently; older runs may lack it)
- `stdoutSnippet` — for non-completed runs, captures the last CLI output

**Decision:**
- If `stderrSnippet` contains a clear error → you likely have your answer. Confirm by reading relevant code.
- If `exitCode` is 137 → OOM. Check container resource limits in compose files.
- If `durationMs` < 10000 and `stderrSnippet` is empty → the CLI likely failed before producing output. Continue to Step 2.

### Step 2: Check sidecar and proxy logs

**Files:**
- `output/logs/<key>-<startTs>/<key>-<startTs>-<endTs>-sidecar.log`
- `output/logs/<key>-<startTs>/<key>-<startTs>-<endTs>-proxy.log`

These are Docker-level logs collected by `TaskResultWriter` via `docker compose logs`.

**Sidecar log:** Shows MCP server startup. Look for:
- All servers reaching "listening" state — count them against the profile's `mcpServers`
- `pre-init.sh` failures (non-fatal but may break specific tools)
- Port conflicts or `EADDRINUSE`

**Proxy log (Squid):** Shows outbound network requests. Useful for:
- Missing domain in allowlist → `TCP_DENIED` entries
- Confirming that setup.sh completed (you'll see npm/gem registry traffic)

**Decision:**
- If sidecar crashed or failed to start MCP servers → container infrastructure issue. Check compose overlay and MCP manifests.
- If proxy shows denied domains the CLI needs → update Squid allowlist in `shared/security/squid.conf`.
- If both look normal → the container started fine. Continue to Step 3.

### Step 3: Check the per-task execution log

**File:** `output/logs/<key>-<startTs>/<key>-<startTs>.log`

This is the real-time stream of what the CLI printed. It's written by `StreamCapture` intercepting the CLI process's stdout/stderr and routed through the `ActivityLog` container logger.

**What to look for:**
- If the file only contains setup output (npm install, gem install) but no CLI prompt/response → the CLI never started or crashed at launch
- If the file contains CLI output that stops mid-sentence → the process was killed (timeout, OOM, or external signal)
- If the file is completely empty → `StreamCapture` may not have attached, or the CLI binary wasn't found

**Decision:**
- Setup only, no CLI → check `WorkspaceCleaner` and copilot config dir setup. See Step 4.
- CLI started but no result block → check `ContinuationRunner` logic and `maxContinuations`. See `references/code-paths.md`.
- Empty file → check that the Docker image build succeeded and the CLI binary exists in the container.

### Step 4: Check the container activity log

**File:** `output/logs/container-YYYY-MM-DD.log` (date = task run date)

This is the full container-tagged activity log written by `ActivityLog.createContainerLogger()`. It captures everything `StreamCapture` routes through it, plus lifecycle events.

Search for the task's issue key to find relevant entries. If this file also lacks CLI output, the problem is upstream of `StreamCapture` — the CLI process either never spawned or produced zero output on both stdout and stderr.

### Step 5: Trace the code path

When logs don't explain the failure, trace the execution code path. Read `references/code-paths.md` for the full chain and key files.

The high-level call chain:
```
AgentPipelineExecutor.execute()
  → ContainerManager.executeWithExecutor()
    → AgentSessionRunner.run()
      → ContinuationRunner.run()
        → CopilotExecutor.run() / ClaudeCodeExecutor.run()
          → executeCliCommand() (shared-exec.ts)
            → execa (spawns CLI process)
              → StreamCapture (attaches to stdout/stderr)
```

Key places to look:
- `AgentPipelineExecutor` — logs "stage failed — aborting pipeline" with stderr snippet and exit code
- `shared-exec.ts` — catches `execa` errors, extracts exit code and stderr
- `StreamCapture` — line-buffers output, flushes on process close
- `ContinuationRunner` — manages retry logic; check `maxContinuations` config

### Step 6: Check for known failure signatures

Read `references/failure-signatures.md` for a catalog of known failure patterns. Match your observations against those signatures.

## After Diagnosis

Once you've identified the root cause:

1. **If it's a config/infrastructure issue** — fix the config, allowlist, compose file, or Dockerfile and re-trigger the task
2. **If it's a code bug** — fix it, run `npm run lint` and `npx vitest run`, then re-trigger
3. **If it's an observability gap** (the error happened but wasn't logged) — fix the logging gap first so the actual error is captured, then re-trigger to get the real error message
4. **Document new failure signatures** — if you discover a new pattern, add it to `references/failure-signatures.md`

## Related Skills

- **cli-debug-log-analysis** — For parsing CLI debug log contents (subagent spans, tool calls, tokens). Use *after* you know the CLI actually ran and produced debug output.
- **agent-eval** — For evaluating the *quality* of a completed run. Use when the task succeeded but the output may be wrong.
