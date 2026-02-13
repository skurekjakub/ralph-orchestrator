# Ralph Orchestrator

Autonomous orchestrator that polls JIRA for documentation tasks, spins up the Ralph devcontainer, runs an AI meta-agent (Copilot CLI + Claude Opus 4.6) inside it, and collects results.

## Prerequisites

- Node.js 22+
- Docker Desktop running
- Access to the `kentico-docs-jekyll` repo with the Ralph devcontainer (`.ralph/`)
- The `@devcontainers/cli` package is a devDependency — invoked via `npx` (no global install needed)

## Setup

1. Clone and install:
   ```bash
   git clone <repo-url> ~/projects/ralph-orchestrator
   cd ~/projects/ralph-orchestrator
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in all values:
   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |---|---|
   | `GH_TOKEN` | GitHub PAT with Copilot Requests permission |
   | `ADO_PAT_DOCS` | Azure DevOps PAT for KenticoCustomerSuccess org (Code: Read+Write) |
   | `ADO_PAT_XPERIENCE` | Azure DevOps PAT for kenticoxperience org (Code: Read) — optional |
   | `JIRA_PAT` | JIRA API token (classic, from id.atlassian.com) |
   | `JIRA_EMAIL` | Email associated with the JIRA API token |
   | `RALPH_REPO_PATH` | **Absolute path** to the kentico-docs-jekyll repo |

3. Edit `config.json` if you need to change defaults (JQL queries, polling interval, timeout, etc.)

4. Verify the JIRA transition IDs match your project:
   ```bash
   curl -u "$JIRA_EMAIL:$JIRA_PAT" \
     "https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/issue/DF-2704/transitions"
   ```
   Update `inProgressTransitionId` in `config.json` if needed.

## Usage

```bash
# Development (with tsx for TypeScript)
npm run dev

# Production
npm run build
npm start

# Run tests
npm test
```

The Ink terminal dashboard shows real-time status:
```
╭──────────────────────────────────────────────────────────╮
│  🤖 Ralph Orchestrator                                   │
│                                                          │
│  Status: ⠋ WORKING                                      │
│  Current: DF-2759 — SaaS                                │
│  Elapsed: 4m 32s                                        │
│  ──────────────────────────────────────────────────────  │
│  Queue (1):                                              │
│    1. DF-2757 — Deploy to the SaaS environment          │
│                                                          │
│  Completed today: 0                                      │
│    (none yet)                                            │
│  ──────────────────────────────────────────────────────  │
│  Activity Log                                            │
│  14:31:10 · Picked up DF-2759: SaaS                     │
│  14:31:11 · Transitioning DF-2759 to In Progress...     │
│  14:31:12 · Starting devcontainer...                    │
│  14:35:44 · Executing Ralph agent (timeout: 1800s)...   │
│                                                          │
│  Output: ./output/logs/ │ Press Ctrl+C to stop           │
╰──────────────────────────────────────────────────────────╯
```

Press `Ctrl+C` to gracefully stop.

## How It Works

1. **Polls JIRA** every 60s for issues matching the JQL queries in `config.json`
2. **Enqueues** discovered issues (deduplicates across queries, one-at-a-time processing)
3. When processing an issue:
   - Transitions the JIRA issue to "In Progress" + posts a start comment (with retry)
   - Starts a fresh Ralph devcontainer
   - Executes `copilot --agent ralph --model claude-opus-4.6 --yolo -p "<jira content>"`
   - Ralph pulls latest `master`, creates a branch, runs the tech-writer → reviewer loop
   - Ralph creates an ADO PR, posts a JIRA completion comment, and attaches the handoff file
4. **Collects** audit logs from the container
5. **Stops** the container and cleans up volumes
6. **Resumes** polling for the next task

## Responsibility Split

| Responsibility | Owner |
|---|---|
| Poll JIRA, queue issues, dedup | Orchestrator |
| Transition to "In Progress" + start comment | Orchestrator |
| Container lifecycle (start, exec, stop) | Orchestrator |
| `git pull`, branch, write, review, revise | Ralph (inside container) |
| Create PR, push branch | Ralph (inside container) |
| Post completion comment on JIRA | Ralph (inside container) |
| Attach handoff.md to JIRA issue | Ralph (inside container) |
| Collect audit logs | Orchestrator |

## Output

```
output/
└── logs/
    ├── DF-2704-1707840000000.jsonl         # Audit trail from hooks
    └── DF-2704-1707840000000-summary.json  # Execution metadata
```

Handoff files are attached to the JIRA issue by Ralph directly (not saved locally).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system architecture.

## Verified JIRA API Endpoints

| # | Endpoint | Verified |
|---|---|---|
| 1 | `GET /rest/api/3/issue/{key}` | ✅ |
| 2 | `POST /rest/api/3/issue/{key}/comment` | ✅ |
| 3 | `POST /rest/api/3/issue/{key}/attachments` | ✅ |
| 4 | `GET /rest/api/3/issue/{key}/transitions` | ✅ |
| 5 | `GET /rest/api/3/search/jql` | ✅ |