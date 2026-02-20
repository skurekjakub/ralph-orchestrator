# Ralph Orchestrator — Architecture

## System Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It bridges JIRA (task management) with a security-hardened container-based AI agent system (execution), supporting both GitHub Copilot CLI and Claude Code CLI.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RALPH ORCHESTRATOR                         │
│                      (this repo — Node.js app)                     │
│                                                                    │
│  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │  JIRA    │─▶│ Trigger │─▶│ Operation│─▶│   Task Runner     │   │
│  │  Poller  │  │ Scanner │  │  Ledger  │  └────────┬──────────┘   │
│  └──────────┘  └─────────┘  └──────────┘           │              │
│       │                                    ┌───────┴───────┐      │
│       │                                    │ CLI Selection  │      │
│  ┌──────────┐                       ┌──────┴──┐ ┌──┴──────┐       │
│  │  JIRA    │                       │ Copilot │ │  Claude │       │
│  │  Client  │                       │Executor │ │Executor │       │
│  └──────────┘                       └────┬────┘ └───┬─────┘       │
│       │                                  └────┬─────┘             │
│       │                                       ▼                   │
│  ┌──────────┐     ┌────────────────────────────────────────────┐  │
│  │Heartbeat │     │           DOCKER CONTAINERS                │  │
│  │ Sender   │──▶  │                                            │  │
│  └──────────┘     │  ┌──────────────┐  ┌────────────────────┐  │  │
│       │      Dash │  │  App (agent)  │  │   MCP Sidecar      │  │  │
│       │           │  │  internal net │──│   gateway.ts        │  │  │
│       │           │  │  cap_drop:ALL │  │   MCP HTTP servers  │  │  │
│       │           │  │  no-sudo      │  │   isolated secrets  │  │  │
│       │           │  └──────────────┘  └────────────────────┘  │  │
│       │           │                    ┌────────────────────┐  │  │
│       │           │                    │  Egress Proxy       │  │  │
│       │           │                    │  (Squid sidecar)    │  │  │
│       │           │                    │  domain allowlist   │  │  │
│       │           │                    └────────────────────┘  │  │
│       │           └────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    INK TERMINAL DASHBOARD                    │  │
│  │  StatusPanel │ QueuePanel │ HistoryPanel │ LogPanel          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. JIRA Cloud ──(JQL poll)──▶ Poller ──▶ Trigger Scanner ──▶ Operation Ledger
2. Ledger ──(next pending)──▶ Orchestrator ──(profile lookup)──▶ Profile selected
3. Orchestrator ──(transition + ack comment)──▶ JIRA Cloud
4. TaskRunner ──(docker compose up -d --build)──▶ Docker (app + sidecar + proxy)
5. TaskRunner ──(docker compose exec <cli>)──▶ Agent container
6. Agent ──(MCP tools via HTTP)──▶ MCP Sidecar ──(JIRA/ADO REST)──▶ External APIs
7. Agent ──(git push)──▶ ADO Git (via Squid proxy)
8. Agent ──(MCP: create PR, comment, attach handoff)──▶ MCP Sidecar ──▶ JIRA/ADO
9. Orchestrator ──(exec cat / compose logs)──▶ Collect logs from all containers
10. Orchestrator ──(save execution summary)──▶ output/logs/<key>-<startTs>/
11. Orchestrator ──(docker compose down --volumes --remove-orphans)──▶ Containers destroyed
12. Orchestrator ──▶ resume polling (back to step 1)
```

## Component Details

### AppStartup (`src/app-startup.ts`)

Pre-orchestrator startup pipeline. Runs before the main loop:
1. Validates prerequisites (env vars, config, Docker, profiles, security)
2. Loads and returns `AppConfig`
3. Resolves agent template includes (`shared/agent-includes/` → `.build/`)
4. Builds custom MCP servers (`npm run build`) and the MCP sidecar gateway
5. Generates per-profile MCP configs (`mcp-config.json`, `gateway.json`, compose overlay, squid.conf)

All profile infrastructure is fully prepared before the orchestrator is instantiated.

### JIRA Poller (`src/jira/poller.ts`)

- Runs on a configurable interval (default: 60s)
- Executes JQL queries auto-generated from profile match rules
- Deduplicates results by issue key across queries
- Fires immediately on start, then on interval
- Accepts a `Logger` for centralized log routing

### Operation Ledger (`src/services/operation-ledger.ts`)

- Persistent per-issue JSON files (`output/logs/history/<issueKey>.json`)
- Tracks every agent invocation through its lifecycle: `pending → active → completed | error | rejected`
- Comment-trigger dedup: each trigger comment is consumed exactly once per variant
- Crash recovery: on startup, `active` operations from previous sessions are marked as `error`
- Pending operations survive restarts — persisted on disk and resumed after recovery

### JIRA Client (`src/jira/client.ts`)

- Native `fetch` against JIRA REST API v3 (cloud endpoint)
- Basic auth: `base64(email:apiToken)`
- API base: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`
- Endpoints: `search/jql`, `issue/{key}`, `issue/{key}/comment`, `issue/{key}/transitions`
- `searchIssues()` auto-paginates using `nextPageToken` (100 per page) to fetch all matching issues
- No SDK dependency

### Container Manager (`src/container/manager.ts`)

Orchestrates the full container lifecycle for a single task: build → setup → execute agent → collect logs → teardown.

- **ComposeClient** — Low-level `docker compose` wrapper. Handles the three-file merge and injects process environment (secrets, JIRA config, host paths).
- **CopilotExecutor / ClaudeCodeExecutor** — CLI-specific command builders. Copilot uses `--config-dir`, `--agent`, `--share` (transcript export); Claude uses `--mcp-config`, `--strict-mcp-config`.
- **ContainerLogCollector** — Per-task log collection from `app` and sidecar containers via streaming (`tail -f`), batch (`exec cat`), or compose logs (for stdout-based services like the MCP gateway).
- **StreamCapture** — Line-buffered streaming for child processes, piped to the logger with tag prefixes.

**Prompt construction:** Before CLI execution, the prompt is built via the `PromptBuilder`, which normalizes untrusted JIRA content (stripping invisible characters, hidden HTML comments, non-standard whitespace) and wraps it in `BEGIN/END UNTRUSTED JIRA DATA` delimiters. The assembled prompt is passed through the prompt injection auditor.

**CLI selection:** Based on the profile's `cli` preference (`"copilot"` or `"claude"`). Falls back to the other CLI if the preferred one's credential is missing.

### Orchestrator (`src/orchestrator.ts`)

Main loop: poll → scan triggers → execute pending operations → repeat.

**Dependency injection:** The `createOrchestratorDeps()` factory builds all service instances from config. The orchestrator constructor receives an `OrchestratorDeps` bag — services can be replaced with mocks in tests.

**Trigger scanning:** The `TriggerScanner` service scans polled issues for `commentTrigger` matches. For each issue, it fetches comments once (shared across profiles), checks each profile's trigger string, and plans unconsumed triggers as pending operations in the ledger. An ack comment is posted for each new trigger.

The scanner caches each issue's `updated` timestamp between cycles. If an issue hasn't been updated since the last scan, comment fetching is skipped entirely — reducing API calls from N (all matching issues) to only those with new activity.

**Processing a single operation:** Resolve profile → re-fetch issue → validate status match → preflight checks → delegate to `TaskRunner`. The task runner transitions JIRA (beforeAgent) → start containers → clean audit logs → register log sources → run setup → fetch comments/handoff context → execute agent → collect logs + transcript → save summary → attach transcript to JIRA → return result. The orchestrator records the result in the ledger and transitions JIRA (afterAgent) on success. Fatal errors (container start/setup) abort immediately. Non-critical failures (log collection, JIRA attachment) are logged but don't block the pipeline.

**State observation:** The `OrchestratorObserver` builds state snapshots and heartbeat payloads from live orchestrator data. The Ink dashboard subscribes to it directly (`orchestrator.observer`). This separation keeps state aggregation out of the main orchestration loop.

### Log Collection

**Container Log Collector** (`src/container/log-collector.ts`) manages per-task log collection from `app` and sidecar containers. Each source is registered with a capture mode (stream for real-time, collect for post-execution). Each task gets its own timestamped directory (`output/logs/<key>-<startTs>/`), with files named `<key>-<startTs>-<collectTs>-<sourceId>.<ext>`.

Sidecar logs (gateway startup, MCP server output) are collected via `docker compose logs` since the gateway writes to stdout rather than a file. The collector's `useComposeLogs` flag routes collection through the compose logs command instead of `exec cat`.

**Log Collector** (`src/logs/collector.ts`) saves execution metadata as `<key>-<startTs>-<ts>-summary.json` inside the task's timestamped directory.

Per-task outputs: audit trail (`.jsonl`), session transcript (`.md`), tool output (`.log`), proxy access log (`.log`), sidecar log (`.log`), execution summary (`.json`), streaming log (`.log`). Proxy and sidecar logs are collected even on error for debugging. A persistent daily activity log (`activity-YYYY-MM-DD.log`) and container output log (`container-YYYY-MM-DD.log`) are also maintained.

### Status Dashboard (`ralph-dashboard/`)

Separate Next.js app deployed to Vercel. See [ralph-dashboard/README.md](ralph-dashboard/README.md) for full details.

- Receives heartbeats from one or more orchestrator instances
- Stores per-agent state in Upstash Redis (via Vercel Marketplace integration) with 24h TTL
- Dashboard UI auto-refreshes every 15s, rendering one card per connected agent
- Authentication: shared-secret bearer token (`DASHBOARD_SECRET`)

### Ink Dashboard (`src/dashboard/*.tsx`)

| Panel | Purpose |
|---|---|
| `StatusPanel` | Current status (IDLE/WORKING/STOPPING) with animated spinner, current issue, elapsed time |
| `QueuePanel` | Issues waiting to be processed |
| `HistoryPanel` | Completed tasks with status icons and duration |
| `LogPanel` | Scrolling activity log (15 lines) with timestamps and color-coded levels |

## Profile Infrastructure

All Docker, agent, and hook infrastructure is centralized in the orchestrator repo. Target repos contain no Ralph-specific files.

```
<orchestrator-repo>/
├── profiles/
│   ├── ralph-docs/
│   │   ├── profile.json                 # Profile config: repo, cli, variants, MCP servers, resources
│   │   ├── Dockerfile                   # Container image (Ruby, Node, .NET, etc.)
│   │   ├── docker-compose.yml           # Base compose: services, volumes, env vars
│   │   ├── setup.sh                     # Post-create setup (CLI installs, git config)
│   │   ├── resources/                   # Profile-specific files mounted read-only into container
│   │   ├── .build/                      # Generated at startup (gitignored):
│   │   │                                #   resolved agent files, mcp-config.json,
│   │   │                                #   gateway.json, docker-compose.overlay.yml, squid.conf
│   │   └── agents/
│   │       ├── ralph.ralph.agent.md     # Meta-agent template (with include markers)
│   │       ├── ralph.ralph-researcher.agent.md  # Research sub-agent (docs + source code)
│   │       ├── ralph.reviewer.agent.md
│   │       └── ralph.malph.agent.md     # Review agent template (observer)
│   └── ralph-vscode/
│       ├── profile.json
│       ├── Dockerfile
│       ├── docker-compose.yml
│       ├── setup.sh
│       ├── resources/
│       └── agents/
│           ├── ralph.ralph.agent.md
│           ├── ralph.ralph-analyst.agent.md  # Analysis sub-agent (read-only, Sonnet)
│           └── ralph.malph.agent.md     # Review agent template (observer)
├── shared/
│   ├── security/                        # Container security infrastructure
│   │   ├── docker-compose.security.yml  # Squid sidecar, network isolation, resource limits
│   │   └── squid.conf                   # Domain allowlist for egress proxy
│   ├── hooks/                           # Copilot CLI audit hooks (shared)
│   │   ├── log-*.sh                     # Hook scripts for session logging
│   │   └── ralph-audit.json             # Hook configuration
│   ├── agent-includes/                  # Shared partial files for agent templates
│   │   ├── jira-api.md                  # JIRA MCP tool reference + wiki markup
│   │   ├── ado-api.md                   # ADO MCP tool reference (PR creation, threads, replies)
│   │   ├── ado-pr-format.md             # PR description template
│   │   └── prompt-security.md           # Prompt injection defense instructions for agents
│   └── mcp-servers/                     # MCP server manifests + custom server code
│       ├── ado/                         # Azure DevOps MCP server (npm)
│       ├── jira-kentico/                # JIRA Cloud MCP server (custom, Kentico instance)
│       ├── discord-hitl/                # Discord HITL server (custom, esbuild bundle)
│       └── playwright/                  # Playwright MCP server (npm)
├── shared/mcp-sidecar/                  # MCP sidecar container (gateway process manager)
│   ├── Dockerfile                       # Sidecar image (node:22-slim, supergateway, mcp packages)
│   ├── src/gateway.ts                   # Gateway: spawns MCP servers, /health endpoint
│   └── package.json
```

Agent template files use `<!-- include: name.md -->` markers. At startup, `resolveAllProfileIncludes()` resolves markers from `shared/agent-includes/` into `profiles/<id>/.build/`. Compose files mount from `.build/` — the templates are the source of truth.

**Three-file compose merge:** `ComposeClient` merges up to three compose files for every command: base (`profiles/<id>/docker-compose.yml`), security overlay (`shared/security/docker-compose.security.yml`), and optionally the resources overlay (`profiles/<id>/.build/docker-compose.overlay.yml`). The security overlay adds the Squid egress proxy sidecar, network isolation, proxy env vars, and resource limits. The resources overlay adds the MCP sidecar service (with server code, gateway config, and secrets isolated from the agent), URL-only MCP config for the agent, and resource file mounts. Profiles with no MCP servers or resources skip the overlay.

Currently configured target repos:
- `kentico-docs-jekyll` — Documentation portal (profile: `ralph-docs`)
- `kentico-docs-autocomplete-vscode` — VS Code extension (profile: `ralph-vscode`)

### Agent Phases (inside container)

1. **Setup** — Parse JIRA issue, `git checkout master && git pull`, create branch
2. **Research** — Delegate to researcher sub-agent (explores docs + Xperience source code)
3. **Write** — Meta-agent implements documentation changes directly
4. **Build** — Validate with `npm run build`
5. **Review** — Delegate to reviewer sub-agent
5. **Revise** — Apply reviewer feedback (up to 2 cycles)
6. **PR** — Push branch and create ADO pull request via REST API
7. **Handoff** — Write handoff.md, attach to JIRA, post completion comment
8. **Exit** — Output structured result block for orchestrator to parse

### JIRA Communication (inside container)

Ralph communicates with JIRA via MCP tools (`jira_add_comment`, `jira_add_attachment`) provided by the `jira-kentico` MCP server:
- Posts completion comment with status, branch, PR URL, summary
- Attaches `handoff.md` to the JIRA issue
- The MCP server handles authentication internally (Basic auth via JIRA_PAT/JIRA_EMAIL env vars)

## Configuration

See [CONFIGURATION.md](CONFIGURATION.md) for the full reference.

- **`config.json`** — Global settings: JIRA connection, polling interval, output paths, dashboard toggle, prompt audit mode.
- **`profiles/<id>/profile.json`** — Per-profile config: target repo, CLI preference, model, timeout, JIRA transitions, MCP servers, resources, and variant match rules.
- **`.env`** — Secrets: JIRA PAT/email, GitHub PAT, Anthropic API key, ADO PATs, dashboard URL/secret.

**Variant matching:** Each variant declares `match.projects`, `match.statuses`, `match.commentTrigger`, and optionally `match.revisionStatuses`. Variants are evaluated across all profiles; all matching triggers are planned. Agent names must match `.agent.md` files in the profile's `agents/` directory.

## Security

### Threat Model

Prompt injection causes the agent to execute arbitrary commands. Everything inside the container (workspace, local files) is considered expendable and recoverable. External interactions (network exfiltration, lateral API access, host compromise) must be prevented.

### Network Isolation

Agent containers run on an **internal-only Docker network** (`internal: true`) with no direct internet access. All HTTP/HTTPS traffic is routed through a **Squid forward proxy sidecar** that enforces a domain allowlist.

```
Agent container (internal network only) → Squid proxy → allowlisted domains only
```

Even if the agent unsets `HTTPS_PROXY` env vars, direct egress fails — there's no route from the internal network to the internet. The proxy is the only bridge.

The allowlist (`shared/security/squid.conf`) is tuned per the agent's needs: LLM backends (GitHub Copilot, Anthropic), JIRA, Azure DevOps, package registries (npm, rubygems, pypi, nuget), and documentation sites. Squid access logs are collected per task for allowlist tuning — both allowed and denied requests are logged.

### Container Hardening

| Control | Implementation |
|---|---|
| No Docker socket | Removed from all compose files |
| No Docker CLI | Removed from Dockerfiles |
| No sudo | `/etc/sudoers.d/vscode` removed, vscode entry deleted from `/etc/sudoers` |
| Capability drop | `cap_drop: ALL` — all Linux capabilities dropped. `cap_add: DAC_OVERRIDE, CHOWN` re-added for Docker volume cleanup (to be revised). |
| Privilege escalation | `no-new-privileges: true` — prevents setuid/setgid |
| Resource limits | Memory: 8G, CPU: 4, PIDs: 500 |
| npm without root | User-writable npm prefix (`~/.npm-global`) — no sudo needed for `npm install -g` |

### Compose Security Overlay

The security overlay (`shared/security/docker-compose.security.yml`) is merged with each profile's base compose file. It adds the `egress-proxy` sidecar (Squid), `ralph-internal` network (`internal: true`), `ralph-external` network, proxy env vars, `cap_drop: ALL`, `no-new-privileges`, and resource limits. See [SECURITY.md](SECURITY.md) for details.

### MCP Config System (`src/container/setup/`)

Each profile declares MCP servers in `profile.json` (`mcpServers` array). At startup, `resolveAllProfileSetup()` resolves server names to manifests in `shared/mcp-servers/<name>/mcp-server.json` and generates several files per profile in `.build/`:

1. **`mcp-config.json`** — URL-based config shared by both CLIs. Contains only `{ type, url }` entries — no secrets. Copilot reads it via `--config-dir`; Claude Code via `--mcp-config --strict-mcp-config`.
2. **`gateway.json`** — Per-profile sidecar config with server commands, args, ports, and embedded secrets. The sidecar only starts servers the profile declares — a profile with `["jira-kentico", "ado"]` never spawns `discord-hitl`.
3. **`docker-compose.overlay.yml`** — Injects base env vars (`GH_TOKEN`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_DISABLE_*`). Defines the `mcp-sidecar` service (when MCP servers are declared), mounts `mcp-config.json`, Copilot CLI config, and resource files.
4. **`squid.conf`** — Profile-specific proxy config (baseline + MCP proxy domains).
5. **`copilot-config.json`** — Copilot CLI config with `allowed_urls` derived from squid domains + path restrictions from MCP server manifests.

The setup modules are split by responsibility: `mcp-manifest.ts` (types/loading), `mcp-config.ts` (CLI config), `compose-overlay.ts` (overlay generation), `squid-config.ts` (proxy config), `profile-setup.ts` (orchestrator).

Server types: `npm` (pre-installed packages, bridged to HTTP via supergateway) and `custom` (locally built, bundled to `dist/`). See [MCP.md](MCP.md) for the full MCP reference.

### Runtime URL Enforcement

Domain-level proxy filtering (Squid) is augmented with URL **path** restrictions to prevent cross-org API abuse via injected credentials:

1. **Copilot CLI URL allowlist** (`copilot-config.json`) — restricts CLI-level URL access to path-scoped patterns (e.g., `https://dev.azure.com/MyOrg/*`).
2. **Pre-tool hook audit logging** (`shared/hooks/log-pre-tool.sh`) — logs every tool invocation to `pre-tool.log` (JSONL, streamed to host in real-time) for observability.

Path restrictions are auto-derived from MCP server manifests at startup (`src/container/setup/url-restrictions.ts`). See [SECURITY.md](SECURITY.md) for the full threat model and defense layering.

## Design Decisions

1. **One task at a time** — Sequential processing avoids container conflicts and simplifies state management.
2. **Fresh container per task** — Clean state prevents leakage between tasks. Trade-off: ~2-5 min container startup.
11. **Profile variants** — Each profile can have multiple variants with different agent names and match rules, sharing the same Docker infrastructure. Variants are "exploded" into flat `AgentProfile[]` at load time.
14. **Centralized infrastructure** — All Docker, agent, and hook files live in the orchestrator repo under `profiles/` and `shared/`. Target repos contain no Ralph-specific files. Compose files use overlay file mounts to inject agent definitions into containers without modifying the host repo.
15. **Session transcripts** — Copilot CLI's `--share` flag exports a full session transcript (conversation, tool calls, reasoning). The orchestrator collects it from the container and attaches it to the JIRA issue for auditability.
16. **Per-task streaming logs** — Each task gets its own log file written in real-time (container output only). If the agent crashes mid-run, partial output is immediately available without parsing the daily aggregate.
17. **Network-level isolation over env var trust** — The `internal: true` Docker network prevents direct egress even if the agent unsets proxy env vars. This is enforcement, not convention.
18. **Security overlay separation** — The Squid proxy, network isolation, and resource limits are in a separate compose file merged at runtime. This keeps security concerns out of the base compose and allows easy toggling for debugging.
19. **Shared MCP config** — Both Copilot CLI and Claude Code CLI use the same `mcp-config.json` format. One generated file serves both, avoiding format divergence.
20. **MCP least-privilege** — Each profile declares only the MCP servers it needs (`mcpServers` array). The agent only sees the tools from those servers — a profile with `["playwright"]` has no JIRA or ADO tools. Per-profile `gateway.json` ensures the sidecar only starts declared servers. Per-profile squid configs restrict egress to only the domains required. This enforces least-privilege at tool, process, network, and credential levels.

