# MCP Sidecar Design — Agent Filesystem Isolation

> **Status:** Implemented. This document records the design; [MCP.md](../../MCP.md) is the reference for the running system, and the Migration Path and Files to Change sections record the rollout plan. Where the implementation differs from the proposal:
>
> - Custom servers serve **stateless per-request** Streamable HTTP (a fresh `McpServer` and `NodeStreamableHTTPServerTransport`, `sessionIdGenerator: undefined`, per request) through the shared launcher `shared/mcp-servers/common/http-launch.ts`, and bind the address the gateway passes in `--host`. See [001-ado-server-crash-session-loss.md](../past-issues/001-ado-server-crash-session-loss.md) for why they are stateless.
> - The gateway fronts every server whose manifest lists `tools` with a **tool-filter proxy** on its `sidecarPort`; the server listens on `127.0.0.1:<sidecarPort + 10000>`. The proxy removes other tools from `tools/list` and refuses calls to them with JSON-RPC `-32602`.
> - Servers and gateway are esbuild bundles on MCP SDK v2. The gateway bundle and the server code are mounted into the image at runtime.
> - The sidecar PID limit is 300, Playwright runs the pre-installed `playwright-mcp` binary, and the sidecar reaches the internet **directly** through `ralph-sidecar-external` (not through Squid).

## Problem

Currently, MCP servers run as **stdio child processes** of the CLI (Copilot/Claude Code) inside the agent container. This means:

1. **MCP server binaries** are mounted at `/workspace/.ralph/mcp-servers/:ro` — the agent can read all server source code
2. **`mcp-config.json`** is mounted at `/workspace/.ralph/mcp-config.json:ro` — contains plaintext secrets (JIRA PAT, ADO PAT, Discord tokens)
3. **Both are in `/workspace/`** — the agent's primary working directory, easily discoverable via file tools

Since the CLI runs as the `vscode` user and the agent IS the CLI process, any filesystem permission scheme is futile — if the CLI can read a file, the agent can too. The `no-new-privileges: true` and `cap_drop: ALL` security options prevent setuid/setgid workarounds.

**The only way to isolate MCP secrets and binaries from the agent is to run MCP servers in a separate container.**

## Solution: MCP Sidecar Container

Replace stdio-based MCP server invocation with HTTP-based (Streamable HTTP transport). MCP servers run in a dedicated sidecar container with its own user, and the agent CLI connects via HTTP URLs.

### Architecture

```
┌──────────────────────────────────────┐    ┌──────────────────────────────────────┐
│       Agent Container (vscode)       │    │     MCP Sidecar Container (mcp)      │
│                                      │    │                                      │
│  CLI (copilot/claude)                │    │  Gateway (gateway.ts): tool filter   │
│    ├── mcp-config.json               │    │    ├── jira-kentico  :9100 (HTTP)    │
│    │   { "jira-kentico": {           │    │    ├── ado           :9101 (HTTP)    │
│    │       "type": "http",           │    │    ├── discord-hitl  :9102 (HTTP)    │
│    │       "url": "http://mcp:9100"  │    │    └── playwright    :9103 (HTTP)    │
│    │   }}                            │    │                                      │
│    ├── NO server code                │    │  /opt/mcp/servers/  (0700, mcp:mcp)  │
│    ├── NO secrets in env or files    │    │    ├── jira-kentico/dist/bundle.js   │
│    └── connects via HTTP only ───────┼────┤    ├── ado/dist/bundle.js            │
│                                      │    │    ├── discord-hitl/dist/bundle.mjs  │
│  Network: ralph-internal only        │    │    └── playwright (pre-installed)    │
│                                      │    │                                      │
└──────────────────────────────────────┘    │  Secrets: gateway.json (mounted file) │
                                            │  Egress: direct, not through Squid   │
                                            │  Networks: internal + sidecar-ext.   │
                                            │                                      │
                                            │  Health: GET /health → 200 OK        │
                                            └──────────────────────────────────────┘
```

### Transport: Streamable HTTP (MCP spec 2025-03-26)

The [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) replaces the deprecated HTTP+SSE transport. A server exposes a single endpoint (e.g., `/mcp`) supporting POST (for JSON-RPC messages) and GET (for server-initiated SSE streams).

Both CLIs support remote MCP servers:

- **Copilot CLI**: `"type": "http", "url": "http://mcp-sidecar:PORT/mcp"` in `--additional-mcp-config`
- **Claude Code CLI**: `"url": "http://mcp-sidecar:PORT/mcp"` in `--mcp-config`

The custom servers use MCP SDK v2: `McpServer` from `@modelcontextprotocol/server` and `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node` for Streamable HTTP on Node. The gateway's tool-filter proxy and upstream monitor use `@modelcontextprotocol/client` and `@modelcontextprotocol/core`.

### What Changes

| Component                | Before (stdio)                            | After (HTTP sidecar)                                   |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------ |
| MCP server process       | Spawned by CLI as stdio child             | Runs in sidecar container                              |
| MCP server user          | `vscode` (same as agent)                  | `mcp` (dedicated, non-root)                            |
| Server binaries location | `/workspace/.ralph/mcp-servers/` in agent | `/opt/mcp/servers/` in sidecar (inaccessible to agent) |
| Secrets storage          | Plaintext in `mcp-config.json` in agent   | Env vars in sidecar only                               |
| `mcp-config.json` format | `{ command, args, env }`                  | `{ type, url }`                                        |
| Agent container mounts   | Server code + config with secrets         | Config with URLs only                                  |
| Network requirement      | None (stdio pipes)                        | Internal network (already exists)                      |

### What Stays the Same

- Security overlay — `cap_drop: ALL`, `no-new-privileges`, resource limits apply to sidecar too
- MCP sidecar has direct internet access via `ralph-sidecar-external` network (does not route through Squid)
- Profile's `mcpServers` declaration — still controls which servers are available
- Tool allowlists in manifests — written into `mcp-config.json` for the CLI and enforced in the sidecar by the gateway's tool-filter proxy
- Compose three-file merge — overlay now generates sidecar config too

## Design Decisions

### 1. Port Allocation: Fixed per-manifest

Each MCP server manifest declares an explicit `sidecarPort` field. No auto-derivation.

```json
{ "name": "jira-kentico", "sidecarPort": 9100, ... }
{ "name": "ado", "sidecarPort": 9101, ... }
{ "name": "discord-hitl", "sidecarPort": 9102, ... }
{ "name": "playwright", "sidecarPort": 9103, ... }
```

### 2. Health Checks: Yes

The gateway process exposes `GET /health` on a dedicated port (9000). Returns `200 OK` with the status of each managed server. The compose healthcheck uses this to delay agent container startup until all MCP servers are ready.

### 3. Playwright: Pre-installed in sidecar Dockerfile

No `npx -y` at runtime. The `@playwright/mcp` package is installed during the Docker build. This eliminates network dependency at startup and ensures reproducible builds.

### 4. Process Management: Restart on crash

The gateway acts as a lightweight process manager. If an MCP server process exits unexpectedly:

1. Log the crash with server name, exit code, and stderr
2. Wait 1 second (backoff)
3. Respawn the process (up to 3 retries per task)
4. Update health endpoint status

### 5. Sidecar Lifecycle: Per-profile, per-task

The sidecar starts and stops as part of the compose stack. Each profile's `gateway.json` contains only the servers declared in that profile's `mcpServers` array, so the sidecar only starts the servers the profile needs. This enforces least-privilege at the process level — a profile declaring `["jira-kentico", "ado"]` never spawns `discord-hitl` or `playwright`.

### 6. Transport: Streamable HTTP

Use the MCP spec's [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) (2025-03-26). This is the current standard, replacing the deprecated SSE transport.

- **Custom servers**: native Streamable HTTP mode with `NodeStreamableHTTPServerTransport` (MCP SDK v2). Servers accept `--transport http --port <port> --host <address>`.
- **npm servers** (playwright, codegraphcontext): [`supergateway`](https://www.npmjs.com/package/supergateway) 4.1.0 as a stdio→Streamable HTTP bridge. The gateway spawns `supergateway --stdio "<command> <args>" --outputTransport streamableHttp --port <port>`. supergateway has no bind-address option, so these listen on every interface.

## Implementation Plan

### 1. Custom Server HTTP Transport

Each custom server's entry point (`shared/mcp-servers/<name>/src/index.ts`) passes its arguments to `parseLaunchArgs` from `shared/mcp-servers/common/http-launch.ts`. Without `--transport http` it connects a server to `StdioServerTransport`. With it, `serveStatelessHttp` binds the `--host` address (default `0.0.0.0`) and `--port` with `node:http`, serves `/health`, and answers each `/mcp` request with a fresh `McpServer` connected to a fresh `NodeStreamableHTTPServerTransport` (`sessionIdGenerator: undefined`), so a restart is invisible to clients. The code is in [MCP.md § Custom Server HTTP Transport](../../MCP.md#custom-server-http-transport).

### 2. Gateway Process Manager

**Location**: `shared/mcp-sidecar/`

```
shared/mcp-sidecar/
├── package.json         # build: esbuild bundles src/gateway.ts into dist/gateway.js
├── tsconfig.json        # type-check only
├── Dockerfile
├── entrypoint.sh
└── src/
    ├── gateway.ts           # Entry: load gateway.json, start SidecarGateway
    ├── sidecar-gateway.ts   # Servers, tool-filter proxies, health endpoint
    ├── managed-server.ts    # Child process lifecycle and launch command
    ├── tool-filter-proxy.ts # Allowlist enforcement on the agent-facing port
    ├── tool-policy.ts       # JSON-RPC inspection and tools/list filtering
    ├── upstream-monitor.ts  # Allowlist drift and upstream exposure checks
    └── health.ts            # GET /health on port 9000
```

npm packages stay external in the bundle; the image installs them into `/opt/mcp/gateway/node_modules` from the lockfile, and the bundle is mounted at `/opt/mcp/gateway/dist`.

The gateway:

1. Reads `/opt/mcp/config/gateway.json` (list of servers to start)
2. Spawns each server as a child process with its env vars
3. Custom servers: `node /opt/mcp/servers/<name>/dist/bundle.js --transport http --host <HOST> --port <PORT>`
4. npm servers: `supergateway --stdio "<command> <args>" --outputTransport streamableHttp --port <PORT>`
5. For a server with `allowedTools`, listens on its `port` with the tool-filter proxy and starts the server on `127.0.0.1:<port + 10000>`; otherwise starts the server on `0.0.0.0:<port>`
6. Monitors child processes, restarts on crash (max 3 retries), and checks each filtered server for allowlist drift and for an upstream port reachable off loopback
7. Exposes `GET /health` on port 9000

#### Gateway Config (generated at startup)

```json
{
  "servers": [
    {
      "name": "jira-kentico",
      "type": "custom",
      "port": 9100,
      "command": "node",
      "args": ["/opt/mcp/servers/jira-kentico/dist/bundle.js"],
      "env": { "JIRA_PAT_KENTICO_JIRA": "...", "JIRA_EMAIL_KENTICO_JIRA": "..." },
      "allowedTools": ["jira_add_comment", "jira_add_attachment"]
    },
    {
      "name": "playwright",
      "type": "npm",
      "port": 9103,
      "command": "playwright-mcp",
      "args": ["--browser", "chromium"],
      "env": {},
      "allowedTools": ["browser_navigate", "browser_click", "..."]
    }
  ]
}
```

### 3. Sidecar Dockerfile

`shared/mcp-sidecar/Dockerfile` builds from `node:24-bookworm-slim` and, as root:

- installs `supergateway@4.1.0` and `@playwright/mcp@0.0.83` globally, then the Chromium build that Playwright MCP expects with `playwright-mcp install-browser --with-deps chromium` (into `/opt/playwright-browsers`);
- installs git, CA certificates (ADO git tools) and Python 3 with pip and venv (CodeGraphContext);
- installs the gateway's npm dependencies with `npm ci --omit=dev` from `package-lock.json`;
- hands `/opt/mcp`, the npm prefix and the browsers to `HOST_UID:HOST_GID` and switches to that user.

The gateway bundle (`dist/`), `entrypoint.sh`, the server code and `gateway.json` are mounted by the compose overlay, so code changes need no image rebuild. The healthcheck polls `http://localhost:9000/health`.

### 4. Compose Changes

#### Security overlay additions

Add `mcp-sidecar` service to compose (either in security overlay or generated overlay):

```yaml
services:
  mcp-sidecar:
    build:
      context: ../../shared/mcp-sidecar
      dockerfile: Dockerfile
    volumes:
      # MCP server code (read-only)
      - ${MCP_SERVERS_PATH}:/opt/mcp/servers:ro
      # Gateway config with embedded secrets
      - ${MCP_GATEWAY_CONFIG_PATH}:/opt/mcp/config/gateway.json:ro
    networks:
      ralph-internal:
      ralph-sidecar-external: # Direct internet access (not through Squid)
    security_opt:
      - "no-new-privileges:true"
    cap_drop:
      - ALL
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: "1.0"
          pids: 300
    # Note: no depends_on egress-proxy — sidecar has direct internet

  app:
    depends_on:
      mcp-sidecar:
        condition: service_healthy
```

#### Overlay changes

The generated `docker-compose.overlay.yml`:

- **Remove**: MCP server directory mount from `app.volumes`
- **Replace**: `mcp-config.json` in `app` — now contains only `{ type, url }` entries (no secrets)
- **Add**: `mcp-sidecar` service with server mounts and gateway config

### 5. Config Generation Changes

#### `generateMcpConfig()` — URL mode

```typescript
// Before (stdio):
{ "jira-kentico": { "command": "node", "args": [...], "env": { "JIRA_PAT_KENTICO_JIRA": "..." } } }

// After (Streamable HTTP):
{ "jira-kentico": { "type": "http", "url": "http://mcp-sidecar:9100/mcp" } }
```

The agent container's `mcp-config.json` contains **zero secrets** — only URLs pointing to the sidecar.

#### New: `generateGatewayConfig()`

Generates the sidecar's gateway config with the actual commands, args, and embedded secrets. Written to `.build/gateway.json` and mounted into the sidecar only.

#### `generateComposeOverlay()` updates

- Remove MCP server directory mount from `app.volumes`
- Add `mcp-sidecar` service definition with volume mounts
- Add health-based dependency from `app` to `mcp-sidecar`

### 6. CLI Executor Changes

**No code changes required.** Both CLIs already support `url` in mcp-config.json:

- **Copilot**: `--additional-mcp-config @/workspace/.ralph/mcp-config.json` — unchanged, file now has `{ type: "http", url }` entries
- **Claude Code**: `--mcp-config /workspace/.ralph/mcp-config.json --strict-mcp-config` — unchanged, file now has `{ url }` entries

The config path stays at `/workspace/.ralph/mcp-config.json`. Only the content changes from `{command}` to `{url}`.

### 7. Manifest Changes

Add `sidecarPort` to each MCP server manifest:

```json
{
  "name": "jira-kentico",
  "type": "custom",
  "command": "node",
  "args": ["dist/bundle.js"],
  "containerPath": "/opt/mcp/servers/jira-kentico",
  "sidecarPort": 9100,
  ...
}
```

Note: `containerPath` changes from `/workspace/.ralph/mcp-servers/<name>` to `/opt/mcp/servers/<name>` since the servers now live in the sidecar.

## Security Improvements

| Vector                         | Before                                         | After                                                                   |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Agent reads MCP secrets        | ✅ Can `cat /workspace/.ralph/mcp-config.json` | ❌ File contains URLs only, no secrets                                  |
| Agent reads server code        | ✅ Can browse `/workspace/.ralph/mcp-servers/` | ❌ Server code is in a different container                              |
| Agent modifies MCP servers     | ❌ Mount is `:ro`                              | ❌ Code is in a different container                                     |
| Agent environment leaks        | ❌ Secrets not in env (current)                | ❌ Secrets not in env (unchanged)                                       |
| Agent impersonates MCP server  | ✅ Could start a fake server on same port      | ❌ Sidecar owns the ports, agent can't bind them                        |
| Agent calls MCP tools via HTTP | N/A                                            | ⚠️ Can `curl http://mcp-sidecar:PORT/mcp` — acceptable risk (see below) |

### Residual Risks

- **Agent can send raw HTTP to sidecar**: The agent is on the same internal network and could construct HTTP requests to sidecar ports. This is the intended interface — MCP tool calls go through HTTP. The tool-filter proxy on each filtered server's port applies the manifest's `tools` allowlist to direct requests too, and the custom servers behind it listen on loopback only. npm servers run under supergateway, which listens on every interface, so their upstream ports (`sidecarPort + 10000`) are reachable from the internal network; `/health` reports them as exposed.
- **Sidecar has no request authentication**: MCP Streamable HTTP supports session management but not authentication. Any container on `ralph-internal` can call the sidecar. Mitigation: only `app` and `mcp-sidecar` are on the internal network.

## Migration Path

1. **Phase 1**: Add `--transport http --port` support to custom servers. Build gateway + sidecar Dockerfile.
2. **Phase 2**: Add `generateGatewayConfig()`. Update `generateMcpConfig()` for URL mode. Update `generateComposeOverlay()` for sidecar.
3. **Phase 3**: Update compose files — add sidecar, remove MCP mounts from agent. Update manifests (`sidecarPort`, new `containerPath`).
4. **Phase 4**: Update CLI executor constants if needed. Update tests.
5. **Phase 5**: Update docs: `MCP.md`, `SECURITY.md`, `ARCHITECTURE.md`, `CONFIGURATION.md`.

## Files to Change

| File                                             | Change                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `shared/mcp-sidecar/` (new)                      | Gateway process, Dockerfile, package.json, tsconfig.json                 |
| `shared/mcp-servers/jira-kentico/src/index.ts`   | Add Streamable HTTP transport mode                                       |
| `shared/mcp-servers/ado/src/index.ts`            | Add Streamable HTTP transport mode                                       |
| `shared/mcp-servers/discord-hitl/src/index.ts`   | Add Streamable HTTP transport mode                                       |
| `shared/mcp-servers/*/mcp-server.json`           | Add `sidecarPort`, update `containerPath`                                |
| `shared/mcp-servers/*/package.json`              | No new deps needed (`@modelcontextprotocol/sdk` already present)         |
| `src/container/setup/compose-overlay.ts`         | Remove MCP mounts from app, add sidecar service                          |
| `src/container/setup/mcp-config.ts`              | New `generateGatewayConfig()`, update `generateMcpConfig()` for URL mode |
| `src/container/setup/mcp-manifest.ts`            | Add `sidecarPort` to `McpServerManifest` interface                       |
| `src/container/setup/profile-setup.ts`           | Generate gateway config, write to `.build/`                              |
| `src/container/manager.ts`                       | Sidecar health wait (if not handled by compose depends_on)               |
| `shared/security/docker-compose.security.yml`    | Possibly add sidecar base config                                         |
| `tests/container/compose-overlay.test.ts`        | Update mount expectations, add sidecar tests                             |
| `tests/container/mcp-config.test.ts`             | Add URL-mode + gateway config tests                                      |
| Docs: `MCP.md`, `SECURITY.md`, `ARCHITECTURE.md` | Update diagrams and descriptions                                         |
