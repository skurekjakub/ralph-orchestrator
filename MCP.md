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

Both Copilot CLI and Claude Code CLI consume the same `mcp-config.json`. Copilot loads it via `--additional-mcp-config @/workspace/.ralph/mcp-config.json`; Claude Code loads it explicitly via `--mcp-config`. Each entry holds the server's sidecar URL (`type: "http"`, `url`) and, when the manifest lists `tools`, a `tools` allowlist — no secrets. The sidecar enforces the same allowlist whatever the CLI does with it. For a server whose manifest lists `tools`, the gateway's tool-filter proxy (`shared/mcp-sidecar/src/tool-filter-proxy.ts`) serves the agent-facing `sidecarPort`, removes every other tool from `tools/list` responses, and answers a `tools/call` for any other tool with JSON-RPC error `-32602` (`Unknown tool: <name>`) without forwarding it. The server itself listens on `127.0.0.1:<sidecarPort + 10000>` inside the sidecar. A server without `tools` is not filtered and serves every tool it registers on `sidecarPort` directly.

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
  codegraphcontext/  — Code graph analysis and structural queries (npm, CodeGraphContext)
  common/            — Code shared by the custom servers, not a server: the launcher (http-launch.ts)
                       and the built-bundle test harness (testing/built-server.ts)
shared/mcp-sidecar/
  Dockerfile        — Sidecar image: supergateway, Playwright MCP + Chromium, git, Python
  src/gateway.ts    — Process manager + health endpoint (entry of the dist/gateway.js bundle)
  src/tool-filter-proxy.ts — Enforces each server's `tools` allowlist on its agent-facing port
  package.json      — Gateway dependencies (MCP SDK v2 client and core)
```

### Current Servers

| Server              | Type   | Port | Tools (manifest `tools`)                                                                                                                                                          |
| ------------------- | ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ado`               | custom | 9101 | `ado_create_pull_request`, `ado_list_pull_requests`, `ado_list_pull_request_threads`, `ado_create_pull_request_thread`, `ado_reply_to_comment`, `ado_push_progress`               |
| `jira-kentico`      | custom | 9100 | `jira_add_comment`, `jira_add_attachment`                                                                                                                                         |
| `discord-hitl`      | custom | 9102 | `discord_ask`                                                                                                                                                                     |
| `playwright`        | npm    | 9103 | `browser_navigate`, `browser_navigate_back`, `browser_take_screenshot`, `browser_network_requests`, `browser_click`, `browser_fill_form`, `browser_evaluate`, `browser_press_key` |
| `web-fetch`         | custom | 9104 | `web_fetch`                                                                                                                                                                       |
| `microsoft-docs`    | custom | 9105 | `microsoft_docs_search`                                                                                                                                                           |
| `ralphchives-write` | custom | 9106 | `post_task_report`, `post_observation`, `reply_to_thread`                                                                                                                         |
| `ralphchives-read`  | custom | 9107 | `search_ralphchives`, `get_topic`, `list_recent_topics`                                                                                                                           |
| `codegraphcontext`  | npm    | 9108 | `add_code_to_graph`, `find_code`, `analyze_code_relationships`, `find_dead_code`, `find_most_complex_functions`, `execute_cypher_query`, and more                                 |

## Server Types

### npm (`type: "npm"`)

Uses a package installed globally in the sidecar image (`shared/mcp-sidecar/Dockerfile`, pinned version). No local code — just the manifest. The gateway runs it under `supergateway --stdio "<command> <args>" --outputTransport streamableHttp --port <port>`, which bridges the stdio server to Streamable HTTP. supergateway has no bind-address option, so it listens on every interface:

```json
{
  "name": "playwright",
  "type": "npm",
  "command": "playwright-mcp",
  "args": ["--browser", "chromium"],
  "sidecarPort": 9103
}
```

`--browser chromium` selects the Chromium build the image installs with `playwright-mcp install-browser --with-deps chromium`; without it Playwright MCP looks for Google Chrome, which the image does not have.

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
  "requiredEnv": ["JIRA_PAT_KENTICO_JIRA", "JIRA_EMAIL_KENTICO_JIRA"],
  "tools": ["jira_add_comment", "jira_add_attachment"],
  "requiredConfig": ["JIRA_ISSUE_KEY"]
}
```

Custom servers support both stdio and HTTP transport modes. The gateway starts them with the launch contract `--transport http --port <port> --host <address>`:

- A server whose manifest lists `tools` gets `--host 127.0.0.1 --port <sidecarPort + 10000>`, and the tool-filter proxy takes `sidecarPort`.
- A server without `tools` gets `--host 0.0.0.0 --port <sidecarPort>`.
- Without `--host` a server binds `0.0.0.0`; without `--transport http` it speaks stdio.

Custom servers use MCP SDK v2: `McpServer` from `@modelcontextprotocol/server` and `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node`. They parse the flags and serve HTTP through the shared launcher `shared/mcp-servers/common/http-launch.ts` (see [Custom Server HTTP Transport](#custom-server-http-transport)). `npm run build` in the server directory bundles `src/index.ts` with esbuild into the file the manifest's `args` names, npm dependencies included, so the sidecar runs it without `node_modules`. `tsc --noEmit` (`npm run lint`) only type-checks, and relative imports are extensionless.

## Manifest Schema

| Field            | Description                                                                                                                                                     | Required    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `name`           | Server identifier (must match directory name)                                                                                                                   | Yes         |
| `description`    | Human-readable description                                                                                                                                      | No          |
| `type`           | `"npm"` or `"custom"`                                                                                                                                           | Yes         |
| `command`        | Executable (`node`, `playwright-mcp`, etc.)                                                                                                                     | Yes         |
| `args`           | Command arguments                                                                                                                                               | Yes         |
| `sidecarPort`    | Fixed port the server listens on inside the MCP sidecar container (1–65535, must be unique)                                                                     | Yes         |
| `containerPath`  | Absolute path inside the sidecar container where custom server code is mounted (e.g. `/opt/mcp/servers/<name>`)                                                 | Custom only |
| `requiredEnv`    | Env vars read from the orchestrator's environment (`.env`) and embedded in gateway.json, not in the agent container                                             | No          |
| `optionalEnv`    | Optional env vars the server supports (embedded in gateway.json when set)                                                                                       | No          |
| `tools`          | Tool allowlist. Written into the agent's `mcp-config.json` and enforced by the sidecar's tool-filter proxy; absent or empty means every tool is exposed         | No          |
| `requiredConfig` | Array of env var names that a profile must provide via `mcpServers` env blocks. Validated at startup — missing keys cause a descriptive error.                  | No          |
| `initScript`     | Relative path to a shell script in the server directory, executed at sidecar startup before the gateway launches. Path must not contain `..` or start with `/`. | No          |

## Task-Scoped Parameters (JIT)

Profile `mcpServers` entries can include `env` blocks with per-server configuration. Before each task, `JitMcpConfigWriter` resolves runtime macros and injects all env values into the server's `gateway.json` entry.

### How it works

1. **Profile declaration** — Per-server env in `profile.json` (profile-level or variant-level):

   ```json
   {
     "mcpServers": [
       { "name": "jira-kentico", "env": { "JIRA_ISSUE_KEY": "$task.id" } },
       { "name": "ado", "env": { "ADO_PROJECT": "CustomerEducation", "TASK_BRANCH": "$task.branch" } }
     ],
     "variants": [
       {
         "match": { "commentTrigger": "@Ralph", ... },
         "mcpServers": [
           { "name": "codegraphcontext", "sidecarEnv": { "CGC_INDEX_PATH": "/workspace/resources/repositories/xperience" } }
         ],
         "stages": [...]
       }
     ]
   }
   ```

   Variants inherit profile-level servers and add their own. The effective set is the union.

2. **Resolution** — Before each task, `JitMcpConfigWriter.write()` processes each env value:
   - Static values (no `$` prefix) pass through as-is
   - `$`-prefixed macros are resolved from the current JIRA issue, the trigger comment's parameters, or the orchestrator's environment (`$variantEnv.*`)
   - An unknown `$` macro, or a `$variantEnv.*` variable missing from the environment, fails the task

3. **Injection** — Resolved values merge into the server's `env` block in `gateway.json`. Existing env vars (secrets from `requiredEnv`) are preserved.

4. **Server adaptation** — MCP servers read env vars at startup. When present, they conditionally remove the corresponding parameter from tool schemas, simplifying the agent's interface.

### Available macros

| Macro                  | Resolves to                                                                                                                 | Example                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `$task.id`             | JIRA issue key                                                                                                              | `DOC-3143`                                                            |
| `$task.project`        | Project key derived from issue key                                                                                          | `DOC`                                                                 |
| `$task.branch`         | Resolved task branch: the branch from preflight/PR metadata, else the `branch` trigger parameter, else `ralph/<key>-<slug>` | `ralph/DOC-3143-update-getting-started`                               |
| `$task.title`          | JIRA issue summary                                                                                                          | `Update getting started guide`                                        |
| `$trigger.<key>`       | Value of trigger parameter `<key>` from the JIRA comment (returns empty string if missing)                                  | `$trigger.branch` → `feature-xyz`                                     |
| `$variantEnv.<PREFIX>` | Value of the env var `<PREFIX>_<PROFILEID>_<DISPLAYNAME>` (uppercase; `-`, `.`, `/` → `_`)                                  | `$variantEnv.NODEBB_TOKEN` → value of `NODEBB_TOKEN_RALPH_DOCS_RALPH` |

### Manifest `requiredConfig`

Servers declare `requiredConfig` to validate that profiles provide necessary env vars:

```json
{
  "name": "ado",
  "requiredConfig": ["ADO_PROJECT", "ADO_REPO"]
}
```

At startup, the orchestrator checks that every key in `requiredConfig` is present in the profile's `mcpServers` env block for that server. Missing keys cause a descriptive validation error.

### Sidecar container environment (`sidecarEnv`)

MCP server entries also support `sidecarEnv` — a second env block injected as **container-level** environment variables on the sidecar Docker service. Unlike `env` (which goes to child processes via gateway.json), `sidecarEnv` values are available to the sidecar entrypoint script and run before the gateway starts.

```json
{
  "name": "codegraphcontext",
  "sidecarEnv": {
    "CGC_INDEX_PATH": "/workspace/resources/repositories/xperience"
  }
}
```

`sidecarEnv` values are **not** macro-resolved — use static values only. They are merged (union) across all profile-level and variant-level MCP entries and injected into the sidecar's `environment:` block in the compose overlay.

### Pre-gateway initialization (`initScript`)

MCP servers can declare an `initScript` in their manifest — a shell script that runs at sidecar startup before the gateway launches. Use this for setup tasks like code indexing, database initialization, or cache warming.

```json
{
  "name": "codegraphcontext",
  "initScript": "init.sh",
  "sidecarPort": 9108
}
```

At startup, `generatePreInitScript()` collects all init scripts from active servers and generates a `pre-init.sh` in the profile's `.build/` directory. The sidecar entrypoint sources this script before launching the gateway:

1. Scripts run in server declaration order
2. Each script runs via `bash "/opt/mcp/servers/<name>/<initScript>"`
3. Failures are logged but non-fatal — the gateway still starts
4. Init scripts can read `sidecarEnv` variables (they run in the same container)

**Constraints:**

- Path must be relative (no `..` or leading `/`) and the file must exist in the server directory
- Scripts should be idempotent — they may run on every container start
- Keep scripts fast — they block gateway startup

### Execution order

```
template + skill rendering → overlay/mcp-config/gateway regeneration (variant scope) → JIT MCP param injection → JIRA transition → container start → setup → lifecycle hooks (repo sync) → execute
```

The JIT write happens after templates are rendered but before the container starts, so the sidecar always sees the task-specific config.

## Startup Resolution

At startup, `resolveAllProfileSetup()` processes each profile, deletes and recreates `profiles/<id>/.build/`, and writes `mcp-config.json`, `gateway.json`, `docker-compose.overlay.yml`, `squid.conf`, `copilot-config.json`, `pre-init.sh` (only when a server declares `initScript`), a `.gitignore` and an `attachments/` exchange directory. Startup files cover the union of all variants' servers and skills; before each task `ComposeOverlayWriter` regenerates `mcp-config.json`, `gateway.json` and the overlay for the matched variant only.

### `mcp-config.json`

MCP server configuration mounted into the agent container. Maps server names to HTTP URLs on the sidecar, plus the manifest's `tools` allowlist — **no secrets included**:

```json
{
  "mcpServers": {
    "jira-kentico": {
      "type": "http",
      "url": "http://mcp-sidecar:9100/mcp",
      "tools": ["jira_add_comment", "jira_add_attachment"]
    },
    "ado": {
      "type": "http",
      "url": "http://mcp-sidecar:9101/mcp",
      "tools": ["ado_create_pull_request", "ado_list_pull_requests", "..."]
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
      "env": { "JIRA_PAT_KENTICO_JIRA": "...", "JIRA_EMAIL_KENTICO_JIRA": "...", "JIRA_ISSUE_KEY": "DOC-3143" },
      "allowedTools": ["jira_add_comment", "jira_add_attachment"]
    }
  ]
}
```

(The task-scoped `JIRA_ISSUE_KEY` is merged in by JitMcpConfigWriter before each task.) `allowedTools` is the manifest's `tools`; the gateway starts a tool-filter proxy for every entry that has it.

### `docker-compose.overlay.yml`

Compose overlay merged as the third file. Generates:

- **Agent container** — base env vars (`GH_TOKEN`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_DISABLE_*`), read-only mounts for `mcp-config.json`, `copilot-config.json`, rendered agents, skills and resources, the shared `attachments/` directory, and `depends_on: mcp-sidecar`
- **MCP sidecar container** (when servers declared) — builds from `shared/mcp-sidecar/Dockerfile`, mounts server code read-only at `/opt/mcp/servers`, mounts `gateway.json`, joins `ralph-internal` and `ralph-sidecar-external`, hardened with `no-new-privileges`, `cap_drop: ALL`, resource limits (24G memory, 8 CPUs, 300 PIDs), mounts the target repo at `/workspace` for git-powered tools (`REPO_ROOT` env var), plus `sidecarEnv` values and the optional `pre-init.sh`

No MCP server code, secrets, or gateway config is mounted into the agent container. `GH_TOKEN` and `ANTHROPIC_API_KEY` are set in every agent container's environment; see [SECURITY.md](SECURITY.md#credentials-in-the-agent-container).

### `squid.conf`

Profile-specific squid proxy configuration: the shared baseline `shared/security/squid.conf` (AI/LLM backends, host loopback ports) plus the profile's `allowlistDomains`.

The MCP sidecar has **direct internet access** via the `ralph-sidecar-external` Docker network and bypasses Squid entirely. MCP servers need no Squid entries.

### `copilot-config.json`

Copilot CLI config with `allowed_urls` derived from the domains in `squid.conf` (`.example.com` → `https://*.example.com`) plus `http://host.docker.internal:<port>/*` for each host loopback port. Domain-level only — no path restrictions. Mounted at `/workspace/.ralph/config.json`. See [SECURITY.md](SECURITY.md) for details.

## Network Flow

```
Agent container (internal-only network)
  → HTTP request to MCP sidecar (http://mcp-sidecar:PORT/mcp)
    → Tool-filter proxy on PORT (servers with a `tools` allowlist) checks the request
      → MCP server process on 127.0.0.1:(PORT + 10000)
        → Server makes API call directly (sidecar has unrestricted internet via ralph-sidecar-external)
          → External API
```

A server without a `tools` allowlist listens on PORT itself and gets requests directly.

The agent container has no direct internet access and no MCP credentials. The agent talks to MCP servers via HTTP URLs on the internal Docker network. MCP servers inside the sidecar reach external APIs **directly** via the `ralph-sidecar-external` bridge network — they do not route through the Squid proxy. The Squid proxy only filters the **agent container's own** outbound traffic (AI providers, package registries).

## Adding a New Server

1. Create `shared/mcp-servers/<name>/mcp-server.json` with a unique `sidecarPort` (1–65535)
2. For npm servers: set `type: "npm"`, `command`, `args` — no local code needed
3. For custom servers: add `package.json` (esbuild `build`, `tsc --noEmit` `lint`, vitest `test`), `tsconfig.json`, `src/index.ts` using the shared launcher (below), and `tests/http-launch.test.ts` modelled on another server's; set `containerPath` to `/opt/mcp/servers/<name>`, build with `npm run build`
4. Add `"<name>"` to the profile or variant `mcpServers` arrays that should use this server
5. List `requiredEnv` / `optionalEnv` in the manifest and set them in `.env` — they're embedded in `gateway.json` (sidecar-only)
6. List the server's tools in `tools` — this becomes the agent's tool allowlist for the server, enforced by the sidecar

No squid.conf edits (the sidecar has direct internet access), compose file edits, or env var wiring needed. The orchestrator discovers manifests automatically and generates all configuration at startup.

### Custom Server HTTP Transport

Custom servers must support the Streamable HTTP transport for sidecar mode. Each request creates a fresh `McpServer` + `NodeStreamableHTTPServerTransport` pair (stateless — no session tracking). This ensures crash resilience: if the gateway restarts a server, clients reconnect transparently without session errors.

Every custom server's entry point hands its launch flags to the shared launcher in `shared/mcp-servers/common/http-launch.ts`, which esbuild bundles into the server:

```typescript
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LaunchTransport, parseLaunchArgs, serveStatelessHttp } from "../../common/http-launch";

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "my-server", version: "1.0.0" });
  // server.registerTool(...)
  return server;
}

async function main(): Promise<void> {
  const launch = parseLaunchArgs(process.argv.slice(2));
  if (launch.transport === LaunchTransport.Stdio) {
    await createMcpServer().connect(new StdioServerTransport());
    return;
  }
  await serveStatelessHttp(launch, "my-server", {
    createServer: createMcpServer,
    createTransport: () => new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
  });
}

main().catch((err) => {
  console.error("my-server MCP server failed:", err);
  process.exit(1);
});
```

- `parseLaunchArgs` reads `--transport http --port <port> [--host <address>]`. `--host` defaults to `0.0.0.0`, and `--port 0` binds a free port. A missing or invalid `--port`, an empty `--host` or an unknown `--transport` throws, so the server exits with an error.
- `serveStatelessHttp` binds the address, serves `/mcp` with a fresh server and transport per request and `/health` with `{"status":"ok"}`, answers a handler error with HTTP 500, and logs `<name> MCP HTTP server listening on <address>:<port>`, the line the gateway treats as started.
- The launcher uses only `node:http`: a file outside a server package cannot resolve that package's `node_modules`, so each server constructs its own SDK transport.
- `shared/mcp-servers/common/testing/built-server.ts` starts a built bundle the way the sidecar does (manifest `command` and `args`, from a directory without `node_modules`). Each server's `tests/http-launch.test.ts` uses it to check the served tools against the manifest and that `--host 127.0.0.1` leaves the port unreachable on every other address.

## Agent Include Files

Agent templates reference MCP tools via `shared/agent-includes/`:

- `ado-api.md` — Documents `ado_create_pull_request`, `ado_list_pull_requests`, `ado_list_pull_request_threads`, `ado_create_pull_request_thread`, `ado_reply_to_comment` tools

These files live in `shared/agent-includes/` but are no longer inlined into all agent prompts — tool descriptions registered via MCP provide the same information. Agent templates reference specific tools by name at the relevant workflow phase instead.
