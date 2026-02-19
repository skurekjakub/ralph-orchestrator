# Ralph Orchestrator — Architecture

## System Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It bridges JIRA (task management) with a security-hardened container-based AI agent system (execution), supporting both GitHub Copilot CLI and Claude Code CLI.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RALPH ORCHESTRATOR                         │
│                      (this repo — Node.js app)                     │
│                                                                    │
│  ┌──────────┐    ┌──────────┐    ┌───────────────┐    ┌─────────┐  │
│  │  JIRA    │───▶│ Operation│───▶│  Container    │───▶│  Log   │  │
│  │  Poller  │    │  Ledger  │    │  Manager      │    │Collector│  │
│  └──────────┘    └──────────┘    └───────┬───────┘    └─────────┘  │
│       │                                  │                         │
│       │                          ┌───────┴───────┐                 │
│       │                          │ CLI Selection  │                 │
│       │                          └───┬───────┬───┘                 │
│  ┌──────────┐              ┌─────┴──┐ ┌──┴──────┐                  │
│  │  JIRA    │              │Copilot │ │ Claude  │                  │
│  │  Client  │              │Executor│ │Executor │                  │
│  └──────────┘              └────┬───┘ └───┬─────┘                  │
│       │                         └────┬────┘                        │
│       │                              ▼                             │
│  ┌──────────┐     ┌─────────────────────────────────────────┐      │
│  │Heartbeat │     │          DOCKER CONTAINERS              │      │
│  │ Sender   │──▶  │  ┌──────────────┐  ┌────────────────┐  │      │
│  └──────────┘     │  │  App (agent)  │  │ Egress Proxy   │  │      │
│       │      Dash │  │  internal net │──│ (Squid sidecar)│  │      │
│       │           │  │  cap_drop:ALL │  │ domain allowl. │  │      │
│       │           │  │  no-sudo      │  │ access logging │  │      │
│       │           │  └──────────────┘  └────────────────┘  │      │
│       │           └─────────────────────────────────────────┘      │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    INK TERMINAL DASHBOARD                    │  │
│  │  StatusPanel │ QueuePanel │ HistoryPanel │ LogPanel          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. JIRA Cloud ──(JQL poll)──▶ Poller ──▶ Comment scan ──▶ Operation Ledger
2. Ledger ──(next pending)──▶ Orchestrator ──(profile match)──▶ Profile selected
3. Orchestrator ──(transition + comment)──▶ JIRA Cloud
4. Orchestrator ──(docker compose up -d --build)──▶ Docker
5. Orchestrator ──(docker compose exec <cli>)──▶ Container
6. Ralph (inside) ──(git pull, branch, write, review)──▶ ADO Git
7. Ralph (inside) ──(REST API: create PR)──▶ Azure DevOps
8. Ralph (inside) ──(REST: comment + attach handoff)──▶ JIRA Cloud
9. Orchestrator ──(docker compose exec cat)──▶ audit.jsonl ──▶ output/logs/
10. Orchestrator ──(save CLI output)──▶ output/logs/<key>-<ts>-copilot.log
11. Orchestrator ──(docker compose down --volumes --remove-orphans)──▶ Container destroyed
12. Orchestrator ──▶ resume polling (back to step 1)
```

## Component Details

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

Orchestrates the full container lifecycle, delegating to specialized components:

- **ComposeClient** (`src/container/compose-client.ts`) — Low-level `docker compose` wrapper. Accepts multiple compose files (base + security overlay + resources overlay) and builds `-f file1 -f file2 -f file3` args for every command. Injects process environment (all secrets, JIRA config, `TARGET_REPO_PATH`, `SHARED_HOOKS_PATH`, `SQUID_CONF_PATH`).
- **CopilotExecutor** (`src/container/cli-executors/copilot-executor.ts`) — Executes `copilot --config-dir /workspace/.ralph --agent <name> --model <model> --experimental --yolo --share <path> -p <prompt>` inside the container. The `--share` flag exports a full session transcript. The `--config-dir` flag points to the orchestrator-managed config directory (MCP config, logs).
- **ClaudeCodeExecutor** (`src/container/cli-executors/claude-code-executor.ts`) — Executes `claude -p <prompt> --dangerously-skip-permissions --mcp-config /workspace/.ralph/mcp-config.json --strict-mcp-config [--model <model>]` inside the container. The `--strict-mcp-config` flag ensures only orchestrator-managed MCP servers are used.
- **ContainerLogCollector** (`src/container/log-collector.ts`) — Per-task log collection from both `app` and sidecar containers (egress-proxy). Supports streaming (`tail -f`) and batch collection (`cat`) modes. Collects audit logs, session transcripts, tool output, and proxy access logs.
- **StreamCapture** (`src/container/stream-capture.ts`) — Shared line-buffered streaming capture for child processes. Used by both executors and container build/setup to pipe stdout/stderr to the logger with a tag prefix (e.g. `[copilot]`, `[build]`).

**Prompt construction & auditing:** Before CLI execution, `execute()` builds the prompt via `buildPromptWithSections()` (`src/prompt/prompt.ts`), which normalizes untrusted JIRA content (stripping invisible characters, hidden HTML comments, non-standard whitespace) and wraps it in `--- BEGIN/END UNTRUSTED JIRA DATA ---` delimiters. The assembled prompt and its labelled sections are then passed through the prompt injection auditor (`src/prompt/prompt-auditor.ts`), which scans for common injection patterns based on the configured `promptAudit.mode` (see CONFIGURATION.md).

**CLI selection:** The manager picks the executor based on the profile's `cli` preference (`"copilot"` or `"claude"`, default: `"copilot"`). If the preferred CLI's credential is missing (`GH_TOKEN` for Copilot, `ANTHROPIC_API_KEY` for Claude), it falls back to the other. If neither credential is available, it throws.

| Method | Action |
|---|---|
| `start()` | `docker compose up -d --build` + setup script (both streamed) |
| `execute()` | Runs the selected CLI agent, parses result block |
| `registerLogSources()` | Registers all log sources (audit, transcript, tool-output, proxy) and starts streaming |
| `cleanLogs()` | `docker compose exec rm -rf` the audit log dir |
| `stop()` | Detaches log streams, `docker compose down --volumes --remove-orphans` |

Env vars are injected into the compose process environment (not via `-e` flags):
`GH_TOKEN`, `ADO_PAT_DOCS`, `ADO_MCP_AUTH_TOKEN`, `ADO_PAT_XPERIENCE`, `JIRA_PAT`, `JIRA_EMAIL`, `JIRA_BASE_URL`, `JIRA_CLOUD_ID`, `ANTHROPIC_API_KEY`, `TARGET_REPO_PATH`, `SHARED_HOOKS_PATH`, `SQUID_CONF_PATH`

### Orchestrator (`src/orchestrator.ts`)

Main loop: poll → scan triggers → execute pending operations → repeat.

**Dependency injection:** The `createOrchestratorDeps()` factory builds all service instances from config. The orchestrator constructor receives an `OrchestratorDeps` bag — services can be replaced with mocks in tests.

**Trigger scanning:** The `TriggerScanner` service scans polled issues for `commentTrigger` matches. For each issue, it fetches comments once (shared across profiles), checks each profile's trigger string, and plans unconsumed triggers as pending operations in the ledger. An ack comment is posted for each new trigger.

The scanner caches each issue's `updated` timestamp between cycles. If an issue hasn't been updated since the last scan, comment fetching is skipped entirely — reducing API calls from N (all matching issues) to only those with new activity.

**Processing a single operation:**

| Step | Action | Error handling |
|---|---|---|
| 1 | Re-validate issue status against profile | Reject if status changed since planning |
| 2 | Run preflight checks (if configured) | Reject with reason if check fails |
| 3 | Select CLI (Copilot or Claude Code) based on profile + credentials | Falls back to other CLI; throws if neither available |
| 4 | Transition JIRA issue (beforeAgent) | Retry 3× with backoff, warn on failure |
| 5 | Start containers via docker compose (stream build progress) | Fatal — throws to catch block |
| 6 | Run setup script | Fatal |
| 7 | Execute agent CLI (stream output) | Captures exit code, timeout, stdout/stderr |
| 8 | Collect audit logs + transcript from container | Non-critical |
| 9 | Save execution summary | Non-critical |
| 10 | Attach session transcript to JIRA | Non-critical |
| 11 | Track completion in ledger + observer | Always |
| 12 | Stop container (finally) | Warn on failure, force-rm fallback |
| 13 | Transition (afterAgent) | Retry 3×, warn on failure |

**State observation:** The `OrchestratorObserver` builds state snapshots and heartbeat payloads from live orchestrator data. The Ink dashboard subscribes to it directly (`orchestrator.observer`). This separation keeps state aggregation out of the main orchestration loop.

### Log Collector (`src/logs/collector.ts`) + Container Log Collector (`src/container/log-collector.ts`)

**Container Log Collector** manages per-task log collection from both `app` and sidecar containers:
- Each log source (audit, transcript, tool-output, proxy) is registered with an ID, target service, container path, and capture mode
- **Stream mode** — starts `tail -f` during agent execution for real-time output (tool-output)
- **Collect mode** — reads file contents via `docker compose exec cat` after execution (audit, transcript, proxy)
- `collectAll()` flushes all sources to disk with consistent timestamps: `<key>-<ts>-<sourceId>.<ext>`
- Proxy logs are collected even on error (for allowlist debugging)

**Log Collector** saves execution metadata as `<key>-<timestamp>-summary.json`.

Output files per task:
- `<key>-<ts>-audit.jsonl` — Audit trail from hooks
- `<key>-<ts>-transcript.md` — Copilot CLI session transcript (via `--share`)
- `<key>-<ts>-tool-output.log` — Untruncated tool output from hooks
- `<key>-<ts>-proxy.log` — Squid proxy access log (allowed/denied domains)
- `<key>-<ts>-summary.json` — Execution metadata
- `<key>-<ts>.log` — Per-task streaming log (real-time container output)
- `activity-YYYY-MM-DD.log` — Persistent activity log (managed by ActivityLog)
- `container-YYYY-MM-DD.log` — Persistent container output log (managed by ActivityLog)

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
│   │   └── agents/
│   │       ├── ralph.ralph.agent.md     # Meta-agent template (with include markers)
│   │       ├── ralph.ralph-researcher.agent.md  # Research sub-agent (docs + source code)
│   │       ├── ralph.reviewer.agent.md
│   │       ├── ralph.malph.agent.md     # Review agent template (observer)
│   │       └── .build/                  # Generated at startup (gitignored):
│   │                                    #   resolved agent files, mcp-config.json,
│   │                                    #   docker-compose.overlay.yml
│   └── ralph-vscode/
│       ├── profile.json
│       ├── Dockerfile
│       ├── docker-compose.yml
│       ├── setup.sh
│       ├── resources/
│       └── agents/
│           ├── ralph.ralph.agent.md
│           ├── ralph.ralph-analyst.agent.md  # Analysis sub-agent (read-only, Sonnet)
│           ├── ralph.malph.agent.md     # Review agent template (observer)
│           └── .build/                  # Generated at startup (gitignored)
├── shared/
│   ├── security/                        # Container security infrastructure
│   │   ├── docker-compose.security.yml  # Squid sidecar, network isolation, resource limits
│   │   └── squid.conf                   # Domain allowlist for egress proxy
│   ├── hooks/                           # Copilot CLI audit hooks (shared)
│   │   ├── log-*.sh                     # Hook scripts for session logging
│   │   └── ralph-audit.json             # Hook configuration
│   ├── agent-includes/                  # Shared partial files for agent templates
│   │   ├── jira-api.md                  # JIRA v2 curl templates + wiki markup reference
│   │   ├── ado-api.md                   # ADO REST API patterns (PR creation, threads)
│   │   ├── ado-pr-format.md             # PR description template
│   │   └── prompt-security.md           # Prompt injection defense instructions for agents
│   └── mcp-servers/                     # MCP server manifests + custom server code
│       ├── ado/                         # Azure DevOps MCP server (npm)
│       ├── discord-hitl/                # Discord HITL server (custom, esbuild bundle)
│       └── playwright/                  # Playwright MCP server (npm)
```

Agent template files use `<!-- include: name.md -->` markers. At startup, `resolveAllProfileIncludes()` reads agent templates, replaces markers with content from `shared/agent-includes/`, and writes resolved files to `agents/.build/`. The `.build/` directory is wiped before each startup to prevent stale artifacts. Compose files mount from `.build/` — the templates are the source of truth.

Compose files use `TARGET_REPO_PATH`, `SHARED_HOOKS_PATH`, and `SQUID_CONF_PATH` (injected by ComposeClient) for volume mounts. Resolved agent files and hooks are overlay-mounted as individual read-only files, preserving non-Ralph agents in the target repo.

**Three-file compose merge:** `ComposeClient` automatically injects the base compose file, security overlay, and (if present) the resources overlay for every command:

```
docker compose -f profiles/<id>/docker-compose.yml \
  -f shared/security/docker-compose.security.yml \
  -f profiles/<id>/agents/.build/docker-compose.overlay.yml <command>
```

The security overlay adds the Squid sidecar, network isolation, proxy env vars, and resource limits. The resources overlay adds MCP server mounts, env var passthrough, and resource file mounts. Profiles with no MCP servers or resources skip the overlay file entirely.

**Three-file compose merge (with overlay):** When a profile declares `mcpServers` or `resources` in its `profile.json`, the orchestrator generates a third compose file at startup: `profiles/<id>/agents/.build/docker-compose.overlay.yml`. This overlay adds MCP server volume mounts, `mcp-config.json` mount, resource file mounts, and MCP env var passthrough. `ContainerManager` checks for the overlay at startup and includes it if present: `docker compose -f base.yml -f security.yml -f overlay.yml <command>`. The overlay uses absolute host paths baked in during generation (no env var placeholders).

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

Ralph has direct JIRA access via env vars (`JIRA_PAT`, `JIRA_EMAIL`, `JIRA_BASE_URL`, `JIRA_CLOUD_ID`):
- Posts completion comment with status, branch, PR URL, summary
- Attaches `handoff.md` to the JIRA issue
- Uses Basic auth via curl against the REST API v3

## Configuration

### `config.json` (Global Settings)

```json
{
  "jira": {
    "baseUrl": "https://api.atlassian.com/ex/jira",
    "cloudId": "<cloud-guid>",
    "pollIntervalMs": 60000
  },
  "output": {
    "logDir": "./output/logs",
    "handoffDir": "./output/handoffs"
  },
  "dashboard": {
    "enabled": true,
    "intervalMs": 30000
  },
  "promptAudit": {
    "mode": "warn"
  }
}
```

### `profiles/<id>/profile.json` (Per-Profile)

```json
{
  "repo": "~/repositories/kentico-docs-jekyll",
  "cli": "copilot",
  "model": "claude-opus-4.6",
  "timeoutMs": 3600000,
  "beforeAgent": { "targetStatus": "In Progress" },
  "afterAgent": { "targetStatus": "Ready for Review" },
  "variants": [
    {
      "agent": "ralph.ralph",
      "match": {
        "projects": ["DF"],
        "statuses": ["New", "To Do", "Defect Found"],
        "commentTrigger": "@RalphDf",
        "revisionStatuses": ["Defect Found"]
      }
    }
  ]
}
```

**Variant matching:**
- Each variant has its own `match` rules and `agent` name
- Variants are evaluated in order, across all profiles; all matching triggers are planned
- `match.projects` — issue project key must be in this array
- `match.statuses` — issue status must be in this array (case-insensitive); empty = match all
- `match.commentTrigger` — trigger string that must appear in a JIRA comment (case-insensitive)
- `match.revisionStatuses` — statuses that trigger revision mode (e.g. `["Defect Found"]`); the agent receives `Mode: REVISION` with the previous handoff
- Agent names must match `.agent.md` files in the profile's `agents/` directory (validated at startup)
- No match = issue skipped

**CLI selection:**
- `cli` — `"copilot"` (default) or `"claude"` — which CLI to use for agent execution
- `model` — optional model override (profile-level default, overridable per-variant)
- Falls back to the other CLI if the preferred one's credential is missing

**Dashboard configuration:**
- `dashboard.enabled` — set to `false` to disable heartbeat sending entirely (no network calls)
- `dashboard.intervalMs` — heartbeat interval in milliseconds (default: 30 000)
- `DASHBOARD_URL` and `DASHBOARD_SECRET` must be set in `.env` for heartbeats to function

### `.env`

See `.env.example` for all required variables.

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
| Capability drop | `cap_drop: ALL` — all Linux capabilities dropped |
| Privilege escalation | `no-new-privileges: true` — prevents setuid/setgid |
| Resource limits | Memory: 8G, CPU: 4, PIDs: 500 |
| npm without root | User-writable npm prefix (`~/.npm-global`) — no sudo needed for `npm install -g` |

### Compose Security Overlay

The security overlay (`shared/security/docker-compose.security.yml`) is merged with each profile's base compose file. It adds:

- **`egress-proxy` service** — Squid forward proxy sidecar on both internal and external networks
- **`ralph-internal` network** (`internal: true`) — app container's only network, no internet route
- **`ralph-external` network** — Squid's bridge to the internet
- **Proxy env vars** — `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, `https_proxy` injected into the app
- **Security options** — `cap_drop: ALL`, `no-new-privileges`, resource limits

### MCP Config System (`src/container/setup/mcp-config.ts`)

MCP (Model Context Protocol) servers are declared per-profile in `profile.json` (`mcpServers` array). At startup, the orchestrator resolves each server name to a manifest in `shared/mcp-servers/<name>/mcp-server.json` and generates two files in `agents/.build/`:

1. **`mcp-config.json`** — Shared by both CLIs. Contains `{ "mcpServers": { "<name>": { "command": ..., "args": [...], "env": {...} } } }`. Copilot CLI reads it via `--config-dir /workspace/.ralph`; Claude Code via `--mcp-config /workspace/.ralph/mcp-config.json --strict-mcp-config`.

2. **`docker-compose.overlay.yml`** — Compose overlay that mounts the MCP servers directory, `mcp-config.json`, and any resource files into the container. Also passes through env vars required by MCP servers. Uses absolute host paths baked directly into the YAML (no env var substitution).

**Server types:**
- `npm` — npx-based servers (e.g. `@anthropic-ai/mcp-server-playwright`). No host code needed.
- `custom` — Locally built servers with source in `shared/mcp-servers/<name>/src/` and bundle in `dist/`. Mounted into the container and executed directly.

### Resource Auto-Discovery (`src/container/setup/resource-mounts.ts`)

Profiles can declare `resources: { "mountBase": "<path>" }` in `profile.json`. Files in `profiles/<id>/resources/` are recursively discovered and mounted read-only at `/workspace/<mountBase>/<relative-path>` via the compose overlay. Resource mounts are generated alongside MCP mounts in `docker-compose.overlay.yml`.

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

