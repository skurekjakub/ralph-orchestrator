# MCP Architecture — Ralph Orchestrator

This document describes how MCP (Model Context Protocol) servers are managed, configured, and deployed across agent profiles.

## Overview

MCP servers give agents structured tool access to external services (JIRA, Azure DevOps, Discord, Playwright, etc.) instead of raw `curl` calls. Each server runs inside an isolated **MCP sidecar container**, communicating with the agent via HTTP (Streamable HTTP transport). This architecture ensures complete filesystem isolation — the agent cannot read server code, credentials, or gateway configuration.

```
profile.json → mcpServers: ["jira-kentico", "ado", "playwright"]
                     ↓
           resolveAllProfileSetup()
                     ↓
        ┌────────────┼──────────────────────┐
        ↓            ↓            ↓         ↓
  mcp-config.json  gateway.json  overlay  squid.conf
  (URL entries)    (secrets)     (sidecar) (domains)
        ↓            ↓            ↓         ↓
     agent        sidecar    compose     egress
     container    container  merge       proxy
```

Both Copilot CLI and Claude Code CLI consume the same `mcp-config.json`. Copilot loads it via `--additional-mcp-config @/workspace/.ralph/mcp-config.json`; Claude Code loads it explicitly via `--mcp-config`. The config contains only HTTP URLs pointing to the sidecar — no secrets.

## Server Registry

All MCP servers live under `shared/mcp-servers/`, each in its own subdirectory with a `mcp-server.json` manifest. The sidecar gateway and Dockerfile live under `shared/mcp-sidecar/`.

```
shared/mcp-servers/
  ado/              — Azure DevOps (custom: PR creation + review threads)
  jira-kentico/     — JIRA Cloud (custom: comments + attachments, Kentico instance)
  discord-hitl/     — Discord human-in-the-loop (custom: blocking questions)
  playwright/       — Browser automation (npm: @playwright/mcp)
  web-fetch/        — Fetch any URL and return as text (custom, direct access)
  microsoft-docs/   — Search Microsoft Learn documentation (custom, direct access)
  ralphchives-write/ — Ralphchives knowledge base write path (custom, NodeBB)
  ralphchives-read/  — Ralphchives knowledge base read path (custom, NodeBB)
shared/mcp-sidecar/
  Dockerfile        — Sidecar container image
  src/gateway.ts    — Process manager + health endpoint
  package.json      — Gateway dependencies (supergateway)
```

### Current Servers

| Server | Type | Tools | Proxy Domains |
|---|---|---|---|
| `ado` | custom | `ado_create_pull_request`, `ado_list_pull_requests`, `ado_list_pull_request_threads`, `ado_create_pull_request_thread`, `ado_reply_to_comment`, `ado_push_progress` | `.dev.azure.com`, `.visualstudio.com` |
| `jira-kentico` | custom | `jira_add_comment`, `jira_add_attachment` | `.atlassian.com`, `.atlassian.net` |
| `discord-hitl` | custom | `discord_ask` | `.discord.com`, `.discord.gg` |
| `playwright` | npm | `browser_navigate`, `browser_navigate_back`, `browser_take_screenshot`, `browser_network_requests`, `browser_click`, `browser_fill_form`, `browser_evaluate`, `browser_press_key` | — |
| `web-fetch` | custom | `web_fetch` | — |
| `microsoft-docs` | custom | `microsoft_docs_search` | — |
| `ralphchives-write` | custom | `post_task_report`, `post_observation` | — |
| `ralphchives-read` | custom | `search_ralphchives`, `list_recent_topics`, `get_topic` | — |

## Server Types

### npm (`type: "npm"`)

Uses a pre-installed npm package. No local code — just the manifest. In sidecar mode, `supergateway` bridges the stdio-based server to Streamable HTTP:

```json
{
  "name": "playwright",
  "type": "npm",
  "command": "playwright-mcp",
  "args": [],
  "sidecarPort": 9103
}
```

### Custom (`type: "custom"`)

Locally built server with source in `src/`, bundled to `dist/`. The `containerPath` field specifies where the server is mounted inside the sidecar container:

```json
{
  "name": "jira-kentico",
  "type": "custom",
  "command": "node",
  "args": ["dist/bundle.js"],
  "containerPath": "/opt/mcp/servers/jira-kentico",
  "sidecarPort": 9100,
  "requiredEnv": ["JIRA_PAT", "JIRA_EMAIL"]
}
```

Custom servers support both stdio and HTTP transport modes. In sidecar mode, the gateway spawns them with `--transport http --port <sidecarPort>`. Custom servers use `@modelcontextprotocol/sdk` with `StreamableHTTPServerTransport` and are bundled for single-file deployment (webpack or esbuild, depending on server). Build with `npm run build` inside the server directory.

## Manifest Schema

| Field | Description | Required |
|---|---|---|
| `name` | Server identifier (must match directory name) | Yes |
| `description` | Human-readable description | No |
| `type` | `"npm"` or `"custom"` | Yes |
| `command` | Executable (`node`, `playwright-mcp`, etc.) | Yes |
| `args` | Command arguments | Yes |
| `sidecarPort` | Fixed port the server listens on inside the MCP sidecar container (1–65535, must be unique) | Yes |
| `containerPath` | Absolute path inside the sidecar container where custom server code is mounted (e.g. `/opt/mcp/servers/<name>`) | Custom only |
| `requiredEnv` | Env vars that must be present (embedded in gateway.json, not in the agent container) | No |
| `optionalEnv` | Optional env vars the server supports | No |
| `proxyDomains` | Domains the server needs egress access to | No |
| `allowedUrlPaths` | Domain → allowed URL path prefixes for Copilot CLI URL restrictions | No |
| `tools` | Tool names (documentation reference + tool filtering) | No |
| `requiredConfig` | Array of env var names that a profile must provide via `mcpServers` env blocks. Validated at startup — missing keys cause a descriptive error. | No |

## Task-Scoped Parameters (JIT)

Profile `mcpServers` entries can include `env` blocks with per-server configuration. Before each task, `JitMcpConfigWriter` resolves runtime macros and injects all env values into the server's `gateway.json` entry.

### How it works

1. **Profile declaration** — Per-server env in `profile.json`:
   ```json
   {
     "mcpServers": [
       { "name": "jira-kentico", "env": { "JIRA_ISSUE_KEY": "$task.id" } },
       { "name": "ado", "env": { "ADO_PROJECT": "CustomerEducation", "TASK_BRANCH": "$task.branch" } }
     ]
   }
   ```

2. **Resolution** — Before each task, `JitMcpConfigWriter.write()` processes each env value:
   - Static values (no `$` prefix) pass through as-is
   - `$`-prefixed macros are resolved from the current JIRA issue

3. **Injection** — Resolved values merge into the server's `env` block in `gateway.json`. Existing env vars (secrets from `requiredEnv`) are preserved.

4. **Server adaptation** — MCP servers read env vars at startup. When present, they conditionally remove the corresponding parameter from tool schemas, simplifying the agent's interface.

### Available macros

| Macro | Resolves to | Example |
|---|---|---|
| `$task.id` | JIRA issue key | `DOC-3143` |
| `$task.project` | Project key derived from issue key | `DOC` |
| `$task.branch` | Branch name: `ralph/<key>-<slug>` | `ralph/DOC-3143-update-getting-started` |
| `$task.title` | JIRA issue summary | `Update getting started guide` |
| `$trigger.<key>` | Value of trigger parameter `<key>` from the JIRA comment (returns empty string if missing) | `$trigger.branch` → `feature-xyz` |

### Manifest `requiredConfig`

Servers declare `requiredConfig` to validate that profiles provide necessary env vars:

```json
{
  "name": "ado",
  "requiredConfig": ["ADO_PROJECT", "ADO_REPO"]
}
```

At startup, the orchestrator checks that every key in `requiredConfig` is present in the profile's `mcpServers` env block for that server. Missing keys cause a descriptive validation error.

### Execution order

```
template rendering → JIT MCP param injection → JIRA transition → container start → setup → hooks → execute
```

The JIT write happens after templates are rendered but before the container starts, so the sidecar always sees the task-specific config.

## Startup Resolution

At startup, `resolveAllProfileSetup()` processes each profile and generates six files in `profiles/<id>/.build/`:

### `mcp-config.json`

MCP server configuration consumed by both CLIs. Maps server names to HTTP URLs on the sidecar — **no secrets included**:

```json
{
  "mcpServers": {
    "jira-kentico": {
      "type": "http",
      "url": "http://mcp-sidecar:9100/mcp"
    },
    "ado": {
      "type": "http",
      "url": "http://mcp-sidecar:9101/mcp"
    }
  }
}
```

### `gateway.json`

Sidecar gateway configuration with commands, args, and embedded secrets. Mounted into the sidecar container only — **never into the agent**:

```json
{
  "servers": [
    {
      "name": "jira-kentico",
      "type": "custom",
      "port": 9100,
      "command": "node",
      "args": ["/opt/mcp/servers/jira-kentico/dist/bundle.js"],
      "env": { "JIRA_PAT": "...", "JIRA_EMAIL": "...", "JIRA_ISSUE_KEY": "DOC-3143" }
    }
  ]
}
```

(The task-scoped `JIRA_ISSUE_KEY` is merged in by JitMcpConfigWriter before each task.)
```

### `docker-compose.overlay.yml`

Compose overlay merged as the third file. Generates:
- **Agent container** — base env vars (`GH_TOKEN`, `ANTHROPIC_API_KEY`, etc.), URL-only `mcp-config.json` mount, copilot-config mount, resource mounts, `depends_on: mcp-sidecar`
- **MCP sidecar container** (when servers declared) — builds from `shared/mcp-sidecar/Dockerfile`, mounts server code read-only at `/opt/mcp/servers`, mounts `gateway.json`, hardened with `no-new-privileges`, `cap_drop: ALL`, resource limits (4G memory, 1 CPU, 300 PIDs), mounts the target repo volume at `/workspace` for git-powered tools (`REPO_ROOT` env var)

No MCP server code, secrets, or gateway config is mounted into the agent container.

### `squid.conf`

Profile-specific squid proxy configuration. Copied from the shared baseline `shared/security/squid.conf` with infrastructure domains (AI/LLM backends, package registries).

The MCP sidecar has **direct internet access** via the `ralph-sidecar-external` Docker network and bypasses Squid entirely. MCP server `proxyDomains` are no longer injected into the squid config — they exist in manifests for documentation purposes only.

### `copilot-config.json`

Copilot CLI config with `allowed_urls` derived from squid domains + path restrictions from MCP server manifests. For sensitive domains (JIRA, ADO), emits path-scoped patterns (e.g., `https://dev.azure.com/MyOrg/*`). For other domains, emits domain-level patterns. Mounted at `/workspace/.ralph/config.json`. See [SECURITY.md](SECURITY.md) for details.

## Network Flow

```
Agent container (internal-only network)
  → HTTP request to MCP sidecar (http://mcp-sidecar:PORT/mcp)
    → Sidecar gateway dispatches to MCP server process
      → Server makes API call directly (sidecar has unrestricted internet via ralph-sidecar-external)
        → External API
```

The agent container has no direct internet access and no MCP credentials. The agent talks to MCP servers via HTTP URLs on the internal Docker network. MCP servers inside the sidecar reach external APIs **directly** via the `ralph-sidecar-external` bridge network — they do not route through the Squid proxy. The Squid proxy only filters the **agent container's own** outbound traffic (AI providers, package registries).

## Adding a New Server

1. Create `shared/mcp-servers/<name>/mcp-server.json` with a unique `sidecarPort` (1–65535)
2. For npm servers: set `type: "npm"`, `command`, `args` — no local code needed
3. For custom servers: add `package.json`, `tsconfig.json`, `src/index.ts` with HTTP transport support (`--transport http --port PORT`), set `containerPath` to `/opt/mcp/servers/<name>`, build with `npm run build`
4. Add `"<name>"` to the profile `mcpServers` arrays that should use this server
5. List `requiredEnv` / `optionalEnv` in the manifest — they're embedded in `gateway.json` (sidecar-only)
6. List `proxyDomains` in the manifest for documentation purposes (no longer injected into squid config — the sidecar has direct internet access)

No manual squid.conf edits, compose file edits, or env var wiring needed. The orchestrator discovers manifests automatically and generates all configuration at startup.

### Custom Server HTTP Transport

Custom servers must support the Streamable HTTP transport for sidecar mode. Each request creates a fresh `McpServer` + `StreamableHTTPServerTransport` pair (stateless — no session tracking). This ensures crash resilience: if the gateway restarts a server, clients reconnect transparently without session errors.

Parse `--transport http --port PORT` from argv:

```typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";

function startHttpTransport(createMcpServer: () => McpServer, port: number): void {
  const httpServer = createServer(async (req, res) => {
    if (req.url === "/health") { res.writeHead(200); res.end('{"status":"ok"}'); return; }
    if (req.url !== "/mcp") { res.writeHead(404); res.end(); return; }
    let body;
    if (req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { res.writeHead(400); res.end('{"error":"Invalid JSON"}'); return; }
    }
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); mcpServer.close(); });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  httpServer.listen(port, "0.0.0.0");
}
```

The `main()` function should check for `--transport http` and fall back to stdio for local development.

## Agent Include Files

Agent templates reference MCP tools via `shared/agent-includes/`:
- `ado-api.md` — Documents `ado_create_pull_request`, `ado_list_pull_requests`, `ado_list_pull_request_threads`, `ado_create_pull_request_thread`, `ado_reply_to_comment` tools

These files live in `shared/agent-includes/` but are no longer inlined into all agent prompts — tool descriptions registered via MCP provide the same information. Agent templates reference specific tools by name at the relevant workflow phase instead.
