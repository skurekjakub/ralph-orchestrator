# Ralph Orchestrator — Architecture

## System Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It bridges JIRA (task management) with a container-based AI agent system (execution), supporting both GitHub Copilot CLI and Claude Code CLI.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RALPH ORCHESTRATOR                         │
│                      (this repo — Node.js app)                     │
│                                                                    │
│  ┌──────────┐    ┌──────────┐    ┌───────────────┐    ┌─────────┐  │
│  │  JIRA    │───▶│  Task    │───▶│  Container    │───▶│  Log   │  │
│  │  Poller  │    │  Queue   │    │  Manager      │    │Collector│  │
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
│  ┌──────────┐              ┌─────────────────────────┐             │
│  │Heartbeat │              │    DOCKER CONTAINER     │             │
│  │ Sender   │──▶ Dashboard │  ┌───────────────────┐  │             │
│  └──────────┘              │  │  Ralph Meta-Agent │  │             │
│       │                    │  │  ┌─────┐ ┌──────┐ │  │             │
│       │                    │  │  │Write│ │Review│ │  │             │
│       │                    │  │  └─────┘ └──────┘ │  │             │
│       │                    │  └───────────────────┘  │             │
│       │                    └─────────────────────────┘             │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    INK TERMINAL DASHBOARD                    │  │
│  │  StatusPanel │ QueuePanel │ HistoryPanel │ LogPanel          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. JIRA Cloud ──(JQL poll)──▶ Poller ──▶ Queue (deduped)
2. Queue ──(dequeue)──▶ Orchestrator ──(profile match)──▶ Profile selected
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
- No SDK dependency

### Container Manager (`src/container/manager.ts`)

Orchestrates the full container lifecycle, delegating to specialized components:

- **ComposeClient** (`src/container/compose-client.ts`) — Low-level `docker compose` wrapper. Builds the process environment (all secrets, JIRA config, Anthropic API key, `TARGET_REPO_PATH`, `SHARED_HOOKS_PATH`), spawns compose commands (`up`, `exec`, `down`), and enforces timeouts.
- **CopilotExecutor** (`src/container/copilot-executor.ts`) — Executes `copilot --agent <name> --model <model> --experimental --yolo --share <path> -p <prompt>` inside the container. The `--share` flag exports a full session transcript.
- **ClaudeCodeExecutor** (`src/container/claude-code-executor.ts`) — Executes `claude -p <prompt> --dangerously-skip-permissions [--model <model>]` inside the container.
- **StreamCapture** (`src/container/stream-capture.ts`) — Shared line-buffered streaming capture for child processes. Used by both executors and container build/setup to pipe stdout/stderr to the logger with a tag prefix (e.g. `[copilot]`, `[build]`).

**CLI selection:** The manager picks the executor based on the profile's `cli` preference (`"copilot"` or `"claude"`, default: `"copilot"`). If the preferred CLI's credential is missing (`GH_TOKEN` for Copilot, `ANTHROPIC_API_KEY` for Claude), it falls back to the other. If neither credential is available, it throws.

| Method | Action |
|---|---|
| `start()` | `docker compose up -d --build` + setup script (both streamed) |
| `execute()` | Runs the selected CLI agent, parses result block |
| `collectLogs()` | `docker compose exec cat <auditLogPath>` → `output/logs/` |
| `collectTranscript()` | Copies session transcript from container → `output/logs/` |
| `cleanLogs()` | `docker compose exec rm -rf` the audit log dir |
| `stop()` | `docker compose down --volumes --remove-orphans` |
| `checkPrerequisites()` | `docker info` (verifies Docker is running) |

Env vars are injected into the compose process environment (not via `-e` flags):
`GH_TOKEN`, `ADO_PAT_DOCS`, `ADO_MCP_AUTH_TOKEN`, `ADO_PAT_XPERIENCE`, `JIRA_PAT`, `JIRA_EMAIL`, `JIRA_BASE_URL`, `JIRA_CLOUD_ID`, `ANTHROPIC_API_KEY`, `TARGET_REPO_PATH`, `SHARED_HOOKS_PATH`

### Orchestrator (`src/orchestrator.ts`)

Main loop: poll → dequeue → match profile → process → repeat.

**Profile routing:** On dequeue, the orchestrator extracts the issue's project key and summary, then iterates the `profiles` array in order. A profile matches if its `match.projects` includes the project key *and* (its `match.keywords` is empty OR any keyword appears case-insensitively in the summary). First match wins. If no profile matches, the issue is skipped with a warning.

**Processing a single issue:**

| Step | Action | Error handling |
|---|---|---|
| 1 | Match issue to a profile (project key + keywords + status) | Skip with warning if no match |
| 2 | Select CLI (Copilot or Claude Code) based on profile + credentials | Falls back to other CLI; throws if neither available |
| 3 | Transition JIRA issue to "In Progress" | Retry 3× with backoff, warn on failure |
| 4 | Post start comment on JIRA | Retry 3×, warn on failure |
| 5 | Start containers via docker compose (stream build progress) | Fatal — throws to catch block |
| 6 | Run setup script | Fatal |
| 7 | Clean previous audit logs | Non-critical |
| 8 | Execute agent CLI (stream output) | Captures exit code, timeout, stdout/stderr |
| 9 | Collect audit logs from container | Non-critical |
| 10 | Collect session transcript from container | Non-critical |
| 11 | Save execution summary | Non-critical |
| 12 | Attach session transcript to JIRA | Non-critical |
| 13 | Track completion | Always |
| 14 | Stop container (finally) | Warn on failure, force-rm fallback |
| 15 | Transition to "Ready for Review" (finally) | Retry 3×, warn on failure |

**State management:**
- Exposes `OrchestratorState` via callback for the Ink dashboard
- Maintains a 50-line ring buffer of `LogEntry` records for the Ink panel
- Every log entry is also appended to `output/logs/activity-YYYY-MM-DD.log` (persistent, never truncated)
- Container output is also appended to `output/logs/container-YYYY-MM-DD.log`
- Per-task streaming logs are written to `output/logs/<key>-<timestamp>.log` (container output only, real-time)
- All components route logs through a shared `Logger` interface
- Graceful shutdown via `shutdown()` — stops poller, kills active container, cleans up

### Log Collector (`src/logs/collector.ts`)

- Saves execution metadata as `<key>-<timestamp>-summary.json`
- Audit trail stored as `<key>-<timestamp>.jsonl` (from hooks inside container)
- Session transcript saved as `<key>-<timestamp>-transcript.md` (from `--share` flag)
- Per-task streaming log at `<key>-<timestamp>.log` (real-time container output)
- Persistent activity log at `activity-YYYY-MM-DD.log` (managed by ActivityLog)
- Persistent container log at `container-YYYY-MM-DD.log` (managed by ActivityLog)

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
│   │   ├── profile.json                 # Profile config: repo, cli, variants, transitions
│   │   ├── Dockerfile                   # Container image (Ruby, Node, .NET, etc.)
│   │   ├── docker-compose.yml           # Services, volumes, env vars
│   │   ├── setup.sh                     # Post-create setup (CLI installs, git config)
│   │   └── agents/
│   │       ├── ralph.ralph.agent.md     # Meta-agent (orchestrates sub-agents)
│   │       ├── ralph.tech-writer.agent.md
│   │       ├── ralph.reviewer.agent.md
│   │       └── ralph.malph.agent.md     # Review agent (observer)
│   └── ralph-vscode/
│       ├── profile.json
│       ├── Dockerfile
│       ├── docker-compose.yml
│       ├── setup.sh
│       └── agents/
│           ├── ralph.ralph.agent.md
│           ├── ralph.analyst.agent.md   # Analysis sub-agent (read-only, Sonnet)
│           └── ralph.malph.agent.md     # Review agent (observer)
├── shared/
│   └── hooks/                           # Copilot CLI audit hooks (shared)
│       ├── log-*.sh                     # Hook scripts for session logging
│       └── ralph-audit.json             # Hook configuration
```

Compose files use `TARGET_REPO_PATH` and `SHARED_HOOKS_PATH` (injected by ComposeClient) for volume mounts. Agent files are overlay-mounted as individual read-only files, preserving non-Ralph agents in the target repo.

Currently configured target repos:
- `kentico-docs-jekyll` — Documentation portal (profile: `ralph-docs`)
- `kentico-docs-autocomplete-vscode` — VS Code extension (profile: `ralph-vscode`)

### Agent Phases (inside container)

1. **Setup** — Parse JIRA issue, `git checkout master && git pull`, create branch
2. **Write** — Delegate to tech-writer sub-agent
3. **Build** — Validate with `npm run build`
4. **Review** — Delegate to reviewer sub-agent
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
  "transitions": {
    "inProgressId": "141",
    "readyForReviewId": "91",
    "revisionId": "151"
  },
  "variants": [
    {
      "agent": "ralph",
      "match": {
        "projects": ["DF"],
        "keywords": [],
        "statuses": ["New", "To Do"],
        "revisionStatuses": ["Defect Found"]
      }
    }
  ]
}
```

**Variant matching:**
- Each variant has its own `match` rules and `agent` name
- Variants are evaluated in order, across all profiles; first match wins
- `match.projects` — issue project key must be in this array
- `match.keywords` — matched case-insensitively against the issue summary; empty = catch-all
- `match.statuses` — issue status must be in this array (case-insensitive); empty = match all
- `match.revisionStatuses` — statuses that trigger a revision workflow (e.g. "Defect Found")
- No match = issue skipped with warning

**CLI selection:**
- `cli` — `"copilot"` (default) or `"claude"` — which CLI to use for agent execution
- `model` — optional model override (profile-level default, overridable per-variant)
- Falls back to the other CLI if the preferred one's credential is missing

**Dashboard configuration:**
- `dashboard.enabled` — set to `false` to disable heartbeat sending entirely (no network calls)
- `dashboard.intervalMs` — heartbeat interval in milliseconds (default: 30 000)
- `DASHBOARD_URL` and `DASHBOARD_SECRET` must be set in `.env` for heartbeats to function
```

### `.env`

See `.env.example` for all required variables.

## Design Decisions

1. **One task at a time** — Sequential processing avoids container conflicts and simplifies state management.
2. **Fresh container per task** — Clean state prevents leakage between tasks. Trade-off: ~2-5 min container startup.
3. **Ralph owns JIRA completion** — The agent posts its own completion comment and handoff attachment, giving it full context about what was accomplished.
4. **Orchestrator owns lifecycle** — JIRA transitions, container start/stop, and log collection stay in the orchestrator for reliability.
5. **No JIRA SDK** — Native `fetch` against REST API v3 keeps dependencies minimal and avoids OAuth complexity (uses Basic auth with API tokens).
6. **Docker compose directly** — Containers are managed via `docker compose` commands. No devcontainer CLI. Env vars are injected into the compose process environment.
7. **Dual CLI support** — Profiles can use either Copilot CLI (`copilot --agent --model --yolo --share`) or Claude Code CLI (`claude -p --dangerously-skip-permissions`). The orchestrator selects at runtime based on profile preference and available credentials, with automatic fallback.
8. **Logger interface** — All components accept a `Logger` for centralized log routing through the orchestrator's ring buffer to the Ink dashboard.
9. **Persistent activity log** — Every log entry is appended to `activity-YYYY-MM-DD.log` so the full session history survives ring buffer eviction and restarts.
10. **Build and exec streaming** — Container build progress, setup script output, and CLI output are streamed to the activity log in real-time via the shared `StreamCapture` class.
11. **Profile variants** — Each profile can have multiple variants with different agent names and match rules, sharing the same Docker infrastructure. Variants are "exploded" into flat `AgentProfile[]` at load time.
12. **Heartbeat sender** — Optional fire-and-forget heartbeat to a status dashboard. Controlled by `dashboard.enabled` in config. Each orchestrator generates a UUID on startup so multiple instances can report to the same dashboard.
13. **JIRA field extraction** — Custom field parsing (ADF, `{value}` wrappers, strings) is separated into `JiraFieldExtractor` for testability and reuse outside `buildPrompt()`.
14. **Centralized infrastructure** — All Docker, agent, and hook files live in the orchestrator repo under `profiles/` and `shared/`. Target repos contain no Ralph-specific files. Compose files use overlay file mounts to inject agent definitions into containers without modifying the host repo.
15. **Session transcripts** — Copilot CLI's `--share` flag exports a full session transcript (conversation, tool calls, reasoning). The orchestrator collects it from the container and attaches it to the JIRA issue for auditability.
16. **Per-task streaming logs** — Each task gets its own log file written in real-time (container output only). If the agent crashes mid-run, partial output is immediately available without parsing the daily aggregate.
