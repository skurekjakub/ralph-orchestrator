# MCP Server Proxy Guide

Agent containers run on an internal-only Docker network with no direct internet access. All HTTP/HTTPS traffic routes through a Squid forward proxy sidecar. This guide covers how to make MCP servers work correctly through the proxy.

## How the proxy works

```
Agent container (internal network) → Squid proxy (port 3128) → internet (allowlisted domains only)
```

The container sets these env vars automatically via the security overlay:

| Env var | Value |
|---|---|
| `HTTP_PROXY` / `http_proxy` | `http://egress-proxy:3128` |
| `HTTPS_PROXY` / `https_proxy` | `http://egress-proxy:3128` |
| `NO_PROXY` / `no_proxy` | `localhost,127.0.0.1,db,egress-proxy` |

Squid uses CONNECT tunneling for HTTPS — the client sends `CONNECT host:443`, Squid creates a TCP tunnel, and TLS negotiation happens directly between the client and the target server. Squid never sees the encrypted traffic (no SSL bumping).

## Node.js `fetch()` and proxy env vars

**Problem:** Node.js native `fetch()` (powered by undici) does NOT respect `HTTP_PROXY`/`HTTPS_PROXY` env vars by default. HTTP requests from `fetch()` bypass the proxy entirely, hitting the internal network wall and failing.

**Solution:** Write custom MCP servers using `axios` + `https-proxy-agent` instead of `fetch()`. This approach uses proper CONNECT tunneling and is fully reliable.

> **Approaches that don't work:**
> - `NODE_USE_ENV_PROXY=1` (Node 24+) — did not work reliably in testing
> - `undici` `EnvHttpProxyAgent` + `setGlobalDispatcher` — module resolution conflicts in ESM bundles
> - `NODE_OPTIONS="--require bootstrap.cjs"` — fragile, affects all Node processes in the container

**Verification:** In proxy logs, successful HTTPS requests show as:
```
TCP_TUNNEL/200 ... CONNECT api.example.com:443
```
Failed requests show as:
```
TCP_MISS_ABORTED/503 ... POST https://api.example.com/...
```
The `POST https://...` pattern means the client sent an HTTPS URL directly to the proxy without CONNECT tunneling — the proxy can't handle this without SSL bumping.

## Approaches for custom MCP servers

When writing a custom MCP server (like `jira-kentico`), use one of these HTTP client strategies:

### Recommended: `axios` + `https-proxy-agent`

```typescript
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
  || process.env.HTTP_PROXY || process.env.http_proxy;
const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

// Every request must include httpsAgent + proxy: false
const res = await axios.post(url, data, {
  headers: { ... },
  httpsAgent,
  proxy: false, // Disable axios's built-in proxy (doesn't use CONNECT tunneling)
});
```

**Why `proxy: false`?** Axios's built-in proxy handling sends HTTPS requests as plain `POST https://...` to the proxy instead of using CONNECT tunneling. Setting `proxy: false` disables this and defers to the `httpsAgent` which does proper CONNECT tunneling.

**Why not just `axios` alone?** Despite reading `HTTP_PROXY`/`HTTPS_PROXY` env vars, axios's internal proxy implementation doesn't do CONNECT for HTTPS. The `https-proxy-agent` package handles this correctly.

### Alternative: keep third-party package if it already supports proxy

Some packages use HTTP clients that natively read proxy env vars (like `typed-rest-client` from `azure-devops-node-api`). If the package works through the proxy without changes, keep it. Check the proxy logs to verify.

### What doesn't work

| Approach | Problem |
|---|---|
| Native `fetch()` without proxy patching | Ignores proxy env vars entirely |
| `NODE_USE_ENV_PROXY=1` (Node 24+) | Did not work reliably in testing |
| `axios` with built-in proxy (no `proxy: false`) | Sends `POST https://...` instead of CONNECT tunnel |
| `undici` `EnvHttpProxyAgent` + `setGlobalDispatcher` | Module resolution conflicts in ESM bundles, `Dynamic require of "node:assert"` errors |
| `NODE_OPTIONS="--require bootstrap.cjs"` | Fragile, affects all Node processes, difficult to maintain |

## Third-party MCP packages

For npm MCP packages that use `fetch()` internally, **write a custom replacement** using `axios` + `https-proxy-agent`. This is simpler and more reliable than patching Node.js globals. Both `jira-kentico` and `ado` servers were rewritten this way after the third-party `@azure-devops/mcp` package could not route through the Squid proxy.

## Bundling custom MCP servers

Custom servers are bundled with webpack for deployment into containers.

### webpack.config.js (ESM)

When `package.json` has `"type": "module"`, the webpack config is a standard ESM file:

```javascript
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: "production",
  target: "node",
  entry: "./src/index.ts",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
    clean: true,
    module: true,
    library: { type: "module" },
  },
  resolve: { extensions: [".ts", ".js"] },
  module: {
    rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
  },
};
```

### Key bundling decisions

- **ESM output** — `experiments.outputModule: true` + `output.module: true` + `library.type: "module"`
- **`"type": "module"` in package.json** — webpack config is a regular `.js` ESM file, no `.cjs` rename needed
- **`ts-loader`** compiles TypeScript directly in the webpack pipeline — no separate `tsc` step
- **`mcp-server.json`** args point to `["dist/bundle.js"]`

## Proxy log analysis

Proxy logs are collected per-task at `output/logs/<key>-<ts>-proxy.log`. Useful patterns:

```bash
# Show all HTTPS tunnels (successful connections)
grep "TCP_TUNNEL/200" proxy.log

# Show blocked/failed requests
grep -E "TCP_DENIED|TCP_MISS_ABORTED|NONE" proxy.log

# Show traffic to a specific domain
grep "atlassian" proxy.log

# Show all unique domains contacted
awk '{print $7}' proxy.log | sort -u
```

A healthy proxy log shows only `TCP_TUNNEL/200 CONNECT` entries for HTTPS traffic. Any `POST https://...` entries indicate a client not using CONNECT tunneling.
