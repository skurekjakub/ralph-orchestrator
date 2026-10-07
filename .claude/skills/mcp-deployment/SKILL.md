---
name: mcp-deployment
description: "Adds, deploys, and debugs MCP servers that Ralph exposes to agent containers through the MCP sidecar (shared/mcp-servers/<name>/, shared/mcp-sidecar/). Use when adding a new custom or npm MCP server, editing an mcp-server.json manifest, picking a sidecarPort, wiring mcpServers/env/sidecarEnv in profile.json, writing an initScript, changing the sidecar Dockerfile or gateway, adding a server to the CI matrix, verifying real tool names, or debugging why a server or tool is missing from an agent run. Trigger on 'add an MCP server', 'deploy this MCP package', 'new sidecar port', 'gateway.json', 'mcp-config.json', 'sidecar won't start', 'tool not showing up for the agent'."
---

# MCP Server Deployment

MCP servers never run in the agent container. The agent gets a URL-only `mcp-config.json`; every server runs as a child process of the gateway (`shared/mcp-sidecar/src/gateway.ts`) in the `mcp-sidecar` container, which holds the credentials and has direct internet access via `ralph-sidecar-external`. The agent container stays on `ralph-internal` behind Squid. Keep that split intact: secrets go only to the sidecar, and the agent sees only what the manifest's `tools` list allows — the gateway's tool-filter proxy (`shared/mcp-sidecar/src/tool-filter-proxy.ts`) serves each filtered server's `sidecarPort`, hides other tools from `tools/list` and refuses calls to them with JSON-RPC `-32602`.

Detailed reference (read the relevant section rather than re-deriving it):

- `docs/user-guide/deploying-mcp-servers.md` — step-by-step for npm and custom servers, initScript, troubleshooting
- `docs/user-guide/mcp-servers.md` — manifest field table, available servers, required config/env per server
- `MCP.md` — startup resolution, network flow, custom server HTTP transport code
- `docs/user-guide/runtime-macros.md` — `$task.*`, `$trigger.*`, `$variantEnv.*`
- `docs/dev-doc/mcp-tool-naming.md` — how Copilot CLI prefixes tool names (`<server-key>-<tool>`)
- `docs/dev-doc/mcp-sidecar-design.md` — why the sidecar exists

## Choose the server type

| Type     | Use for                   | Code                                                                                                     | Sidecar rebuild? |
| -------- | ------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| `custom` | Our own TypeScript server | `shared/mcp-servers/<name>/` → esbuild bundle in `dist/`, mounted read-only at `/opt/mcp/servers/<name>` | No               |
| `npm`    | Third-party package       | `npm install -g <pkg>@<pinned>` in `shared/mcp-sidecar/Dockerfile`                                       | Yes              |

The gateway launches `custom` servers as `<command> <containerPath>/<args...> --transport http --host <address> --port <port>`: `127.0.0.1` and `sidecarPort + 10000` behind the tool-filter proxy when the manifest lists `tools`, `0.0.0.0` and `sidecarPort` otherwise. The server must honour all three flags and serve stateless Streamable HTTP on `/mcp`; use `parseLaunchArgs` and `serveStatelessHttp` from `shared/mcp-servers/common/http-launch.ts` (pattern: `shared/mcp-servers/web-fetch/src/index.ts`). `npm` servers speak stdio and are wrapped by `supergateway --stdio "<command args>" --outputTransport streamableHttp --port <port>`; supergateway has no bind-address option, so they listen on every interface.

## Add a server

1. **Manifest** — create `shared/mcp-servers/<name>/mcp-server.json`. Schema: `McpServerManifest` in `src/container/setup/mcp-manifest.ts`.
   - `name` = directory name. `sidecarPort` must be unique (validator rejects duplicates).
   - `custom`: set `"command": "node"`, `"args": ["dist/bundle.js"]` (relative — joined with `containerPath`), `"containerPath": "/opt/mcp/servers/<name>"`.
   - `requiredEnv` / `optionalEnv`: host `.env` vars copied into `gateway.json` (sidecar only).
   - `requiredConfig`: keys every profile using the server must supply in its `mcpServers[].env`; checked by `src/validate/profiles.ts`.
   - `tools`: becomes the agent-side allowlist in `mcp-config.json` and the allowlist the sidecar's tool-filter proxy enforces. A tool missing here is invisible to the agent, and calls to it are refused, even if the server implements it. `/health` reports allowlisted names the server does not expose as drift. Verify real names first (see `references/troubleshooting.md`).
   - `initScript` (optional): relative path to a script run by `shared/mcp-sidecar/entrypoint.sh` before the gateway starts; failures are logged and ignored. Must be idempotent and fast.
2. **Code / install**
   - `custom`: `package.json` with `build` (esbuild), `lint` (`tsc --noEmit`) and `test` (vitest, including `tests/http-launch.test.ts`) scripts; bundle per `references/bundling.md`. The orchestrator runs `npm install && npm run build` for every custom server and the gateway at startup (`src/container/setup/mcp-builder.ts`).
   - `npm`: add a pinned global install (plus any system packages) to `shared/mcp-sidecar/Dockerfile`.
3. **Profile wiring** — add the server to `mcpServers` in `profiles/<id>/profile.json`, at profile level (all variants) or variant level (that variant only; the effective set is the union). Object form adds:
   - `env` — per-server child-process env in `gateway.json`; values starting with `$` are runtime macros resolved per task by `src/container/setup/jit-mcp-params.ts`. Unknown macros throw.
   - `sidecarEnv` — container-level env on the sidecar service, visible to `initScript`; static values only.
4. **CI** — for `custom` servers add `serverDir`/`serverName` to the `mcp-servers` job matrix in `.github/workflows/pr-validation.yml` (it runs `npm ci`, `npm run lint`, `npm test` if present, `npm run build`).
5. **Docs** — add the server to the port and server tables in `docs/user-guide/deploying-mcp-servers.md`, `docs/user-guide/mcp-servers.md`, and `MCP.md` § Current Servers.
6. **Verify** — `npm run validate`, then start the orchestrator and confirm `profiles/<id>/.build/` lists the server in `mcp-config.json` and `gateway.json`. In a run's `*-sidecar.log`, look for `[gateway] Starting <name>` with no later `[gateway] <name> exited` or `exceeded max restarts`.

Generated files in `profiles/<id>/.build/` (`mcp-config.json`, `gateway.json`, `docker-compose.overlay.yml`, `pre-init.sh`, `squid.conf`, `copilot-config.json`) are rewritten on every start — fix the source, never these files.

## Port allocation

Ports come from each manifest's `sidecarPort`; 9000 is the gateway health endpoint. Current assignments: 9100 jira-kentico, 9101 ado, 9102 discord-hitl, 9103 playwright, 9104 web-fetch, 9105 microsoft-docs, 9106 ralphchives-write, 9107 ralphchives-read, 9108 codegraphcontext. Use 9109+ and re-check with:

```bash
grep -h '"sidecarPort"' shared/mcp-servers/*/mcp-server.json | sort
```

## Network rules

MCP servers have direct internet access in the sidecar, so use plain `fetch`/`axios` with no proxy agent; `shared/mcp-servers/ado/tests/server.test.ts` asserts that. Only the agent container goes through Squid. A domain the agent itself needs goes in the profile's `allowlistDomains` (or the baseline `shared/security/squid.conf`); MCP servers never need allowlist entries.

## When something breaks

Read `references/troubleshooting.md` — missing tools, sidecar startup failures, tool-name discovery, and Squid proxy-log recipes for the agent container. For a whole failed run, use the `task-failure-diagnosis` skill.
