# Log artifact map

Every task writes to `output/logs/<taskId>/`, where `<taskId>` = `<issueKey>-<startTs>` (e.g. `DOC-3189-1773303541878`). `<ts>` below is the collection timestamp, so files from one run share the prefix but not necessarily `<ts>`.

## Per-task directory

```
output/logs/<taskId>/
├── <taskId>-<ts>.log                       # Human-readable container stream: [build] [setup] [claude] or [copilot] ([local-claude] / [local-copilot] for host stages) lines (ActivityLog.startTaskLog)
├── <taskId>-<ts>-summary.json              # Execution summary (LogCollector.saveExecutionSummary); missing when a phase threw
├── <taskId>-cli-debug-stream.log           # Live tail of the container CLIs' debug logs (ContainerManager.registerLogSources)
├── <taskId>-<ts>-audit.jsonl               # Tool audit trail from Ralph's hooks (profile.auditLogPath, default /workspace/.ralph/logs/audit.jsonl)
├── <taskId>-<ts>-pre-tool.log              # Pre-tool invocations (/workspace/.ralph/logs/pre-tool.log)
├── <taskId>-<ts>-tool-output.log           # Untruncated tool output
├── <taskId>-<ts>-proxy.log                 # Squid access.log (agent container egress)
├── <taskId>-<ts>-sidecar.log               # MCP sidecar compose logs (gateway + servers)
├── <taskId>-<ts>-state.md                  # /workspace/.ralph/tasks/<issueKey>/state.md
├── <taskId>-<ts>-artifacts/                # Export of /workspace/.ralph/tasks/<issueKey>/artifacts (subagent status.json/output.md)
├── <taskId>-<ts>-transcript.md             # Redacted transcript attached to the issue: Copilot's own, else rendered from the Claude Code sessions
│   Claude Code container stages:
├── <taskId>-<ts>-claude-cli-debug.log      # Claude Code debug log (/workspace/.ralph/logs/cli-debug/claude.log)
├── <taskId>-<ts>-claude-sessions/          # Export of /workspace/.ralph/claude/projects: session JSONL per main thread and subagent, never redacted
├── <taskId>-<ts>-claude-run-telemetry.json # Spans, tool calls, durations, API errors and compactions derived from the sessions (no token usage)
├── <taskId>-<ts>-claude-transcript.md      # The rendered Claude Code transcript, only when a Copilot transcript holds `transcript`
│   Copilot container stages:
├── <taskId>-<ts>-cli-debug.log             # Collected Copilot debug log (/workspace/.ralph/logs/cli-debug/*.log)
├── <taskId>-<ts>-session-state/            # Export of /workspace/.ralph/session-state
├── <taskId>-<ts>-session-db                # Export of /workspace/.ralph/session-store.db
│
├── <taskId>-<ts>-<stageRole>-<id>.<ext>    # Per-stage collections (multi-stage container pipelines only)
├── stages/<role>/                          # A variant's host (mode "local") stage: work/, home/, logs/
├── hooks/<hookName>/                       # Post-task hook output: artifacts/ and one <role>/ workspace per stage
└── hook-manifest.json                      # Written instead of running hooks when the trigger has skip_hooks
```

The transcripts are redacted with `shared/hooks/lib/redact.pl` during result collection, before `transcript` is attached. When a phase throws, `TaskRunner` only collects the logs, so a Copilot transcript stays unredacted and nothing is attached. Host stage workspaces are described in `code-paths.md` § Local stages.

Sources are registered in `registerLogSources()` (`src/container/log-source-registry.ts`). Filenames come from `ContainerLogCollector.collectAll()` (`src/container/log-collector.ts`).

## Global logs

| File                                                   | Written by                                             | Contains                                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `output/logs/activity-YYYY-MM-DD.log`                  | `ActivityLog` (`src/services/activity-log.ts`)         | Orchestrator events, one `HH:MM:SS [INFO] …` line each (local time) |
| `output/logs/container-YYYY-MM-DD.log`                 | `ActivityLog.createContainerLogger()`                  | All container-tagged lines, same format                             |
| `<output.logDir>/history/<dataSource>/<issueKey>.json` | `OperationLedger` (`src/services/operation-ledger.ts`) | Operation state machine incl. failure `reason`                      |

## Summary fields

```jsonc
{
  "taskId": "DOC-3189", // work item id (result.taskId), not the folder name
  "status": "error", // completed | partial | blocked | error
  "durationMs": 2281, // sum of stage durations
  "exitCode": 1,
  "prUrl": null,
  "collectedLogs": { "audit": "...", "proxy": "..." }, // id → local path; a missing id means collection failed
  "failureCategory": "infra", // only when status != completed
  "failureReason": "auth-failed", // FailureReason, only on error runs the session runner resolved
  "cliError": { "subtype": "authentication_failed", "message": "..." }, // the CLI's own terminal error
  "sessionIds": ["..."], // Claude Code session ids, one per stage (a continuation resumes the same session)
  "hooklessSessions": ["..."], // Claude Code sessions without a session_start audit record; only when non-empty
  "stderr": "...", // first 5000 chars, only when non-empty
  "agentText": "...", // first 5000 chars of the decoded agent text, only when status != completed
  "activityLogPath": "...",
  "timestamp": "2026-03-12T...",
}
```

## Log source chain

```
docker compose exec (execa)
  → StreamCapture (line-buffered, [tag] prefix)
    → container logger (ActivityLog facade, source = container)
      → output/logs/container-YYYY-MM-DD.log
      → output/logs/<taskId>/<taskId>-<ts>.log
```

If both the per-task log and the container log lack CLI lines, the CLI never spawned or wrote nothing.

## Collection failures

`collectAll()` drops an entry from `collectedLogs` when the source is missing:

- Claude Code `claude-sessions` export (and with it the derived transcript and telemetry) missing, or Copilot session-state / transcript missing: the CLI crashed before creating session files.
- Sidecar log missing: the sidecar never started (overlay or image problem).
- Proxy log missing: the egress proxy wasn't part of the stack (security overlay not merged).
