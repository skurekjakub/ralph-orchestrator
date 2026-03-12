# Log Artifact Map

Every task run produces artifacts under `output/logs/<taskId>/`. The `<taskId>` format is `<issueKey>-<startTimestamp>` (e.g. `DOC-3189-1773303541878`).

## Per-Task Directory Layout

```
output/logs/<taskId>/
├── <taskId>-<startTs>.log                     # Per-task execution log (StreamCapture output)
├── <taskId>-<endTs>-summary.json              # Execution summary (status, exit, duration, stderr)
├── <taskId>-<endTs>-proxy.log                 # Squid proxy log (outbound HTTP traffic)
├── <taskId>-<endTs>-sidecar.log               # MCP sidecar log (server startup, gateway)
├── <taskId>-<endTs>-session-state/            # CLI session state export (if available)
│   ├── *-audit.log                            # CLI audit trail
│   ├── *-transcript.md                        # Session transcript
│   ├── *-cli-debug.log                        # Raw CLI debug log (subagent spans, tool calls)
│   ├── *-tool-output.log                      # Tool output log
│   └── *-pre-tool-output.log                  # Pre-tool output log
├── hook-manifest.json                         # Lifecycle hook execution manifest
└── <stageRole>-<id>                           # Per-stage logs (multi-stage pipelines only)
```

## Global Logs

| File | Location | Written by | Contains |
|---|---|---|---|
| Activity log | `output/logs/activity-YYYY-MM-DD.log` | `ActivityLog` | Orchestrator-level events (JSONL) |
| Container log | `output/logs/container-YYYY-MM-DD.log` | `ActivityLog.createContainerLogger()` | Container-tagged CLI output (JSONL) |

## Execution Summary Fields

The `*-summary.json` is the most important file for quick triage.

```json
{
  "taskId": "DOC-3189-1773303541878",
  "status": "error",              // "completed" | "error"
  "durationMs": 2281,             // Total execution time
  "exitCode": 1,                  // CLI process exit code
  "prUrl": null,                  // PR URL if created
  "collectedLogs": { ... },       // Map of log artifact IDs → paths
  "stderr": "...",                // First 5000 chars of stderr (may be absent on old runs)
  "stdout": "...",                // First 5000 chars of stdout (non-completed only, may be absent)
  "activityLogPath": "...",       // Path to the activity JSONL file
  "timestamp": "2026-03-12T..."   // When summary was written
}
```

**Key insight:** `stderr` and `stdout` fields were added as a fix for the silent-failure problem. Runs before this change will not have these fields — for those runs, you must rely on the per-task `.log` file and container log.

## Log Source Chain

Understanding which component writes each log:

```
execa (spawns CLI)
  → StreamCapture (captures stdout/stderr, line-buffered)
    → containerLogger (ActivityLog facade with container tag)
      → container-YYYY-MM-DD.log (global container log, JSONL)
      → <taskId>-<startTs>.log (per-task log, streamed by task runner)
```

The per-task `.log` file and the container log should contain the same CLI output. If both are empty or contain only setup output, the CLI process either never spawned or produced zero output.

## Collection Failures

When `collectAll()` fails for a log artifact, the summary's `collectedLogs` will be missing that entry. Common reasons:

- **Session state "Failed to collect"** — CLI crashed before creating session files, or `--share` flag wasn't used
- **Sidecar log missing** — Sidecar container wasn't running (compose overlay issue)
- **Proxy log missing** — Proxy container wasn't part of the compose stack
