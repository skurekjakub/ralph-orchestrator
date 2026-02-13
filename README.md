# Ralph Orchestrator

Autonomous orchestrator that polls JIRA for documentation tasks, spins up the Ralph devcontainer, runs the autonomous meta-agent, and collects results.

## Prerequisites

- Node.js 22+
- Docker Desktop running
- `devcontainer` CLI installed (`npm install -g @devcontainers/cli`)
- `copilot` CLI installed
- Access to the `kentico-docs-jekyll` repo with the Ralph devcontainer (`.ralph/`)

## Setup

1. Clone this directory to a standalone location (it does NOT need to be inside the docs repo):
   ```bash
   cp -r ralph-orchestrator ~/projects/ralph-orchestrator
   cd ~/projects/ralph-orchestrator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in all values:
   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |---|---|
   | `GH_TOKEN` | GitHub PAT with Copilot Requests permission |
   | `ADO_PAT_DOCS` | Azure DevOps PAT for KenticoCustomerSuccess org |
   | `ADO_PAT_XPERIENCE` | Azure DevOps PAT for kenticoxperience org |
   | `JIRA_PAT` | JIRA API token |
   | `JIRA_EMAIL` | Email associated with the JIRA API token |
   | `RALPH_REPO_PATH` | **Absolute path** to the kentico-docs-jekyll repo |

4. Edit `config.json` if you need to change defaults (JQL query, polling interval, timeout, etc.)

5. Verify the JIRA transition IDs match your project:
   ```bash
   # List available transitions for an issue
   curl -u "email:token" https://kentico.atlassian.net/rest/api/3/issue/DF-2704/transitions
   ```
   Update `inProgressTransitionId` in `config.json` accordingly.

## Usage

```bash
# Development (with tsx for TypeScript)
npm run dev

# Production
npm run build
npm start
```

The terminal dashboard will show:
```
╭──────────────────────────────────────────╮
│  🤖 Ralph Orchestrator                   │
│                                          │
│  Status: IDLE — waiting for tasks        │
│                                          │
│  Queue (0):                              │
│    (empty)                               │
│                                          │
│  Completed today: 0                      │
│    (none yet)                            │
│                                          │
│  Logs: ./output/logs/    Ctrl+C to stop  │
╰──────────────────────────────────────────╯
```

Press `Ctrl+C` to gracefully stop.

## How It Works

1. **Polls JIRA** every 60s for issues in the DF project with "Ralph" in the title and status = "New"
2. **Enqueues** discovered issues (deduplicates, one-at-a-time processing)
3. When processing an issue:
   - Transitions the JIRA issue to "In Progress" + adds a comment
   - Starts the Ralph devcontainer
   - Executes `copilot --agent ralph --yolo -p "<jira content>"`
   - The meta-agent orchestrates tech-writer → reviewer → revision loop
   - Creates a branch + PR via ADO MCP
   - Writes a handoff file
4. **Collects** audit logs and handoff file from the container
5. **Comments** on JIRA with the result + PR link
6. **Stops** the container
7. **Resumes** polling for the next task

## Output

```
output/
├── logs/
│   ├── DF-2704-1707840000000.jsonl    # Audit trail from hooks
│   └── DF-2704-1707840000000-summary.json
└── handoffs/
    └── DF-2704/
        └── handoff.md                  # Context handoff document
```

## Architecture

See [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) for full details.
