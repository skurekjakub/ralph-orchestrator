---
paths:
  - "shared/mcp-servers/**"
  - "shared/mcp-sidecar/**"
---

# MCP servers and sidecar

- Servers run inside the `mcp-sidecar` container under `shared/mcp-sidecar/src/gateway.ts`, never in the agent container. Credentials go only into the sidecar's `gateway.json`. The agent gets URL-only `mcp-config.json`.
- The sidecar has direct internet access, so servers use plain `fetch`/`axios` with no proxy agent. Only the agent container sits behind Squid.
- Each server is a self-contained package with its own `package.json` and `lint`/`build` scripts, plus `test` where it has tests. Run them inside the server directory. The root `npm test` skips them; CI runs each one through the `mcp-servers` matrix in `.github/workflows/pr-validation.yml`.
- `mcp-server.json` is the contract. `sidecarPort` must be unique (9000 is the gateway health port). `tools` is the allowlist the agent sees, so verify real names with `listTools()` before editing it. `requiredConfig` must be supplied by every profile that uses the server.
- Custom servers must accept `--transport http --port <port>` and serve stateless Streamable HTTP on `/mcp`. They are bundled to `dist/` because the sidecar mounts `shared/mcp-servers/` read-only and never runs `npm install`.
- Adding or changing a server (manifest, Dockerfile, profile wiring, CI, docs): use the `mcp-deployment` skill. Building server code: use the `mcp-builder` skill.
