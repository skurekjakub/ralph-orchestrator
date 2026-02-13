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
│       │                    │  │  Ralph Meta-Agent │  │             │
│       │                    │  │  ┌─────┐ ┌──────┐ │  │             │
│       │                    │  │  │Write│ │Review│ │  │             │
│       │                    │  │  └─────┘ └──────┘ │  │             │
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
2. Queue ──(dequeue)──▶ Orchestrator
3. Orchestrator ──(transition + comment)──▶ JIRA Cloud
4. Orchestrator ──(devcontainer up)──▶ Docker
5. Orchestrator ──(devcontainer exec copilot)──▶ Container
6. Ralph (inside) ──(git pull, branch, write, review)──▶ ADO Git
7. Ralph (inside) ──(MCP: create PR)──▶ Azure DevOps
8. Ralph (inside) ──(REST: comment + attach handoff)──▶ JIRA Cloud
9. Orchestrator ──(devcontainer exec cat)──▶ audit.jsonl ──▶ output/logs/
10. Orchestrator ──(docker compose down)──▶ Container destroyed
11. Orchestrator ──▶ resume polling (back to step 1)
```

## Component Details

### JIRA Poller (`src/jira/poller.ts`)

- Runs on a configurable interval (default: 60s)
- Executes multiple JQL queries from `config.json`
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
- `start()` → `devcontainer up`
- `execute()` → `devcontainer exec copilot --agent ralph --model claude-opus-4.6 --yolo -p <prompt>`
- `collectLogs()` → `devcontainer exec cat /workspace/.ralph/logs/audit.jsonl`
- `cleanLogs()` → `devcontainer exec rm -rf /workspace/.ralph/logs/`
- `stop()` → `docker compose down --volumes` (CLI has no `down` command)
- `checkPrerequisites()` → `docker info` (verifies Docker is running)
- Passes env vars via `--remote-env`: `GH_TOKEN`, `ADO_PAT_DOCS`, `ADO_MCP_AUTH_TOKEN`, `ADO_PAT_XPERIENCE`, `JIRA_PAT`, `JIRA_EMAIL`, `JIRA_BASE_URL`, `JIRA_CLOUD_ID`

### Orchestrator (`src/orchestrator.ts`)

Main loop: poll → dequeue → process → repeat.

**Processing a single issue:**

| Step | Action | Error handling |
|---|---|---|
| 1 | Transition JIRA issue to "In Progress" | Retry 3× with backoff, warn on failure |
| 2 | Post start comment on JIRA | Retry 3×, warn on failure |
| 3 | Start devcontainer | Fatal — throws to catch block |
| 4 | Verify container health | Fatal |
| 5 | Clean previous audit logs | Non-critical |
| 6 | Execute Ralph agent | Captures exit code, timeout, stdout/stderr |
| 7 | Collect audit logs | Non-critical |
| 8 | Save execution summary | Non-critical |
| 9 | Track completion | Always |
| 10 | Stop container (finally) | Warn on failure, force-rm fallback |

**State management:**
- Exposes `OrchestratorState` via callback for the Ink dashboard
- Maintains a 50-line ring buffer of `LogEntry` records
- All components route logs through a shared `Logger` interface

### Log Collector (`src/logs/collector.ts`)

- Saves execution metadata as `<key>-<timestamp>-summary.json`
- Stores audit trail as `<key>-<timestamp>.jsonl`

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
3. **Build** — Validate with `bundle exec jekyll build`
4. **Review** — Delegate to reviewer sub-agent
5. **Revise** — Apply reviewer feedback (up to 2 cycles)
6. **PR** — Push branch and create ADO pull request via MCP
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
    "project": "DF",
    "jql": ["project = DF AND summary ~ \"Ralph\" AND status = \"New\" ORDER BY created ASC"],
    "pollIntervalMs": 60000,
    "inProgressTransitionId": "141"
  },
  "ralph": {
    "devcontainerConfig": ".ralph/devcontainer.json",
    "agentName": "ralph",
    "timeoutMs": 1800000
  },
  "output": {
    "logDir": "./output/logs",
    "handoffDir": "./output/handoffs"
  }
}
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
7. **docker compose for teardown only** — The devcontainer CLI has no `down` command, so teardown uses `docker compose down --volumes` directly.
8. **Logger interface** — All components accept a `Logger` for centralized log routing through the orchestrator's ring buffer to the Ink dashboard.
