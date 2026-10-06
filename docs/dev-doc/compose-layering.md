# Docker Compose Layering

The orchestrator uses a **three-file merge** pattern for Docker Compose, layering responsibilities across separate YAML files. `ComposeClient` feeds the files via `-f` flags so Docker Compose merges them top-down.

```
docker compose \
  -f profiles/<id>/docker-compose.yml          # 1. Base
  -f shared/security/docker-compose.security.yml  # 2. Security
  -f profiles/<id>/.build/docker-compose.overlay.yml  # 3. Overlay (auto-generated)
```

## Layer 1 — Base (`profiles/<id>/docker-compose.yml`)

Profile-specific infrastructure: build instructions, workspace volume mount, sidecar services, profile-specific env vars.

**Responsibilities:**

- `build:` context and Dockerfile reference
- Target repo volume mount (`${TARGET_REPO_PATH}:/workspace`)
- Agent `.md` file mounts (resolved from `.build/`)
- Profile-specific services (e.g., MSSQL database sidecar)
- Profile-specific env vars (e.g., `DB_HOST`, `ADO_PAT_XPERIENCE`)
- Network declarations (`ralph-internal`, `ralph-external`)

**Does NOT contain:** secrets, MCP config, proxy settings, security hardening, resource limits.

## Layer 2 — Security (`shared/security/docker-compose.security.yml`)

Shared across all profiles. Adds the egress proxy sidecar and container hardening.

**Responsibilities:**

- Squid forward proxy sidecar (`egress-proxy` service) with domain allowlist
- Proxy env vars (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`) on the `app` service
- Audit hook + config volume mounts (`${SHARED_HOOKS_PATH}`)
- `security_opt: no-new-privileges`, `cap_drop: ALL`
- Resource limits (memory 8G, CPU 4, PIDs 500)
- Network topology: `app` on `ralph-internal` only, `egress-proxy` bridges both networks

## Layer 3 — Overlay (`profiles/<id>/.build/docker-compose.overlay.yml`)

Auto-generated at startup by `generateComposeOverlay()`. Injects environment variables, MCP sidecar service, and volume mounts.

**Agent container (`app`) responsibilities:**

- **Base env vars** (always present): `GH_TOKEN`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_DISABLE_AUTOUPDATER`, `CLAUDE_CODE_DISABLE_COST_WARNINGS`
- MCP config mount (`mcp-config.json` → `/workspace/.ralph/mcp-config.json:ro`) — contains only HTTP URLs, no secrets
- Copilot CLI config mount (`copilot-config.json` → `/workspace/.ralph/config.json:ro`)
- Resource file mounts (profile-specific files from `resources/`)
- `depends_on: mcp-sidecar` (when MCP servers are declared)

**MCP sidecar container (`mcp-sidecar`)** — only generated when `mcpServers` is non-empty:

- Builds from `shared/mcp-sidecar/Dockerfile`
- MCP server code mount (`shared/mcp-servers/` → `/opt/mcp/servers:ro`)
- Gateway compiled code mount (`shared/mcp-sidecar/dist/` → `/opt/mcp/gateway/dist:ro`)
- Gateway config mount (`gateway.json` → `/opt/mcp/config/gateway.json:ro`) — contains commands, args, and embedded secrets
- Shared attachment exchange directory (`attachments/` → `/tmp/mcp-attachments:ro`) — sidecar reads files the agent writes
- Target repo volume mount (`${TARGET_REPO_PATH}:/workspace`) — for git operations (push, create PR)
- Connected to `ralph-internal` (agent tool calls) and `ralph-sidecar-external` (direct internet access)
- Hardened: `no-new-privileges`, `cap_drop: ALL`, resource limits (4G memory, 1 CPU, 300 PIDs)
- Health check via gateway's `GET /health` endpoint

No MCP server code, secrets, or gateway configuration is mounted into the agent container.

Only included if the file exists on disk. Profiles with no MCP servers still get the overlay for base env vars and Copilot CLI config.

## Environment Variable Flow

```
.env file (on host)
  ↓ dotenv
process.env  (orchestrator Node.js process)
  ↓ spread
ComposeClient.env  (process.env + 3 computed values)
  ↓ passed to child process
docker compose process environment
  ↓ ${VAR} interpolation in YAML
Container environment  (only vars declared in `environment:` blocks across the 3 layers)
```

### What `ComposeClient` adds

The compose process env is `process.env` plus three computed values that don't exist in `.env`:

| Variable            | Source                           | Used in                               |
| ------------------- | -------------------------------- | ------------------------------------- |
| `TARGET_REPO_PATH`  | `profile.repoPath`               | Base compose — workspace volume mount |
| `SHARED_HOOKS_PATH` | `path.resolve("shared/hooks")`   | Security overlay — audit hook mounts  |
| `SQUID_CONF_PATH`   | Profile `.build/squid.conf` path | Security overlay — proxy config mount |

All other env vars (secrets, MCP tokens, API keys) flow through `process.env` from dotenv. The overlay declares them in `environment:` blocks using `${VAR}` interpolation syntax, which Docker Compose resolves from the process env.

### Literal vs interpolated values

Most overlay env vars use interpolation (`"${VAR}"`) — Docker Compose resolves them from the process env. Two exceptions use literal values:

```yaml
CLAUDE_CODE_DISABLE_AUTOUPDATER: "1"
CLAUDE_CODE_DISABLE_COST_WARNINGS: "1"
```

These are configuration flags, not secrets — they don't need to come from `.env`.

## Git Push Authentication

The container pushes to ADO using git credentials embedded in the host repo's remote URL:

```
volumes:
  - ${TARGET_REPO_PATH}:/workspace    # mounts host repo including .git/
```

The host's `.git/config` contains the remote URL with the PAT embedded (e.g., `https://pat:TOKEN@dev.azure.com/...`). The container inherits this when `git push origin` reads the remote URL. No credential helper or env var is involved.

## File Resolution

`ComposeFileResolver` (`src/container/setup/compose-files.ts`) resolves the three files:

1. Base: `profiles/<id>/docker-compose.yml` (from `profile.composeFile`)
2. Security: `shared/security/docker-compose.security.yml` (always)
3. Overlay: `profiles/<id>/.build/docker-compose.overlay.yml` (if exists)

`ComposeClient` receives the resolved paths and uses them as `-f` arguments for all `docker compose` commands.
