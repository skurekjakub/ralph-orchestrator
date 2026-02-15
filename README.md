# Ralph Orchestrator

Autonomous orchestrator that polls JIRA for documentation tasks, routes them to the appropriate agent profile, spins up Docker containers, runs an AI agent (Copilot CLI or Claude Code CLI) inside them, and collects results. Supports multiple agent profiles — each binding a repository, Docker compose setup, agent name, and CLI preference to JIRA issue matching rules.

## Prerequisites

- Node.js 22+
- Docker Desktop running
- Access to the target repos referenced in your profiles (e.g. `kentico-docs-jekyll`)

## Setup

1. Clone and install:
   ```bash
   git clone <repo-url> ~/projects/ralph-orchestrator
   cd ~/projects/ralph-orchestrator
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the required values:
   ```bash
   cp .env.example .env
   ```

   | Variable | Description | Required |
   |---|---|---|
   | `GH_TOKEN` | GitHub PAT with Copilot Requests permission | When using Copilot CLI |
   | `ANTHROPIC_API_KEY` | Anthropic API key for Claude Code CLI | When using Claude Code |
   | `ADO_PAT_DOCS` | Azure DevOps PAT for KenticoCustomerSuccess org (Code: Read+Write) | Yes |
   | `ADO_PAT_XPERIENCE` | Azure DevOps PAT for kenticoxperience org (Code: Read) | Optional |
   | `JIRA_PAT` | JIRA API token (classic, from id.atlassian.com) | Yes |
   | `JIRA_EMAIL` | Email associated with the JIRA API token | Yes |
   | `DASHBOARD_URL` | Ralph status dashboard URL | Optional |
   | `DASHBOARD_SECRET` | Shared secret for dashboard auth | Optional |

3. Configure agent profiles in the `profiles/` directory. Each profile has its own `profile.json`:
   ```bash
   # Example: profiles/ralph-docs/profile.json
   {
     "repo": "~/repositories/kentico-docs-jekyll",
     "cli": "copilot",
     "timeoutMs": 3600000,
     "beforeAgent": { "transitionId": "141" },
     "afterAgent": { "transitionId": "91" },
     "variants": [
       {
         "agent": "ralph.ralph",
         "match": { "projects": ["DF"], "statuses": ["New", "To Do"], "commentTrigger": "@RalphDf" }
       }
     ]
   }
   ```

   See [CONFIGURATION.md](CONFIGURATION.md) for the full configuration reference.

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

The Ink terminal dashboard shows real-time status including container build progress and agent output:
```
╭──────────────────────────────────────────────────────────╮
│  🤖 Ralph Orchestrator                                   │
│                                                          │
│  Status: ⠋ WORKING                                      │
│  Current: DF-2759 — Add troubleshooting tips             │
│  CLI: Copilot (claude-opus-4.6)                         │
│  Elapsed: 4m 32s                                        │
│  ──────────────────────────────────────────────────────  │
│  Queue (1):                                              │
│    1. DF-2757 — Deploy to the SaaS environment          │
│                                                          │
│  Completed today: 1                                      │
│    ✅ DF-2704 — Custom modules (12m 14s)                 │
│  ──────────────────────────────────────────────────────  │
│  Orchestrator Log                                        │
│  14:31:10 · Polling for Ralph requests... 42 candidate   │
│             issues                                       │
│  14:31:10 · Enqueued DF-2759: Add troubleshooting tips  │
│  14:31:10 · Picked up DF-2759                           │
│  14:31:11 · Using Copilot CLI (profile preference)      │
│  14:31:12 · [build] Starting containers...              │
│  ──────────────────────────────────────────────────────  │
│  Container Output                                        │
│  14:35:44 · [copilot] Researching task...               │
│  14:36:01 · [copilot] Creating branch...                │
│                                                          │
│  Output: ./output/logs/ │ Press Ctrl+C to stop           │
╰──────────────────────────────────────────────────────────╯
```

Press `Ctrl+C` to gracefully stop (kills active container, cleans up resources). Press twice to force-exit.

## How It Works

1. **Polls JIRA** every 60s for issues matching JQL queries auto-generated from profile match rules. Auto-paginates to fetch all results (no truncation).
2. **Scans comments** for trigger strings (`commentTrigger`) on matching issues. Uses cached `updated` timestamps to skip unchanged issues — only issues with new JIRA activity trigger API calls.
3. **Plans operations** in the persistent ledger — each trigger comment is consumed exactly once per variant.
4. **Routes to a profile** — matches the issue's project key and status against profile variants. Unmatched issues are skipped.
5. **Selects CLI** — uses the profile's `cli` preference (`"copilot"` or `"claude"`). Falls back to the other CLI if the preferred one's credential is missing.
5. **Processes one at a time:**
   - Transitions the JIRA issue to "In Progress" + posts a start comment (with retry)
   - Starts containers via `docker compose up -d --build` for the matched profile's repo
   - Runs the setup script inside the container
   - Executes the selected CLI agent (Copilot CLI or Claude Code CLI) with the JIRA issue content as prompt
   - Ralph creates a branch, researches via sub-agent, writes the docs himself, runs a reviewer loop, creates an ADO PR, posts a JIRA comment, and attaches the handoff file
6. **Saves** audit logs, per-task streaming log, and session transcript to `output/logs/`
7. **Attaches** the session transcript to the JIRA issue
8. **Stops** the container and cleans up volumes
9. **Transitions** the issue to "Ready for Review"
10. **Resumes** polling for the next task

## Responsibility Split

| Responsibility | Owner |
|---|---|
| Poll JIRA, queue issues, dedup | Orchestrator |
| Transition to "In Progress" + start comment | Orchestrator |
| CLI selection (Copilot/Claude Code) with fallback | Orchestrator |
| Container lifecycle (start, exec, stop) | Orchestrator |
| `git pull`, branch, write, review, revise | Ralph (inside container) |
| Create PR via ADO REST API, push branch | Ralph (inside container) |
| Post completion comment on JIRA | Ralph (inside container) |
| Attach handoff.md to JIRA issue | Ralph (inside container) |
| Transition to "Ready for Review" | Orchestrator |
| Collect audit logs + transcript, save to disk | Orchestrator |
| Attach session transcript to JIRA issue | Orchestrator |

## Output

After each task, the orchestrator saves:

```
output/
└── logs/
    ├── DF-2704-1707840000000.log             # Per-task streaming log (real-time container output)
    ├── DF-2704-1707840000000.jsonl           # Audit trail from hooks
    ├── DF-2704-1707840000000-transcript.md   # Copilot CLI session transcript
    ├── DF-2704-1707840000000-summary.json    # Execution metadata
    ├── activity-2026-02-13.log               # Persistent activity log (all sessions)
    └── container-2026-02-13.log              # Persistent container output log
```

The per-task log (`<key>-<timestamp>.log`) streams container output in real-time — if the agent crashes mid-run, partial output is available immediately. The activity log (`activity-YYYY-MM-DD.log`) persists across tasks and restarts. Session transcripts are also attached to the JIRA issue. Handoff files are attached to the JIRA issue by Ralph directly.

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