## Project Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It polls JIRA for issues, starts Docker containers, runs an AI meta-agent inside them, and collects results.

## Architecture

```
JIRA poller → comment discovery → operation ledger → container lifecycle → log collection
                                       ↓
                              docker compose exec <cli>
                                  (copilot | claude)
                                       ↓
                              ralph meta-agent (subagents: researcher, reviewer)
                                       ↓
                              git push + ADO PR via REST API
```

**Comment-driven.** All agent invocations are triggered by JIRA comments matching a `commentTrigger` string. The orchestrator polls JIRA for issues, scans their comments for triggers, plans operations in a persistent ledger, and executes them one at a time.

**One task at a time.** The orchestrator processes a single operation before moving to the next.

## Source Directory Map

| Directory | Purpose |
|---|---|
| `src/` | Orchestrator entry point (`index.tsx`), main loop (`orchestrator.ts`), config loading, logger, retry utility |
| `src/jira/` | JIRA REST API v3 client, JQL poller, JQL builder from profile match rules, field extraction |
| `src/container/` | Container lifecycle (`manager.ts`), docker compose wrapper (`compose-client.ts`), result parser, log collector, streaming capture |
| `src/container/cli-executors/` | CLI executors — Copilot (`copilot-executor.ts`) and Claude Code (`claude-code-executor.ts`) |
| `src/container/setup/` | Startup setup — agent include resolution (`agent-includes.ts`), MCP manifest loading (`mcp-manifest.ts`), CLI MCP config (`mcp-config.ts`), compose overlay generation (`compose-overlay.ts`), squid proxy config (`squid-config.ts`), profile setup orchestrator (`profile-setup.ts`), compose file resolution (`compose-files.ts`), resource volume mounts (`resource-mounts.ts`) |
| `src/prompt/` | Prompt builder (`prompt.ts`), content normalizer (`normalizer.ts`), prompt injection auditor (`prompt-auditor.ts`) |
| `src/services/` | Orchestration services — trigger scanner, profile router, task runner, operation ledger, preflight checks, activity log, heartbeat, JIRA comment templates |
| `src/validate/` | Startup validation — env vars, config, profiles, Docker, security infrastructure |
| `src/logs/` | Execution summary writer |
| `src/dashboard/` | Ink (React for terminal) dashboard components — status, queue, history, log panels |
| `profiles/` | Per-profile Docker infrastructure — Dockerfile, compose file, setup script, agent `.md` templates |
| `shared/security/` | Security overlay — Squid proxy config, compose security overlay (network isolation, resource limits) |
| `shared/hooks/` | Copilot CLI audit hooks (session logging) |
| `shared/agent-includes/` | Shared include files for agent templates (JIRA API, ADO API references, prompt security) |
| `shared/mcp-servers/` | MCP server manifests and custom server code (one subdirectory per server) |
| `ralph-dashboard/` | Next.js status dashboard (Vercel + Upstash Redis) — multi-agent, auto-refreshing |
| `dashboard-local/` | Local development dashboard (Vite + React) |
| `tests/` | Vitest test suite |
| `scripts/` | Utility scripts (reset test env, validate config) |

## Commands

- `npm run dev` — Run in development mode (tsx)
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled output
- `npm test` — Run tests (vitest)
- `npm run lint` — Type-check without emitting (src + tests)

## Docker & Security

Containers are managed via `docker compose` with a **three-file merge** pattern:
1. **Base compose** — `profiles/<id>/docker-compose.yml` (services, volumes, build config)
2. **Security overlay** — `shared/security/docker-compose.security.yml` (proxy sidecar, network isolation, resource limits)
3. **Resources overlay** — `profiles/<id>/.build/docker-compose.overlay.yml` (MCP sidecar service, URL-only MCP config, resource file mounts — auto-generated at startup)

`ComposeClient` automatically injects all files: `docker compose -f base.yml -f security.yml -f overlay.yml <command>`. The overlay is only included if it exists (profiles with no MCP servers or resources skip it).

### Network Isolation

Agent containers run on an **internal-only Docker network** (`internal: true`) with no direct internet access. All HTTP/HTTPS traffic is routed through a **Squid forward proxy sidecar** that enforces a domain allowlist (`shared/security/squid.conf`).

```
Agent container (internal network only) → Squid proxy → allowlisted domains only
```

Even if the agent unsets `HTTPS_PROXY` env vars, direct egress fails — there's no route from the internal network to the internet. The proxy is the only bridge.

### Container Hardening

- **No Docker socket** — removed from all compose files (was vestigial from devcontainer migration)
- **No Docker CLI** — removed from Dockerfiles
- **No sudo** — disabled for vscode user (`/etc/sudoers.d/vscode` removed)
- **`cap_drop: ALL`** — all Linux capabilities dropped
- **`no-new-privileges: true`** — prevents privilege escalation via setuid
- **Resource limits** — memory (8G), CPU (4), PIDs (500)
- **User-writable npm prefix** — `~/.npm-global` allows `npm install -g` without root
- **Proxy log collection** — Squid access logs collected per task for allowlist tuning

The allowlist (`shared/security/squid.conf`) is tuned to the specific domains the agent needs (LLM backends, JIRA, ADO, npm, rubygems, etc.).

### Compose Commands

```bash
# ComposeClient handles the three-file merge automatically. Manual equivalent:
docker compose -f profiles/ralph-docs/docker-compose.yml \
  -f shared/security/docker-compose.security.yml \
  -f profiles/ralph-docs/.build/docker-compose.overlay.yml up -d --build

# Exec inside container
docker compose -f ... exec --user vscode app <command>

# Teardown
docker compose -f ... down --volumes --remove-orphans
```

No piping to `head` or `tail` — always show full output.

## Configuration

- `config.json` — Global settings (JIRA connection, polling interval, output paths, dashboard toggle)
- `profiles/*/profile.json` — Per-profile config with agent variants, repo path, CLI preference, and match rules
- `.env` — Secrets (JIRA token/email, GitHub PAT, Anthropic API key, ADO PATs, dashboard URL/secret)
- See `CONFIGURATION.md` for the full configuration reference

### Agent Profiles

Each profile directory under `profiles/` contains a `profile.json` that maps JIRA issues to a repo and agent configuration. Profiles are auto-discovered at startup.

The `agentName` field on `AgentProfile` stores the raw CLI name (e.g. `ralph.ralph`). The `displayName` field strips the `ralph.` prefix for use in JIRA comments and logs.

## Profile Infrastructure

All Docker and agent infrastructure is centralized in the orchestrator repo. Target repos contain no Ralph-specific files.

```
profiles/
  <profile-id>/
    profile.json        — Profile config: repo, cli, variants, MCP servers, resources
    Dockerfile          — Container image definition
    docker-compose.yml  — Base compose (services, env vars, volume mounts)
    setup.sh            — Post-create setup (AI CLI installs, git config, deps)
    resources/          — Profile-specific files mounted read-only into container
    .build/             — Generated at startup (gitignored):
                            resolved agent files, mcp-config.json,
                            gateway.json, docker-compose.overlay.yml, squid.conf
    agents/             — Agent template files (.agent.md with include markers)
shared/
  security/             — Container security infrastructure
    docker-compose.security.yml — Squid sidecar, network isolation, resource limits
    squid.conf          — Domain allowlist for egress proxy
  hooks/                — Copilot CLI audit hooks (shared across all profiles)
  agent-includes/       — Shared partial files for agent templates
  mcp-servers/          — MCP server manifests + custom server code
    <name>/
      mcp-server.json   — Server manifest (type, command, args, env, sidecarPort, domains)
      src/ dist/         — Custom server source/bundle (type: "custom" only)
  mcp-sidecar/          — MCP sidecar container (gateway process manager + Dockerfile)
```

Agent templates use `<!-- include: name.md -->` markers resolved from `shared/agent-includes/` at startup. Resolved files go to `.build/` and are mounted read-only into containers.

Compose files use `TARGET_REPO_PATH`, `SHARED_HOOKS_PATH`, and `SQUID_CONF_PATH` (injected by ComposeClient) for volume mounts. MCP server code and secrets are mounted only into the `mcp-sidecar` container — the agent container receives URL-only MCP config.

### MCP Least-Privilege

Each profile declares exactly which MCP servers it needs via `mcpServers` in `profile.json`. This enforces least-privilege at three levels:
- **Tool level** — the agent only sees tools from declared servers. A profile with `["playwright"]` has no JIRA or ADO tools.
- **Network level** — each profile's squid config is generated from the baseline + `proxyDomains` of declared servers. Undeclared server domains are blocked.
- **Process level** — each profile's `gateway.json` contains only its declared servers. The sidecar never starts servers the profile doesn't need.
- **Credential level** — MCP secrets are embedded in `gateway.json` inside the sidecar container. The agent container has no access to MCP server code or credentials.

## JIRA Integration

- Projects: **DF**, **DOC**
- JQL filter: auto-generated from profile match rules, results deduplicated by issue key, auto-paginated
- **Comment-triggered:** The poller discovers issues via JQL, then scans comments for `commentTrigger` matches. Unconsumed triggers are planned in the operation ledger.
- On trigger discovery: posts an ack comment ("🤖 Got it! Queueing [agent]...")
- On pickup: applies `beforeAgent` transition + runs the agent
- On completion: applies `afterAgent` transition; Ralph posts a completion comment + attaches the handoff file
- On error: orchestrator posts an error comment; records error in the ledger
- Auth: Basic (`email:apiToken`)
- API base: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`

### Operation Ledger

Persistent per-issue operation history (`output/logs/history/<issueKey>.json`):

```
pending → active → completed | error
              ↗
rejected (invalid state, conflict, preflight fail)
```

- Comment-trigger dedup — each trigger comment consumed exactly once per variant
- Crash recovery — `active` operations from previous sessions marked as `error` on startup
- Pending operations survive restart

## Log Collection

The `ContainerLogCollector` (`src/container/log-collector.ts`) manages per-task log collection from both the `app` and sidecar containers. Log sources are registered with a capture mode (stream or collect) and flushed to disk after execution.

Each task gets its own timestamped directory under `output/logs/<key>-<startTs>/`. After each task, the orchestrator collects:
- `<key>-<ts>-audit.jsonl` — Audit trail from hooks
- `<key>-<ts>-transcript.md` — Copilot CLI session transcript (via `--share`)
- `<key>-<ts>-tool-output.log` — Untruncated tool output from hooks
- `<key>-<ts>-proxy.log` — Squid access log (allowed/denied domains)
- `<key>-<ts>-sidecar.log` — MCP sidecar gateway output (server startup, errors)
- `<key>-<ts>-summary.json` — Execution metadata
- `<key>-<ts>.log` — Per-task streaming log (real-time container output)
- `activity-YYYY-MM-DD.log` — Persistent daily activity log
- `history/<issueKey>.json` — Operation ledger

Session transcripts are also attached to the JIRA issue. Proxy logs are collected even on error (for allowlist debugging).

## Conventions

- ESM-only (`"type": "module"` in package.json)
- All imports use `.js` extensions (NodeNext module resolution)
- No JIRA SDK — native `fetch` against REST API v3
- `execa` v9 for all subprocess management
- Tests use `vitest` in `tests/` directory
- All components accept a `Logger` interface for centralized log routing
- Copilot CLI: `--config-dir /workspace/.ralph`, `--allow-all-tools`, `--allow-all-paths`, `--share <transcript>`, `--model claude-opus-4.6` (configurable)
- Claude Code CLI: `-p <prompt>`, `--dangerously-skip-permissions`, `--mcp-config /workspace/.ralph/mcp-config.json`, `--strict-mcp-config`
- Both CLIs share the same `mcp-config.json` (generated at startup from profile `mcpServers` declarations)
- NEVER REEXPORT, update original imports instead

### Dependency Interfaces

Every service class injected via `OrchestratorDeps` has a corresponding `I`-prefixed interface defined in the same file (e.g., `IJiraClient` alongside `JiraClient` in `src/jira/client.ts`). The class `implements` the interface, and all consumers depend on the interface — never the class.

Only the **factory** (`orchestrator-factory.ts`) imports concrete classes for instantiation. This ensures `Mocked<Interface>` is structurally compatible without `as any` casts. See `DEPENDENCY-INJECTION.md` for rationale.

### Comments

- Only add comments that explain **why** something works a certain way, or document non-obvious behavior and edge cases.
- Never add comments that restate what the code already says.
- Never add comments about previous behavior or changelog-style notes.
- Section-separator comments are unnecessary when the code structure is self-evident.
- JSDoc on public interfaces, types, classes, and methods is encouraged.

## Agent Workflow Rules

**After completing any task, always use `ask_questions` to prompt for the next task.** See `.github/copilot-agent-instructions.md` for details. This is mandatory — never end a turn without it.
