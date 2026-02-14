# Ralph Orchestrator

Autonomous orchestrator that polls JIRA for documentation tasks, routes them to the appropriate agent profile, spins up the matching devcontainer, runs an AI meta-agent (Copilot CLI + Claude Opus 4.6) inside it, and collects results. Supports multiple agent profiles — each binding a repository, devcontainer, and agent name to JIRA issue matching rules.

## Prerequisites

- Node.js 22+
- Docker Desktop running
- Access to the target repos referenced in your profiles (e.g. `kentico-docs-jekyll`) with the Ralph devcontainer (`.ralph/`)
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

3. Copy `config.json.sample` to `config.json`, fill in your JIRA cloud ID, and configure agent profiles:
   ```bash
   cp config.json.sample config.json
   ```

   Each profile binds a repo + devcontainer + agent to JIRA matching rules:
   ```json
   "profiles": [
     {
       "id": "ralph-docs",
       "repo": "~/repositories/kentico-docs-jekyll",
       "devcontainer": ".ralph/devcontainer.json",
       "agent": "ralph",
       "timeoutMs": 1800000,
       "match": { "projects": ["DF"], "keywords": ["RalphDocs"] }
     },
     {
       "id": "ralph-default",
       "repo": "~/repositories/kentico-docs-jekyll",
       "devcontainer": ".ralph/devcontainer.json",
       "agent": "ralph",
       "timeoutMs": 1800000,
       "match": { "projects": ["DF"], "keywords": [] }
     }
   ]
   ```
   - `match.projects` — matches the issue's project key (e.g. `DF` from `DF-2759`)
   - `match.keywords` — matched case-insensitively against the issue summary
   - Empty `keywords` = catch-all for that project
   - First matching profile wins (order matters)
   - No match = issue skipped with a warning

4. Verify the JIRA transition IDs match your project:
   ```bash
   curl -u "$JIRA_EMAIL:$JIRA_PAT" \
     "https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/issue/DF-2704/transitions"
   ```
   Update `transitions.inProgressId` and `transitions.readyForReviewId` in each profile if needed.

## Usage

```bash
# Development (with tsx for TypeScript)
npm run dev

# Production
npm run build
npm start

# Run tests
npm test

# Type-check without emitting
npm run lint
```

The Ink terminal dashboard shows real-time status including devcontainer build progress and copilot agent output:
```
╭──────────────────────────────────────────────────────────╮
│  🤖 Ralph Orchestrator                                   │
│                                                          │
│  Status: ⠋ WORKING                                      │
│  Current: DF-2759 — Add troubleshooting tips             │
│  Elapsed: 4m 32s                                        │
│  ──────────────────────────────────────────────────────  │
│  Queue (1):                                              │
│    1. DF-2757 — Deploy to the SaaS environment          │
│                                                          │
│  Completed today: 1                                      │
│    ✅ DF-2704 — Custom modules (12m 14s)                 │
│  ──────────────────────────────────────────────────────  │
│  Activity Log                                            │
│  14:31:10 · Polling JIRA (1 queries)...                 │
│  14:31:10 · Found 2 issue(s) matching JQL               │
│  14:31:10 · Enqueued DF-2759: Add troubleshooting tips  │
│  14:31:10 · Picked up DF-2759                           │
│  14:31:11 · Transitioning DF-2759 to In Progress...     │
│  14:31:12 · [build] Setting up devcontainer...          │
│  14:35:44 · Executing Ralph agent (timeout: 1800s)...   │
│  14:36:01 · [copilot] Researching task...               │
│                                                          │
│  Output: ./output/logs/ │ Press Ctrl+C to stop           │
╰──────────────────────────────────────────────────────────╯
```

Press `Ctrl+C` to gracefully stop (kills active container, cleans up resources). Press twice to force-exit.

## How It Works

1. **Polls JIRA** every 60s for issues matching the JQL queries in `config.json`
2. **Enqueues** discovered issues (deduplicates across queries and poll cycles)
3. **Routes to a profile** — matches the issue's project key and summary keywords against configured profiles (first match wins; unmatched issues are skipped)
4. **Processes one at a time:**
   - Transitions the JIRA issue to "In Progress" + posts a start comment (with retry)
   - Starts a fresh devcontainer for the matched profile's repo (build progress streamed to activity log)
   - Executes `copilot --agent <profile.agent> --model claude-opus-4.6 --hooks-config ... --yolo -p "<jira content>"`
   - Ralph pulls latest `master`, creates a branch, runs the tech-writer → reviewer loop
   - Ralph creates an ADO PR via REST API, posts a JIRA comment, and attaches the handoff file
5. **Saves** copilot stdout/stderr and audit logs to `output/logs/`
6. **Stops** the container and cleans up volumes
7. **Transitions** the issue to "Ready for Review"
8. **Resumes** polling for the next task

## Responsibility Split

| Responsibility | Owner |
|---|---|
| Poll JIRA, queue issues, dedup | Orchestrator |
| Transition to "In Progress" + start comment | Orchestrator |
| Container lifecycle (start, exec, stop) | Orchestrator |
| `git pull`, branch, write, review, revise | Ralph (inside container) |
| Create PR via ADO REST API, push branch | Ralph (inside container) |
| Post completion comment on JIRA | Ralph (inside container) |
| Attach handoff.md to JIRA issue | Ralph (inside container) |
| Transition to "Ready for Review" | Orchestrator |
| Collect audit logs + save copilot output | Orchestrator |

## Output

After each task, the orchestrator saves:

```
output/
└── logs/
    ├── DF-2704-1707840000000.jsonl           # Audit trail from hooks
    ├── DF-2704-1707840000000-copilot.log     # Full Copilot CLI stdout/stderr
    ├── DF-2704-1707840000000-summary.json    # Execution metadata
    └── activity-2026-02-13.jsonl             # Persistent activity log (all sessions, append-only)
```

The activity log (`activity-YYYY-MM-DD.jsonl`) persists across tasks and restarts — every log entry from the Ink dashboard is appended here. Handoff files are attached to the JIRA issue by Ralph directly.

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