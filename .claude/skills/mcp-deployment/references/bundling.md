# Bundling custom MCP servers

The sidecar mounts `shared/mcp-servers/` read-only and runs only `node <bundle>`, with no `npm install` inside the container. The bundle must therefore be self-contained.

## Layout

```
shared/mcp-servers/<name>/
├── mcp-server.json      # "args": ["dist/bundle.js"], "containerPath": "/opt/mcp/servers/<name>"
├── package.json         # "type": "module"; scripts: build, lint, (test)
├── tsconfig.json        # NodeNext, strict — copy from web-fetch
├── webpack.config.js
└── src/index.ts
```

## webpack (default)

Copy `shared/mcp-servers/web-fetch/webpack.config.js`. What matters in it:

- ESM output: `experiments.outputModule: true`, `output.module: true`, `output.library.type: "module"`. With `"type": "module"` in `package.json` the config itself is a plain ESM `.js` file.
- `ts-loader` compiles TypeScript inside webpack, so there is no separate `tsc` build step (`lint` still runs `tsc --noEmit`).
- `resolve.extensionAlias: { ".js": [".ts", ".js"] }` lets `src/` use NodeNext-style `./foo.js` imports that resolve to `.ts` files. Configs without it only work while `src/` is a single file.
- `build` script: `rm -rf dist && webpack`.

## esbuild (discord-hitl)

`shared/mcp-servers/discord-hitl` compiles with `tsc` and then bundles with `esbuild dist/index.js --bundle --platform=node --format=esm --minify --outfile=dist/bundle.mjs`, and its manifest points at `dist/bundle.mjs`. Prefer webpack for new servers so they all follow one build pattern.

## HTTP transport contract

The gateway appends `--transport http --port <sidecarPort>` to the command. Serve Streamable HTTP on `/mcp` (plus `/health`) and fall back to stdio when the flags are absent, so the server can still be run locally. Create a fresh `McpServer` + `StreamableHTTPServerTransport` per request (`sessionIdGenerator: undefined`); because nothing is stateful, a gateway restart is invisible to clients. Reference implementation: `shared/mcp-servers/web-fetch/src/index.ts`; the snippet is also in `MCP.md` § Custom Server HTTP Transport.
