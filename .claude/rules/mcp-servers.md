---
paths:
  - "shared/mcp-servers/**"
  - "shared/mcp-sidecar/**"
---

# MCP servers and sidecar

- Servers run inside the `mcp-sidecar` container under `shared/mcp-sidecar/src/gateway.ts`, never in the agent container. Credentials go only into the sidecar's `gateway.json`. The agent gets URL-only `mcp-config.json`.
- The sidecar has direct internet access, so servers use plain `fetch`/`axios` with no proxy agent. Only the agent container sits behind Squid.
- Each server is its own package with `package.json` and `lint` (`tsc --noEmit`), `test` (vitest) and `build` (esbuild) scripts. Run them inside the server directory. The root `npm test` skips them; CI runs each one, and the sidecar, through the `mcp-servers` matrix in `.github/workflows/pr-validation.yml`. `shared/mcp-servers/common/` is not a server: it holds the launcher every custom server bundles and the built-bundle test harness.
- Relative imports are extensionless (tsconfig `moduleResolution: "bundler"`, `noEmit`); esbuild resolves them.
- `mcp-server.json` is the contract. `sidecarPort` must be unique (9000 is the gateway health port). `tools` is the allowlist the agent sees and the sidecar's tool-filter proxy enforces, so verify real names with `listTools()` before editing it. `requiredConfig` must be supplied by every profile that uses the server.
- Custom servers must honour the launch contract `--transport http --port <port> --host <address>` (default host `0.0.0.0`) and serve stateless Streamable HTTP on `/mcp`; use `parseLaunchArgs` and `serveStatelessHttp` from `common/http-launch.ts`. A filtered server is started on `127.0.0.1`, so binding anything else lets the agent bypass the allowlist. Servers are bundled to `dist/` with their dependencies because the sidecar mounts `shared/mcp-servers/` read-only and never runs `npm install`.
- Adding or changing a server (manifest, Dockerfile, profile wiring, CI, docs): use the `mcp-deployment` skill. Building server code: use the `mcp-builder` skill.
