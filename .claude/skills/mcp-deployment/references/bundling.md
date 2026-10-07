# Bundling custom MCP servers

The sidecar mounts `shared/mcp-servers/` read-only and runs only `node <bundle>`, with no `npm install` inside the container. The bundle must therefore be self-contained: esbuild bundles the npm dependencies into it.

## Layout

```
shared/mcp-servers/<name>/
├── mcp-server.json      # "args": ["dist/bundle.js"], "containerPath": "/opt/mcp/servers/<name>"
├── package.json         # "type": "module"; scripts: build, lint, test
├── tsconfig.json        # type-check only — copy from web-fetch
├── vitest.config.ts
├── src/index.ts         # uses ../../common/http-launch
└── tests/http-launch.test.ts
```

## esbuild

Copy `package.json` scripts from `shared/mcp-servers/web-fetch/`:

- `build`: `rm -rf dist && esbuild src/index.ts --bundle --platform=node --format=esm --target=node24 --outfile=dist/bundle.js`. The output file is what the manifest's `args` names; discord-hitl writes `dist/bundle.mjs`.
- `lint`: `tsc --noEmit`. TypeScript 7 only type-checks; the tsconfig sets `module: "ESNext"`, `moduleResolution: "bundler"`, `isolatedModules`, `noEmit`, `strict` and `"types": ["node"]`.
- `test`: `vitest run`.
- Relative imports are extensionless (`./shared`, `../../common/http-launch`).

Two cases need more than the plain command:

- **CommonJS dependencies that `require()` Node built-ins** (axios pulls in form-data and follow-redirects). An ESM bundle has no `require`, so the bundle fails at load with `Dynamic require of "util" is not supported`. Add `"--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"` (ado, jira-kentico).
- **`import()` of local modules that must load later** (ralphchives-read/-write load their tools after resolving the category id). Without code splitting esbuild inlines them behind lazy initialisers and shared modules can run out of order (`ZodLazy is not a constructor`). Build with `--splitting --outdir=dist --entry-names=bundle` instead of `--outfile`; the entry stays `dist/bundle.js` and the rest are chunk files beside it.

## HTTP transport contract

The gateway appends `--transport http --host <address> --port <port>` to the command: `127.0.0.1` and `sidecarPort + 10000` for a server whose manifest lists `tools` (the tool-filter proxy takes `sidecarPort`), `0.0.0.0` and `sidecarPort` otherwise. Parse the flags with `parseLaunchArgs` and serve with `serveStatelessHttp` from `shared/mcp-servers/common/http-launch.ts`, passing factories for a fresh `McpServer` (`@modelcontextprotocol/server`) and `NodeStreamableHTTPServerTransport` (`@modelcontextprotocol/node`, `sessionIdGenerator: undefined`). It serves `/mcp` and `/health`, binds the given host (default `0.0.0.0`), and logs the `listening on <address>:<port>` line the gateway waits for. Without `--transport http` the server speaks stdio, so it can still be run locally. Because nothing is stateful, a gateway restart is invisible to clients. Reference implementation: `shared/mcp-servers/web-fetch/src/index.ts`; the snippet is also in `MCP.md` § Custom Server HTTP Transport.

## Testing the bundle

`tests/http-launch.test.ts` (copy one from another server and set its placeholder `ENV`) uses `common/testing/built-server.ts` to run `npm run build`, start the bundle from a directory without `node_modules`, and check that `tools/list` matches the manifest's `tools`, that `--host 127.0.0.1` leaves the port unreachable on non-loopback addresses, that the default binds every interface, and that an invalid `--port` exits with an error.
