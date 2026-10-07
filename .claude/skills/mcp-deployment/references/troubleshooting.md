# MCP troubleshooting

## Tool missing from the agent

1. The server is listed in the variant's effective `mcpServers` (profile level ∪ variant level) in `profiles/<id>/profile.json`.
2. The tool name is in the manifest `tools` array. `mcp-config.json` passes that list to the CLI as an allowlist.
3. The name is the real server-side name (see below). The agent sees it prefixed as `<server-key>-<tool>` (`docs/dev-doc/mcp-tool-naming.md`), so templates and `pre-tool.log` use the prefixed form.
4. `npm run validate` passes. `requiredConfig` keys must be present in the profile entry's `env`.

## Discover real tool names

Docs and client UIs often show renamed or client-prefixed names, and names change between package versions. Ask the server directly over stdio. Run this from `shared/mcp-sidecar/` (after `npm ci`; it has the MCP SDK v2 client), substituting values from the server's `mcp-server.json` — for a custom server, `command: 'node'` and `args: ['../mcp-servers/<name>/dist/bundle.js']` after `npm run build` there:

```bash
node --input-type=module -e "
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const transport = new StdioClientTransport({
  command: '<command>',
  args: [<args>],
  env: { ...process.env, <REQUIRED_ENV>: 'dummy' },
});
const client = new Client({ name: 'tool-lister', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
for (const t of tools) console.log(t.name + ' — ' + (t.description || '').slice(0, 80));
await client.close();
"
```

## Sidecar / server startup

The sidecar log is collected per task as `output/logs/<taskId>/<taskId>-<ts>-sidecar.log`.

| Symptom in sidecar log                                                                                       | Cause                                                                     | Fix                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `[gateway] <name> exited (... code=...)` then `exceeded max restarts (3)`                                    | Server crashes on start (bad args, missing env, missing bundle)           | Run the server locally with the same args; check `dist/` exists (`npm run build` in the server dir)                 |
| `[gateway] <name> failed to start: spawn <command> ENOENT` (npm server) or `failed to spawn` (custom server) | Package not installed in the image                                        | Add pinned `npm install -g` to `shared/mcp-sidecar/Dockerfile`; compose rebuilds on next start                      |
| `[gateway] <name> failed to start: initialize failed` or `... aborted due to timeout` (npm server)           | The stdio server rejected or never answered the MCP handshake             | Run `<command> <args>` by hand and send `initialize`; a server writing logs to stdout breaks the stdio protocol     |
| `[bridge] <name>: ...` warning                                                                               | The stdio server wrote a line that is not a JSON-RPC message              | Harmless once; the server should log to stderr instead                                                              |
| `Cannot find module` for a custom server                                                                     | Bundle not self-contained, or `args` / `containerPath` wrong              | See `bundling.md`; `args` are joined with `containerPath`                                                           |
| `EADDRINUSE`                                                                                                 | Duplicate `sidecarPort`, or one on another server's `sidecarPort + 10000` | `npm run validate` reports collisions, including upstream ports                                                     |
| `[entrypoint] pre-init had failures`                                                                         | An `initScript` failed (non-fatal)                                        | Run the script by hand inside the sidecar; check its `sidecarEnv` inputs                                            |
| `[guard] <name>: allowlist drift: <tools> not exposed by the server`                                         | Manifest `tools` names a tool the server does not register                | Fix `tools` in its `mcp-server.json` from the real names (above)                                                    |
| `[guard] <name>: refusing to serve <name>: its upstream port <port> accepts connections on <address>`        | The custom server ignores `--host`, so the allowlist is bypassable        | Launch through `common/http-launch.ts`, which honours `--host`. The server stays refused until the sidecar restarts |
| `[guard] <name>: could not list upstream tools after 20 attempts`                                            | The server never answered `tools/list`; `/health` stays 503               | Check the server's own log lines for why it is not serving                                                          |

The gateway restarts a crashed server up to 3 times, 1 s apart, and reports per-server status on `127.0.0.1:9000/health` (read it with `docker exec <sidecar> node -e "fetch('http://127.0.0.1:9000/health').then(r=>r.text()).then(console.log)"`). The compose healthcheck uses it, and it stays 503 until every filtered server is verified, so a task whose sidecar never turns healthy fails before the agent starts.

## Squid proxy log (agent container only)

MCP servers bypass Squid, so read the proxy log only when you suspect the **agent's own** traffic (CLI API calls, package installs in `setup.sh`). It is collected per task as `output/logs/<taskId>/<taskId>-<ts>-proxy.log` (Squid `access.log`).

Squid tunnels HTTPS with `CONNECT host:443` and does no SSL bumping:

- `TCP_TUNNEL/200 ... CONNECT host:443` — allowed tunnel.
- `TCP_DENIED/403` — domain not in the allowlist. Add it to the profile's `allowlistDomains` (generated into `.build/squid.conf`) or to the baseline `shared/security/squid.conf`.
- `TCP_MISS_ABORTED/503 ... POST https://...` — the client sent an absolute HTTPS URL instead of using CONNECT, so its proxy support is broken.

```bash
grep "TCP_TUNNEL/200" proxy.log                       # successful HTTPS tunnels
grep -E "TCP_DENIED|TCP_MISS_ABORTED|NONE" proxy.log   # blocked / failed
awk '{print $7}' proxy.log | sort -u                   # unique destinations
```
