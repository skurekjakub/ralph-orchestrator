---
name: task-failure-diagnosis
description: "Diagnoses why a Ralph Orchestrator task run failed, especially when it ended with an unhelpful error, a bare exit code, missing logs, or no CLI output at all. Use when the user reports a run that died without useful output, asks to investigate a task failure or exit code, says 'audit this run', 'why did this fail', 'no error message', 'the run just died', or names a failed DOC-* issue key. Also use when stderr is empty, logs say 'Failed to collect', a run finished in suspiciously few seconds, or the user needs to trace what went wrong in the JIRA → Docker → Claude Code (or Copilot) CLI pipeline. Covers log forensics, code-path tracing, container diagnostics, and known failure signatures."
---

# Task Failure Diagnosis

Work from the cheapest evidence to the most expensive: summary → sidecar/proxy logs → per-task log → global container log → code. Stop when you have the root cause; don't patch symptoms.

Read `references/log-map.md` first. Without the file layout you will waste time searching. Each stage runs the CLI its `cli` names, else the profile's (`claude` by default): Claude Code, or Copilot CLI as the second-class alternative. Both bundled profiles run Claude Code in every stage, the `run-analysis` post-task hook on the host included. The stage executor factory (`src/container/stage-executor-factory.ts`) picks the executor.

## Step 1: Execution summary

`output/logs/<taskId>/<taskId>-<ts>-summary.json` (`<taskId>` = `<issueKey>-<startTs>`), written by `LogCollector.saveExecutionSummary()` in `src/logs/collector.ts`.

- `status`: `completed` | `partial` | `blocked` | `error`. The `STATUS` of the agent's result wins: Claude Code's structured output (`--json-schema`), else the `STATUS:` line of the result block Copilot prints. Otherwise a timeout gives `partial`, a CLI error or a non-zero exit gives `error`, a stage that requires a result (`requireResultBlock`, on by default for variant stages) gives `error` without one, and exit 0 gives `completed` (`resolveStatus()` in `src/container/result-parser.ts`).
- `failureReason`: why an `error` run failed: `auth-failed`, `max-turns`, `execution-error`, `cli-error` (from the CLI's own error), `exit-code`, or `missing-result-block` (no result, or Claude Code's `error_max_structured_output_retries`). `cliError` holds the CLI's error subtype and message.
- `exitCode`: 0 clean, 137 OOM kill. A signal kill of the host-side `docker compose exec` usually shows as 1.
- `failureCategory`: `contract` for a missing result, `infra` for authentication and other CLI errors, `task` for the turn limit, otherwise heuristic `infra` / `task` / `timeout` / `unknown` (`classifyFailure()`).
- `sessionIds`: the Claude Code session ids of the task's stages, which name the files in the `claude-sessions` export.
- `hooklessSessions`: Claude Code container sessions whose audit log has no `session_start`, so Ralph's hooks from `/etc/ralph/claude-settings.json` did not run (likely the organisation's server-managed settings setting `allowManagedHooksOnly` or `disableAllHooks`). Present only when non-empty; the audit trail is missing for those sessions.
- `stderr`: first 5000 chars, present when non-empty. `agentText`: first 5000 chars of the decoded agent text, only for non-completed runs.
- `durationMs` under ~10 s with empty `stderr` means the CLI likely never started → Step 2.

The operation ledger `<output.logDir>/history/<dataSource>/<issueKey>.json` also records the failure `reason` per operation.

## Step 2: Sidecar and proxy logs

`<taskId>-<ts>-sidecar.log` (MCP gateway) and `<taskId>-<ts>-proxy.log` (Squid `access.log`).

- Sidecar: every server in the variant's `mcpServers` should log `[gateway] Starting <name>`, with no later `exited` or `exceeded max restarts`. Also check `[entrypoint] pre-init had failures`. Server-level debugging is in the `mcp-deployment` skill.
- Proxy: `TCP_DENIED` for a domain the agent needs. Add it to the profile's `allowlistDomains` or to `shared/security/squid.conf`.
- Both clean → the containers came up. Continue.

## Step 3: Per-task execution log

`<taskId>-<ts>.log` is the human-readable stream of container-tagged entries (`ActivityLog.startTaskLog()`). It holds `[build]` and `[setup]` lines and the CLI's own lines captured by `StreamCapture`: `[claude]` (decoded stream-json: `assistant: …`, `[<subagent>] tool …`, `result: …`) or `[copilot]`, and `[local-claude]` / `[local-copilot]` for host stages.

- Only build/setup lines → the CLI never started or crashed at launch. Check config-dir preparation (`ContainerWorkspaceCleaner.prepareConfigDir()`) and the CLI binary in the image.
- CLI output that stops mid-work → killed (timeout, OOM, abort).
- Ends without a result (no `tool StructuredOutput` line from Claude Code, no `===RALPH_RESULT_START===` from Copilot) → see continuation behaviour in `references/code-paths.md`.
- Empty file → the task failed before containers started (template render, compose up). Check the activity log.

## Step 4: Global logs

`output/logs/activity-YYYY-MM-DD.log` (orchestrator events) and `output/logs/container-YYYY-MM-DD.log` (all container-tagged lines). Search both for the issue key. If even the container log has no CLI lines, the process never spawned or wrote nothing to stdout or stderr.

## Step 5: Trace the code path

Read `references/code-paths.md` for the call chain, the place each log line is emitted, and how errors propagate. If you need detail inside the CLI session: for Claude Code, read the run telemetry `<taskId>-<ts>-claude-run-telemetry.json` (spans, tool calls, API errors, compactions) and the `<taskId>-<ts>-claude-sessions/` export; `<taskId>-<ts>-claude-cli-debug.log` holds Claude Code's startup, settings, hook and API diagnostics. For Copilot, use the `cli-debug-log-analysis` skill on `<taskId>-<ts>-cli-debug.log`.

## Step 6: Match a known signature

Read `references/failure-signatures.md`.

## After diagnosis

1. Config or infrastructure → fix the profile, allowlist, compose file, or Dockerfile and re-trigger.
2. Code bug → fix it with a test (see the `test-patterns` skill), run `npm run lint` and `npx vitest run`, then re-trigger.
3. Observability gap (the error happened but wasn't logged) → fix the logging first so the next run shows the real error.
4. New pattern → add it to `references/failure-signatures.md`.

## Related skills

- `cli-debug-log-analysis` — subagent spans, tool calls and tokens inside a Copilot `cli-debug.log`; where to look for a Claude Code run.
- `agent-eval` — quality of a run that _succeeded_ but produced poor output.
- `mcp-deployment` — MCP server and sidecar problems.
