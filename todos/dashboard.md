# Dashboard — External Status Board & Local Development UI

## What This Is

Two dashboard systems that need attention:

1. **External dashboard** (`ralph-dashboard/`): A Next.js app deployed to Vercel with Upstash Redis. Receives heartbeat pings from the orchestrator. Multi-agent status, auto-refreshing. Needs refinement or removal.
2. **Local dashboard** (`dashboard-local/`): A Vite + React app that connects to the orchestrator's WebSocket server for real-time state, logs, and tool output. Has known issues with streaming and needs polish.

## External Dashboard — Refine or Cut

### Current State

The orchestrator sends heartbeat payloads to a Vercel-hosted Next.js app via `DASHBOARD_URL`/`DASHBOARD_SECRET`. The app stores state in Upstash Redis and renders a multi-agent status view. Both env vars are optional — the heartbeat system is entirely opt-in.

### The Question

Is the external dashboard pulling its weight? If the local dashboard becomes a reliable operator interface, the external one may be redundant. On the other hand, the external dashboard enables remote monitoring without SSH access to the orchestrator host, and could serve as a team-visible status page.

### Decision Framework

**Keep and refine if:**
- Multiple people need to see agent status (team visibility)
- The orchestrator runs on a headless server where the local terminal dashboard is impractical
- Historical state tracking (Redis) is valuable for debugging

**Cut if:**
- Only one operator uses the system
- The local dashboard covers all monitoring needs
- The Vercel + Redis infrastructure adds maintenance burden without clear value

### If Keeping — What Needs Work

- Heartbeat payload enrichment (currently sends orchestrator state snapshot but could include more history)
- Auto-refresh interval tuning
- Authentication beyond shared secret (especially if exposed publicly)
- Mobile-friendly layout for quick status checks

### Codebase Impact

- If cutting: Remove `ralph-dashboard/` directory, `DashboardConfig` from config, heartbeat service, `DASHBOARD_URL`/`DASHBOARD_SECRET` from env validation
- If keeping: Changes are mostly in `ralph-dashboard/` (outside the orchestrator core)

## Local Dashboard — Streaming & Polish

### Current State

The local dashboard is a Vite + React app at `dashboard-local/`. The orchestrator starts a `DashboardServer` (WebSocket on port 3100) that broadcasts state snapshots, log entries, tool output lines, and pre-tool invocations. A Vite plugin (`logApiPlugin.ts`) serves historical log files from `output/logs/` for log browsing.

### Known Issues

1. **WebSocket connection reliability**: The `useDashboard` hook reconnects on close, but the reconnection logic may have race conditions during rapid state transitions or when the orchestrator restarts mid-task.

2. **Tool log streaming**: Tool output arrives line-by-line via `pushToolOutput()` but buffering behavior can cause partial lines, delayed flush, or dropped messages under high throughput. The user describes WebSockets as "sussy" — this suggests intermittent connection drops or data loss observed in practice.

3. **Log viewer syntax highlighting**: Historical log files are displayed as plain text. Minimal required: colorize log levels (INFO, WARN, ERROR), distinguish audit events, differentiate container output from orchestrator metadata.

### Expected Improvements

**Syntax highlighting for log viewer:**
- Parse log lines by type (ISO timestamp prefix, log level, component tag)
- Colorize: GREEN for info-level, YELLOW for warnings, RED for errors
- Monospace font with line numbers
- Audit JSONL entries could be rendered as expandable JSON blocks
- Tool output lines could be distinguished from container stdout/stderr

**WebSocket stability:**
- Heartbeat/ping-pong keep-alive between client and server
- Buffered message replay on reconnection (server holds last N messages)
- Connection state indicator in the UI (not just "connected/disconnected" but also "reconnecting" with backoff timer)

**Streaming reliability:**
- Server-side line buffering before broadcast (assemble complete lines before sending)
- Client-side sequence numbering to detect dropped messages
- Consider Server-Sent Events (SSE) as an alternative for the log stream — simpler than WebSocket for unidirectional data, automatic reconnection built into the browser API

### Codebase Impact

- `DashboardServer` (`src/services/dashboard-server.ts`): Add ping/pong, message buffering, line assembly
- `dashboard-local/src/useDashboard.ts`: Connection resilience, reconnection state
- `dashboard-local/src/App.tsx` + new components: Log viewer with syntax highlighting
- `dashboard-local/src/logApiPlugin.ts`: Potentially stream historical log files rather than loading entire files

## Open Questions

- Should both dashboards share a visual design language or serve completely different purposes?
- Could the local dashboard be exposed via a reverse proxy for remote access, eliminating the need for the external dashboard entirely?
- Is the Vite dev server adequate for production use, or should the local dashboard have a lightweight production build?
