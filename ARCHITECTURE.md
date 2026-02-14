# Ralph Orchestrator — Architecture

## System Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It bridges JIRA (task management) with a devcontainer-based AI agent system (execution).

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
│       │                                  ▼                         │
│  ┌──────────┐              ┌─────────────────────────┐             │
│  │  JIRA    │              │    DEVCONTAINER         │             │
│  │  Client  │              │  ┌───────────────────┐  │             │
│  └──────────┘              │  │  Copilot CLI      │  │             │
│       │                    │  │  + Claude Opus 4.6│  │             │
│       │                    │  └───────┬───────────┘  │             │
│       │                    │          │              │             │
│       │                    │  ┌───────▼───────────┐  │             │
│  ┌──────────┐              │  │  Ralph Meta-Agent │  │             │
│  │Heartbeat │              │  │  ┌─────┐ ┌──────┐ │  │             │
│  │ Sender   │──▶ Dashboard │  │  │Write│ │Review│ │  │             │
│  └──────────┘              │  │  └─────┘ └──────┘ │  │             │
│       │                    │  └───────────────────┘  │             │
│       │                    └─────────────────────────┘             │
│       │                                                            │
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
4. Orchestrator ──(devcontainer up)──▶ Docker
5. Orchestrator ──(devcontainer exec copilot)──▶ Container
6. Ralph (inside) ──(git pull, branch, write, review)──▶ ADO Git
7. Ralph (inside) ──(REST API: create PR)──▶ Azure DevOps
8. Ralph (inside) ──(REST: comment + attach handoff)──▶ JIRA Cloud
9. Orchestrator ──(devcontainer exec cat)──▶ audit.jsonl ──▶ output/logs/
10. Orchestrator ──(save copilot output)──▶ output/logs/<key>-<ts>-copilot.log
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

### Task Queue (`src/queue.ts`)

- In-memory FIFO queue with deduplication
- `enqueue()` skips issues already queued or recently processed
- `dequeue()` returns the next unprocessed issue
- `markProcessed()` tracks completed keys to prevent reprocessing within a session

### JIRA Client (`src/jira/client.ts`)

- Native `fetch` against JIRA REST API v3 (cloud endpoint)
- Basic auth: `base64(email:apiToken)`
- API base: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`
- Endpoints: `search/jql`, `issue/{key}`, `issue/{key}/comment`, `issue/{key}/transitions`
- No SDK dependency

### Container Manager (`src/container/manager.ts`)

- All devcontainer CLI calls go through a helper function: `npx --yes @devcontainers/cli <args>`
- `start()` → `devcontainer up` — streams build/setup output to the activity log with `[build]` prefix
- `execute()` → `devcontainer exec copilot --agent ralph --model claude-opus-4.6 --hooks-config /workspace/.github/hooks/ralph-audit.json --yolo -p <prompt>` — streams output with `[copilot]` prefix
- `collectLogs()` → `devcontainer exec cat /workspace/.ralph/logs/audit.jsonl`
- `cleanLogs()` → `devcontainer exec rm -rf /workspace/.ralph/logs/`
- `stop()` → `docker compose down --volumes --remove-orphans` (CLI has no `down` command)
- `checkPrerequisites()` → `docker info` (verifies Docker is running)
- Passes env vars via `--remote-env`: `GH_TOKEN`, `ADO_PAT_DOCS`, `ADO_MCP_AUTH_TOKEN`, `ADO_PAT_XPERIENCE`, `JIRA_PAT`, `JIRA_EMAIL`, `JIRA_BASE_URL`, `JIRA_CLOUD_ID`

### Orchestrator (`src/orchestrator.ts`)

Main loop: poll → dequeue → match profile → process → repeat.

**Profile routing:** On dequeue, the orchestrator extracts the issue's project key and summary, then iterates the `profiles` array in order. A profile matches if its `match.projects` includes the project key *and* (its `match.keywords` is empty OR any keyword appears case-insensitively in the summary). First match wins. If no profile matches, the issue is skipped with a warning.

**Processing a single issue:**

| Step | Action | Error handling |
|---|---|---|
| 1 | Match issue to a profile (project key + keywords) | Skip with warning if no match |
| 2 | Transition JIRA issue to "In Progress" | Retry 3× with backoff, warn on failure |
| 3 | Post start comment on JIRA | Retry 3×, warn on failure |
| 4 | Start devcontainer for profile's repo (stream build progress) | Fatal — throws to catch block |
| 5 | Verify container health | Fatal |
| 6 | Clean previous audit logs | Non-critical |
| 7 | Execute agent from profile (stream copilot output) | Captures exit code, timeout, stdout/stderr |
| 8 | Save full copilot stdout/stderr to disk | Non-critical |
| 9 | Collect audit logs from container | Non-critical |
| 10 | Save execution summary | Non-critical |
| 11 | Track completion | Always |
| 12 | Stop container (finally) | Warn on failure, force-rm fallback |
| 13 | Transition to "Ready for Review" (finally) | Retry 3×, warn on failure |

**State management:**
- Exposes `OrchestratorState` via callback for the Ink dashboard
- Maintains a 50-line ring buffer of `LogEntry` records for the Ink panel
- Every log entry is also appended to `output/logs/activity-YYYY-MM-DD.jsonl` (persistent, never truncated)
- All components route logs through a shared `Logger` interface
- Graceful shutdown via `shutdown()` — stops poller, kills active container, cleans up

### Log Collector (`src/logs/collector.ts`)

- Saves execution metadata as `<key>-<timestamp>-summary.json`
- Audit trail stored as `<key>-<timestamp>.jsonl` (from hooks inside container)
- Full copilot stdout/stderr saved as `<key>-<timestamp>-copilot.log`
- Persistent activity log at `activity-YYYY-MM-DD.jsonl` (managed by the Orchestrator)

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

## External: Ralph Agent System

Lives in the `kentico-docs-jekyll` repo under `.ralph/` and `.github/agents/`:

```
kentico-docs-jekyll/
├── .ralph/
│   ├── devcontainer.json      # Dev container config
│   ├── docker-compose.yml     # App (Ubuntu) + DB (MSSQL) services
│   ├── Dockerfile             # Ruby, Node, .NET, Docker-in-Docker, Pandoc
│   ├── setup.sh               # postCreateCommand — gems, npm, copilot CLI, MCP servers
│   └── hooks/                 # Copilot CLI hooks for audit logging
├── .github/
│   ├── agents/
│   │   ├── ralph.agent.md             # Meta-agent (orchestrates sub-agents)
│   │   ├── ralph.tech-writer.agent.md # Writes documentation changes
│   │   └── ralph.reviewer.agent.md    # Reviews changes for quality
│   └── hooks/
│       └── ralph-audit.json           # Hook config for session logging
```

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

### `config.json`

```json
{
  "jira": {
    "baseUrl": "https://api.atlassian.com/ex/jira",
    "cloudId": "<cloud-guid>",
    "pollIntervalMs": 60000
  },
  "profiles": [
    {
      "id": "ralph-docs",
      "repo": "~/repositories/kentico-docs-jekyll",
      "composeFile": ".ralph/docker-compose.yml",
      "agent": "ralph",
      "timeoutMs": 1800000,
      "match": { "projects": ["DF"], "keywords": ["RalphDocs"] },
      "transitions": { "inProgressId": "141", "readyForReviewId": "91" }
    },
    {
      "id": "ralph-default",
      "repo": "~/repositories/kentico-docs-jekyll",
      "composeFile": ".ralph/docker-compose.yml",
      "agent": "ralph",
      "timeoutMs": 1800000,
      "match": { "projects": ["DF"], "keywords": [] },
      "transitions": { "inProgressId": "141", "readyForReviewId": "91" }
    }
  ],
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

**Profile matching rules:**
- `match.projects` — issue project key must be in this array
- `match.keywords` — matched case-insensitively against the issue summary; empty = catch-all
- `match.statuses` — issue status must be in this array (case-insensitive); empty = match all
- First matching profile wins (order matters)
- No match = issue skipped with warning

**Dashboard configuration:**
- `dashboard.enabled` — set to `false` to disable heartbeat sending entirely (no network calls)
- `dashboard.intervalMs` — heartbeat interval in milliseconds (default: 30 000)
- `DASHBOARD_URL` and `DASHBOARD_SECRET` must be set in `.env` for heartbeats to function
```

### `.env`

See `.env.example` for all required variables.

## Design Decisions

1. **One task at a time** — Sequential processing avoids container conflicts and simplifies state management.
2. **Fresh container per task** — Clean state prevents leakage between tasks. Trade-off: ~5-7 min container startup.
3. **Ralph owns JIRA completion** — The agent posts its own completion comment and handoff attachment, giving it full context about what was accomplished.
4. **Orchestrator owns lifecycle** — JIRA transitions, container start/stop, and log collection stay in the orchestrator for reliability.
5. **No JIRA SDK** — Native `fetch` against REST API v3 keeps dependencies minimal and avoids OAuth complexity (uses Basic auth with API tokens).
6. **devcontainer CLI via npx** — Uses the local `@devcontainers/cli` devDependency, never assumes a global installation.
7. **docker compose for teardown only** — The devcontainer CLI has no `down` command, so teardown uses `docker compose down --volumes --remove-orphans` directly.
8. **Logger interface** — All components accept a `Logger` for centralized log routing through the orchestrator's ring buffer to the Ink dashboard.
9. **Persistent activity log** — Every log entry is appended to `activity-YYYY-MM-DD.jsonl` so the full session history survives ring buffer eviction and restarts.
10. **Build and exec streaming** — Container build progress and copilot output are streamed to the activity log in real-time, not buffered until completion.
11. **Profile-based routing** — Each profile binds a repo + devcontainer + agent name to JIRA matching rules (project key + summary keywords + statuses). This allows the same orchestrator instance to drive different agents across different repositories. Profiles are evaluated in order; the first match wins; empty keywords act as a catch-all. Backward compatible — a legacy `ralph` config section is auto-migrated to a single profile at startup.
12. **Heartbeat sender** — Optional fire-and-forget heartbeat to a status dashboard. Controlled by `dashboard.enabled` in config. Each orchestrator generates a UUID on startup so multiple instances can report to the same dashboard.
13. **JIRA field extraction** — Custom field parsing (ADF, `{value}` wrappers, strings) is separated into `JiraFieldExtractor` for testability and reuse outside `buildPrompt()`.
