# ADO MCP Server Crash + Unrecoverable Session Loss

**Date discovered:** 2025-06-19 (DOC-3143 run)
**Severity:** Critical — ADO tools unavailable for entire task duration
**Status:** Fixed (transport resilience) / Under investigation (SIGABRT root cause)

## Summary

The ADO MCP server crashed with SIGABRT mid-task (~seconds after startup, before its first tool call). The gateway auto-restarted it, but the MCP client could not reconnect because the server used **stateful** `StreamableHTTPServerTransport`. The new process had no session state, so every subsequent request returned `400 "Server not initialized"` — a non-recoverable error from the client's perspective.

This affected all three custom MCP servers (ADO, JIRA, Discord) since they all shared the same stateful transport pattern.

## Timeline (DOC-3143)

1. **T+0s** — Sidecar starts. Gateway spawns JIRA, ADO, Playwright servers.
2. **T+~2s** — ADO and JIRA report "listening". Playwright initialization begins.
3. **T+~5s** — Playwright completes MCP handshake + tools/list exchange (massive ~10KB JSON response).
4. **T+~5s** — ADO process crashes: `[gateway] ado exited (code=null, signal=SIGABRT)`
5. **T+1s** — Gateway auto-restarts ADO: `Restarting ado in 1000ms (attempt 1/3)`
6. **T+3s** — New ADO process starts listening on port 9101.
7. **T+~35min** — Agent calls `ado_create_pull_request` for the first time.
8. **T+~35min** — Client receives `400 Bad Request: Server not initialized` → reports tool unavailable.
9. **T+~35min** — Repeated attempts fail with same error. Agent falls back to manual git push.

## Root Cause Analysis

### Crash trigger: Playwright initialization

Three sidecar logs were compared:

| Run | Servers | Playwright? | ADO crash? |
|-----|---------|-------------|-----------|
| local-run-...937543 | jira, ado | No | No |
| DOC-3143-...443908 | jira, ado, playwright | Yes | Yes — SIGABRT |
| DOC-3143-...798148 | jira, ado, playwright | Yes | Yes — SIGABRT |

In both Playwright runs, ADO crashes at the **exact same point**: immediately after Playwright's massive `tools/list` response passes through supergateway. ADO is completely idle at this point — no tool calls, no HTTP connections, just an `http.createServer()` in the event loop.

### Leading theory: PID (thread) limit exhaustion

The sidecar's Docker `pids` limit was set to **100**. Linux cgroup PID limits count **threads**, not just processes. Each Node.js process spawns ~8-10 threads (main + libuv thread pool + V8 compiler/GC threads).

During Playwright initialization via `npx`:

| Component | Processes | Est. threads |
|-----------|-----------|-------------|
| gateway | 1 | ~8 |
| jira-kentico | 1 | ~8 |
| ado | 1 | ~8 |
| supergateway | 1 | ~8 |
| npx (npm resolution) | 1-2 | ~10 |
| @playwright/mcp | 1 | ~8 |
| **Total** | **6-8** | **~50-60 baseline** |

During `npx` startup/resolution, thread counts spike as npm resolves packages and spawns subprocesses. If total threads hit 100, any `clone()` syscall in the container returns `EAGAIN`. If the ADO process's V8 GC or libuv needs to create a thread (or even if a libuv assertion fires on unexpected EAGAIN), it calls `abort()` → SIGABRT.

Without Playwright (2 servers, ~24 threads), the 100-PID limit is never approached — explaining why the local run succeeded.

### Ruled out

- **Memory pressure**: The processes are lightweight (~100-150MB each). Total memory well under 2G. OOM killer sends SIGKILL, not SIGABRT. No "JavaScript heap out of memory" in logs.
- **ADO server bug**: The process crashes while idle (no requests, no connections). The `http.createServer()` + MCP SDK + axios + https-proxy-agent are all pure JS with no native modules.
- **Network/proxy issues**: ADO has no network connections at crash time. No proxy traffic from the sidecar. Crash happens before any tool invocation.
- **Docker signal misrouting**: SIGABRT targets a specific PID, not a process group. The gateway only sends SIGTERM/SIGKILL during shutdown.

### Session loss: "Server not initialized"

After the gateway restarted the ADO process, the new instance had `_initialized === false` on its `StreamableHTTPServerTransport`. In **stateful mode** (`sessionIdGenerator: () => randomUUID()`), the transport's `validateSession()` method:

1. Checks `_initialized` — if false, returns `400 "Server not initialized"`
2. Checks `Mcp-Session-Id` header — if missing or unknown, returns `400 "Bad Request"`

The MCP client (Copilot CLI) had established a session with the original process. On restart:
- The new process had no sessions registered
- The client sent requests with the old session ID
- The server rejected every request with `400`
- The client interpreted `400` as a permanent protocol error (not `404 "Session not found"` which would trigger re-initialization)

This made recovery impossible without a full container restart.

## Fixes Applied

### 1. Stateless per-request transport (crash resilience)

Switched all three custom MCP servers to the **stateless** `StreamableHTTPServerTransport` pattern:

```typescript
// Before (stateful — broken after restart)
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});
await mcpServer.connect(transport);
// Single transport handles all requests, tracks sessions

// After (stateless — survives restarts)
const mcpServer = createMcpServer();  // Fresh per request
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,       // Disables session validation
});
res.on("close", () => { transport.close(); mcpServer.close(); });
await mcpServer.connect(transport);
await transport.handleRequest(req, res, body);
```

With `sessionIdGenerator: undefined`, the MCP SDK's `validateSession()` skips all checks — no `_initialized` gate, no session ID matching. Each HTTP request creates a fresh server + transport, so there's no state to lose across restarts.

**Files changed:**
- `shared/mcp-servers/ado/src/index.ts`
- `shared/mcp-servers/jira-kentico/src/index.ts`
- `shared/mcp-servers/discord-hitl/src/index.ts`

### 2. PID limit increase (crash prevention)

Raised sidecar PID limit from **100 to 300** to prevent thread exhaustion during multi-server startup:

- `src/container/setup/compose-overlay.ts` — `pids: 100` → `pids: 300`

### 3. Eliminate npx from Playwright startup (reduce PID pressure)

Changed Playwright manifest from `npx @playwright/mcp` to `playwright-mcp` (runs the globally pre-installed binary directly). Eliminates `npx` process overhead — fewer PIDs, no package resolution at runtime:

- `shared/mcp-servers/playwright/mcp-server.json` — `command: "npx", args: ["@playwright/mcp"]` → `command: "playwright-mcp", args: []`
- `shared/mcp-sidecar/Dockerfile` — pre-installs `@playwright/mcp@0.0.68` globally + Chromium browser + system deps

### 4. Sidecar memory increase

Increased sidecar container memory limit from **2G to 4G** as general headroom:

- `src/container/setup/compose-overlay.ts` — `memory: 2G` → `memory: 4G`

### 5. Gateway diagnostic improvements

Added timestamped logging, PID tracking, and crash context to the gateway for future debugging:

- `shared/mcp-sidecar/src/gateway.ts`:
  - ISO timestamps on all log lines
  - Child PID logged at spawn and crash
  - Switched from `exit` to `close` event (ensures stderr is flushed before crash report)
  - `lastError` (last stderr line) included in crash log

**Before:** `[gateway] ado exited (code=null, signal=SIGABRT)`
**After:** `2026-02-20T18:30:00.000Z [gateway] ado exited (pid=42, code=null, signal=SIGABRT, lastError=none)`

## Evidence

### Sidecar log pattern (both Playwright runs)

```
[ado] ado MCP HTTP server listening on port 9101
[jira-kentico] jira-kentico MCP HTTP server listening on port 9100
[playwright] [supergateway] Starting...
(...Playwright init + tools/list exchange...)
[gateway] ado exited (code=null, signal=SIGABRT)   ← crash at exact same point
[gateway] Restarting ado in 1000ms (attempt 1/3)
[ado] ado MCP HTTP server listening on port 9101    ← restart successful
```

### Local run log (no Playwright, no crash)

```
[jira-kentico] jira-kentico MCP HTTP server listening on port 9100
[ado] ado MCP HTTP server listening on port 9101
(no crash — ran to completion)
```

### Agent transcript (DOC-3143, line ~5830)

```
Tool call: ado_create_pull_request
Error: Server returned error: TypeError: fetch failed
...
Tool call: ado_create_pull_request
Error: Server not initialized
```

### Proxy log (DOC-3143)

No `dev.azure.com` traffic from the sidecar. ADO server never successfully handled a request before crashing.

## Open Questions

- **Confirm PID theory**: Next run with `pids: 300` and gateway timestamps should confirm or rule out the thread limit. If ADO still crashes with 300 PIDs, the cause is elsewhere.
- **V8 idle crash**: If not PID-related, why does an idle Node.js HTTP server self-SIGABRT? No native modules, no network connections, no active requests. Possible V8/libuv internal assertion on some edge condition during garbage collection.

## Verification

- All 3 MCP server bundles build successfully (webpack/esbuild)
- 649/649 orchestrator tests passing
- Gateway builds clean (`tsc --noEmit`)
- Stateless transport confirmed working via MCP SDK source analysis: `validateSession()` returns `undefined` (skip) when `sessionIdGenerator` is not set
