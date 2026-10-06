# Log artifact map

Every task writes to `output/logs/<taskId>/`, where `<taskId>` = `<issueKey>-<startTs>` (e.g. `DOC-3189-1773303541878`). `<ts>` below is the collection timestamp, so files from one run share the prefix but not necessarily `<ts>`.

## Per-task directory

```
output/logs/<taskId>/
├── <taskId>-<ts>.log                    # Human-readable container stream: [build] [setup] [copilot] ([local-copilot] for local stages) lines (ActivityLog.startTaskLog)
├── <taskId>-<ts>-summary.json           # Execution summary (LogCollector.saveExecutionSummary)
├── <taskId>-cli-debug-stream.log        # Live tail of the Copilot debug log (ContainerManager.registerLogSources)
├── <taskId>-<ts>-audit.jsonl            # Tool audit trail (profile.auditLogPath, default /workspace/.ralph/logs/audit.jsonl)
├── <taskId>-<ts>-transcript.md          # Session transcript (also attached to the issue)
├── <taskId>-<ts>-pre-tool.log           # Pre-tool invocations (/workspace/.ralph/logs/pre-tool.log)
├── <taskId>-<ts>-tool-output.log        # Untruncated tool output
├── <taskId>-<ts>-cli-debug.log          # Collected Copilot debug log (/workspace/.ralph/logs/cli-debug/*.log)
├── <taskId>-<ts>-proxy.log              # Squid access.log (agent container egress)
├── <taskId>-<ts>-sidecar.log            # MCP sidecar compose logs (gateway + servers)
├── <taskId>-<ts>-state.md               # /workspace/.ralph/tasks/<issueKey>/state.md
├── <taskId>-<ts>-session-state/         # Export of /workspace/.ralph/session-state
├── <taskId>-<ts>-session-db/            # Export of /workspace/.ralph/session-store.db
├── <taskId>-<ts>-artifacts/             # Export of /workspace/.ralph/tasks/<issueKey>/artifacts (subagent status.json/output.md)
├── <taskId>-<ts>-<stageRole>-<id>.<ext> # Per-stage collections (multi-stage container pipelines only)
├── hooks/<hookName>/                    # Post-task hook output (local stages)
└── hook-manifest.json                   # Written instead of running hooks when the trigger has skip_hooks
```

Sources are registered in `LogSourceRegistry.registerAll()` (`src/container/log-source-registry.ts`). Filenames come from `ContainerLogCollector.collectAll()` (`src/container/log-collector.ts`).

## Global logs

| File | Written by | Contains |
|---|---|---|
| `output/logs/activity-YYYY-MM-DD.log` | `ActivityLog` (`src/services/activity-log.ts`) | Orchestrator events (JSONL) |
| `output/logs/container-YYYY-MM-DD.log` | `ActivityLog.createContainerLogger()` | All container-tagged lines (JSONL) |
| `output/logs/history/<issueKey>.json` | `OperationLedger` (`src/services/operation-ledger.ts`) | Operation state machine incl. failure `reason` |

## Summary fields

```jsonc
{
  "taskId": "DOC-3189",            // work item id (result.taskId), not the folder name
  "status": "error",               // completed | partial | blocked | error
  "durationMs": 2281,              // sum of stage durations; 0 when TaskRunner caught a thrown error
  "exitCode": 1,
  "prUrl": null,
  "collectedLogs": { "audit": "...", "proxy": "..." },  // id → local path; a missing id means collection failed
  "failureCategory": "infra",      // only when status != completed
  "stderr": "...",                 // first 5000 chars, only when non-empty
  "stdout": "...",                 // first 5000 chars, only when status != completed
  "activityLogPath": "...",
  "timestamp": "2026-03-12T..."
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
- Session-state / transcript missing: the CLI crashed before creating session files.
- Sidecar log missing: the sidecar never started (overlay or image problem).
- Proxy log missing: the egress proxy wasn't part of the stack (security overlay not merged).
