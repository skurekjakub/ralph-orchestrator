# Deploying MCP Servers

How to add a new MCP server to the Ralph Orchestrator — whether it's an external npm package or a custom implementation built from this repo.

## How It Works

MCP servers run in a **sidecar container**, not in the agent container. The agent only sees HTTP URLs. This separation keeps credentials out of the agent's environment and lets the sidecar have direct internet access while the agent stays proxied through Squid.

```
Agent Container (app)                        MCP Sidecar Container
┌──────────────────────────┐                 ┌─────────────────────────────────┐
│                          │                 │  gateway.ts (process manager)   │
│  mcp-config.json         │   HTTP          │   ├─ jira-kentico   :9100      │
│  ┌────────────────────┐  │─────────────→   │   ├─ ado            :9101      │
│  │ "ado": {           │  │  ralph-internal │   ├─ discord-hitl   :9102      │
│  │   "url": "http://  │  │                 │   ├─ playwright     :9103      │
│  │    mcp-sidecar:9101│  │                 │   ├─ web-fetch      :9104      │
│  │   /mcp"            │  │                 │   ├─ microsoft-docs :9105      │
│  │ }                  │  │                 │   ├─ ralphchives-w  :9106      │
│  └────────────────────┘  │                 │   └─ ralphchives-r  :9107      │
│                          │                 │                                 │
│  Copilot / Claude CLI    │                 │  gateway.json (has secrets)     │
│  (reads mcp-config.json) │                 │  /opt/mcp/servers/ (code)       │
└──────────────────────────┘                 └─────────────────────────────────┘
```

### What each container has

|                  | Agent Container                  | Sidecar Container                                             |
| ---------------- | -------------------------------- | ------------------------------------------------------------- |
| **MCP binaries** | None                             | All server processes                                          |
| **Credentials**  | None (URL-only config)           | All secrets in `gateway.json`                                 |
| **Network**      | `ralph-internal` (Squid-proxied) | `ralph-internal` + `ralph-sidecar-external` (direct internet) |
| **Config file**  | `mcp-config.json`                | `gateway.json`                                                |

## Two Types of MCP Server

| Type                     | When to use             | Code lives in                | Needs Dockerfile change?                |
| ------------------------ | ----------------------- | ---------------------------- | --------------------------------------- |
| **`"npm"`** (external)   | Third-party npm package | npm registry                 | **Yes** — install in sidecar Dockerfile |
| **`"custom"`** (bespoke) | Your own implementation | `shared/mcp-servers/<name>/` | **No** — volume-mounted automatically   |

## Adding an External npm MCP Server

Use this when deploying a third-party MCP package from npm (e.g. `@playwright/mcp`, `@modelcontextprotocol/server-github`).

### Step 1: Create the manifest

Create `shared/mcp-servers/<name>/mcp-server.json`:

```json
{
  "name": "my-server",
  "description": "What this server does",
  "type": "npm",
  "command": "my-mcp-server",
  "args": [],
  "sidecarPort": 9108,
  "requiredEnv": ["API_KEY"],
  "tools": ["tool_a", "tool_b"],
  "requiredConfig": []
}
```

**Fields:**

| Field            | Required | Description                                                                                       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `name`           | Yes      | Must match the directory name                                                                     |
| `type`           | Yes      | `"npm"` for external packages                                                                     |
| `command`        | Yes      | The binary/npx command to run                                                                     |
| `args`           | Yes      | Command-line arguments (can be `[]`)                                                              |
| `sidecarPort`    | Yes      | Unique port — see [Port Allocation](#port-allocation)                                             |
| `requiredEnv`    | No       | Env vars needed in `.env` on the host                                                             |
| `tools`          | No       | Tool names the server exposes (for agent tool filtering)                                          |
| `requiredConfig` | No       | Env var keys that profiles must provide in `mcpServers.env`                                       |
| `initScript`     | No       | Relative path to a shell script executed at sidecar startup before the gateway (e.g. `"init.sh"`) |

> **Tip:** Don't trust documentation for tool names — verify them by querying the server directly. See [Verifying Tool Names](#verifying-tool-names).

### Step 2: Install in the sidecar Dockerfile

Edit `shared/mcp-sidecar/Dockerfile` and add the global install alongside the existing ones:

```dockerfile
RUN npm install -g my-mcp-server@1.2.3
```

Always pin the version. If you need system-level dependencies, install those too:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*
```

### Step 3: Declare in profile

Add the server to the `mcpServers` array in `profiles/<id>/profile.json`. You can declare servers at **profile level** (shared by all variants) or at **variant level** (scoped to one variant). The effective set for each variant is the union of both.

**Profile-level** (all variants get it):

```json
{
  "mcpServers": [
    { "name": "my-server" },
    { "name": "my-server", "env": { "PROJECT_KEY": "$task.project" } }
  ]
}
```

**Variant-level** (only this variant gets it):

```json
{
  "mcpServers": [ "web-fetch" ],
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

In this example, the @Ralph variant sees both `web-fetch` (profile) and `codegraphcontext` (variant).

#### Server entry fields

| Field        | Description                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`       | Server name — must match a directory in `shared/mcp-servers/`                                                                                                                                                                  |
| `env`        | Per-server env vars injected into `gateway.json` → child process env. Supports `$task.*`, `$trigger.*`, `$variantEnv.*` [runtime macros](runtime-macros.md).                                                                   |
| `sidecarEnv` | Container-level env vars injected into the sidecar Docker service. Used for entrypoint scripts that run before the gateway (e.g. `CGC_INDEX_PATH` for CodeGraphContext indexing). Not macro-resolved — use static values only. |

Values starting with `$` in `env` are [runtime macros](runtime-macros.md) resolved per-task:

- `$task.id`, `$task.project`, `$task.branch`, `$task.title`
- `$trigger.<key>` — from JIRA comment parameters
- `$variantEnv.PREFIX` — resolves to host env var `PREFIX_PROFILEID_DISPLAYNAME`

### Step 4: Rebuild the sidecar image

```bash
cd shared/mcp-sidecar && docker build -t ralph-mcp-sidecar .
```

Or just start the orchestrator — Docker Compose rebuilds if the Dockerfile changed.

### What happens automatically

The orchestrator generates three config files at startup in `profiles/<id>/.build/`:

1. **`mcp-config.json`** — URLs for the agent CLI (mounted read-only into agent container)
2. **`gateway.json`** — Launch commands + secrets for the sidecar (mounted read-only into sidecar)
3. **`docker-compose.overlay.yml`** — Sidecar service definition merged into the compose stack

No manual wiring needed after the three steps above.

## Adding a Custom/Bespoke MCP Server

Use this when building your own MCP server with TypeScript.

### Step 1: Create the directory

```
shared/mcp-servers/<name>/
├── mcp-server.json
├── package.json
├── webpack.config.js
├── tsconfig.json
└── src/
    └── index.ts
```

Use `"type": "custom"` in the manifest, modelled on `shared/mcp-servers/web-fetch/mcp-server.json`:

```json
{
  "name": "my-custom-server",
  "description": "What this server does",
  "type": "custom",
  "command": "node",
  "args": ["dist/bundle.js"],
  "containerPath": "/opt/mcp/servers/my-custom-server",
  "sidecarPort": 9109,
  "requiredEnv": [],
  "tools": ["my_tool"],
  "requiredConfig": ["SOME_PARAM"]
}
```

For custom servers, the gateway config joins each `args` entry onto `containerPath` (`dist/bundle.js` → `/opt/mcp/servers/my-custom-server/dist/bundle.js`), and the gateway appends `--transport http --port <sidecarPort>` when it spawns the process. Without `containerPath`, the args are used as-is, so `args: []` would launch a bare `node`.

### Step 2: Implement the server

Build with `@modelcontextprotocol/sdk`. Support both stdio (for local testing) and HTTP transport (for sidecar deployment). Look at existing servers in `shared/mcp-servers/ado/` or `shared/mcp-servers/web-fetch/` for the pattern.

### Step 3: Build the bundle

```bash
cd shared/mcp-servers/<name>
npm install
npx webpack
```

Produces `dist/bundle.js`. The gateway runs this directly with `node`.

### Step 4: Declare in profile

Same as npm servers — add to `profile.json`.

### No Dockerfile changes needed

Custom server code is volume-mounted from `shared/mcp-servers/` to `/opt/mcp/servers/` inside the sidecar. No rebuild required — just build the webpack bundle and restart.

## Port Allocation

Each server needs a unique port declared in `sidecarPort`. Current assignments:

| Port | Server            |
| ---- | ----------------- |
| 9100 | jira-kentico      |
| 9101 | ado               |
| 9102 | discord-hitl      |
| 9103 | playwright        |
| 9104 | web-fetch         |
| 9105 | microsoft-docs    |
| 9106 | ralphchives-write |
| 9107 | ralphchives-read  |
| 9108 | codegraphcontext  |

Use the next available port (9109+) for new servers.

## Pre-gateway Initialization Scripts

MCP servers can declare an `initScript` in their manifest — a shell script that runs at sidecar startup before the gateway launches. Use this for setup tasks like code indexing, database initialization, or cache warming.

### How it works

1. Add the script to the server directory: `shared/mcp-servers/<name>/init.sh`
2. Declare it in the manifest: `"initScript": "init.sh"`
3. At startup, `generatePreInitScript()` collects all declared init scripts and generates `pre-init.sh` in the profile's `.build/` directory
4. The sidecar entrypoint runs `pre-init.sh` before launching the gateway

Scripts can read `sidecarEnv` variables since they run in the same container. Failures are logged but non-fatal — the gateway still starts.

### Example: CodeGraphContext indexing

```bash
#!/bin/bash
# shared/mcp-servers/codegraphcontext/init.sh
if [ -z "$CGC_INDEX_PATH" ]; then
  echo "CGC_INDEX_PATH not set — skipping indexing"
  exit 0
fi

if [ ! -d "$CGC_INDEX_PATH" ]; then
  echo "Index path not found: $CGC_INDEX_PATH — skipping"
  exit 0
fi

echo "Indexing $CGC_INDEX_PATH ..."
cgc index --path "$CGC_INDEX_PATH"
```

### Constraints

- Path must be relative within the server directory (no `..` or leading `/`)
- Scripts should be idempotent — they may run on every container start
- Keep scripts fast — they block gateway startup

## Verifying Tool Names

npm packages may use different tool names than their docs suggest. Query the server directly:

```bash
cd shared/mcp-servers/<name>
node -e "
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({
  command: '<command>',
  args: [<args>],
  env: { ...process.env, REQUIRED_VAR: 'dummy' }
});
const client = new Client({ name: 'tool-lister', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
for (const t of tools) console.log(t.name + ' - ' + (t.description || '').slice(0, 80));
await client.close();
process.exit(0);
"
```

## Troubleshooting

### Server doesn't appear in agent tools

- Verify `profile.json` lists the server in `mcpServers`
- Check `mcp-server.json` exists in `shared/mcp-servers/<name>/`
- If `requiredConfig` is set, the profile must provide those keys in `env`

### npm server won't start in the sidecar

- Confirm the package is installed in `shared/mcp-sidecar/Dockerfile` (check `docker exec mcp-sidecar which <binary>`)
- Some packages need system libraries — check their install docs
- Test locally first: `npx <package> --help`

### Custom server bundle missing

- Run `npx webpack` in the server directory
- Verify `dist/bundle.js` exists
- The volume mount is read-only — changes require restart

### Port conflict

- Two servers cannot share a port — check manifests for duplicates
- The gateway health endpoint uses port 9000 (reserved)

## Related Docs

- [MCP Servers Reference](mcp-servers.md) — Server manifest schema, full server table, required env vars
- [Runtime Macros](runtime-macros.md) — `$task.*`, `$trigger.*`, `$variantEnv.*` macro syntax
- [Profiles](profiles.md) — Profile configuration including `mcpServers` declarations
