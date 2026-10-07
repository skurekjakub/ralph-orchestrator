---
name: task-failure-diagnosis
description: "Diagnoses why a Ralph Orchestrator task run failed, especially when it ended with an unhelpful error, a bare exit code, missing logs, or no CLI output at all. Use when the user reports a run that died without useful output, asks to investigate a task failure or exit code, says 'audit this run', 'why did this fail', 'no error message', 'the run just died', or names a failed DOC-* issue key. Also use when stderr is empty, logs say 'Failed to collect', a run finished in suspiciously few seconds, or the user needs to trace what went wrong in the JIRA → Docker → Copilot CLI pipeline. Covers log forensics, code-path tracing, container diagnostics, and known failure signatures."
---

# Task Failure Diagnosis

Work from the cheapest evidence to the most expensive: summary → sidecar/proxy logs → per-task log → global container log → code. Stop when you have the root cause; don't patch symptoms.

Read `references/log-map.md` first. Without the file layout you will waste time searching. The runtime only ever launches the GitHub Copilot CLI (`CliExecutorFactory` in `src/container/cli-executor-factory.ts`).

## Step 1: Execution summary

`output/logs/<taskId>/<taskId>-<ts>-summary.json` (`<taskId>` = `<issueKey>-<startTs>`), written by `LogCollector.saveExecutionSummary()` in `src/logs/collector.ts`.

- `status`: `completed` | `partial` | `blocked` | `error`. The agent's `STATUS:` line in the result block wins. Otherwise a timeout gives `partial`, exit 0 gives `completed`, and anything else gives `error` (`resolveStatus()` in `src/container/result-parser.ts`).
- `exitCode`: 0 clean, 137 OOM kill. A signal kill of the host-side `docker compose exec` usually shows as 1.
- `failureCategory`: heuristic `infra` / `task` / `timeout` / `unknown` (`classifyFailure()`).
- `hooklessSessions`: Claude Code container sessions whose audit log has no `session_start`, so Ralph's managed hooks did not run (likely server-managed settings replacing `/etc/claude-code/managed-settings.json`). Present only when non-empty; the audit trail and the result gate are missing for those sessions.
- `stderr`: first 5000 chars, present when non-empty. `stdout`: first 5000 chars, only for non-completed runs.
- `durationMs` under ~10 s with empty `stderr` means the CLI likely never started → Step 2.

The operation ledger `<output.logDir>/history/<dataSource>/<issueKey>.json` also records the failure `reason` per operation.

## Step 2: Sidecar and proxy logs

`<taskId>-<ts>-sidecar.log` (MCP gateway) and `<taskId>-<ts>-proxy.log` (Squid `access.log`).

- Sidecar: every server in the variant's `mcpServers` should log `[gateway] Starting <name>`, with no later `exited` or `exceeded max restarts`. Also check `[entrypoint] pre-init had failures`. Server-level debugging is in the `mcp-deployment` skill.
- Proxy: `TCP_DENIED` for a domain the agent needs. Add it to the profile's `allowlistDomains` or to `shared/security/squid.conf`.
- Both clean → the containers came up. Continue.

## Step 3: Per-task execution log

`<taskId>-<ts>.log` is the human-readable stream of container-tagged entries (`ActivityLog.startTaskLog()`). It holds `[build]`, `[setup]` and `[copilot]` lines captured by `StreamCapture`.

- Only build/setup lines → the CLI never started or crashed at launch. Check config-dir preparation (`ContainerWorkspaceCleaner.prepareConfigDir()`) and the CLI binary in the image.
- CLI output that stops mid-work → killed (timeout, OOM, abort).
- Ends without `===RALPH_RESULT_START===` → see continuation behaviour in `references/code-paths.md`.
- Empty file → the task failed before containers started (template render, compose up). Check the activity log.

## Step 4: Global logs

`output/logs/activity-YYYY-MM-DD.log` (orchestrator events) and `output/logs/container-YYYY-MM-DD.log` (all container-tagged lines). Search both for the issue key. If even the container log has no CLI lines, the process never spawned or wrote nothing to stdout or stderr.

## Step 5: Trace the code path

Read `references/code-paths.md` for the call chain, the place each log line is emitted, and how errors propagate. If you need detail inside the CLI session, use the `cli-debug-log-analysis` skill on `<taskId>-<ts>-cli-debug.log`.

## Step 6: Match a known signature

Read `references/failure-signatures.md`.

## After diagnosis

1. Config or infrastructure → fix the profile, allowlist, compose file, or Dockerfile and re-trigger.
2. Code bug → fix it with a test (see the `test-patterns` skill), run `npm run lint` and `npx vitest run`, then re-trigger.
3. Observability gap (the error happened but wasn't logged) → fix the logging first so the next run shows the real error.
4. New pattern → add it to `references/failure-signatures.md`.

## Related skills

- `cli-debug-log-analysis` — subagent spans, tool calls, tokens inside the CLI debug log.
- `agent-eval` — quality of a run that _succeeded_ but produced poor output.
- `mcp-deployment` — MCP server and sidecar problems.
