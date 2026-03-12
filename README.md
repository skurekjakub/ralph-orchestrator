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

   See [CONFIGURATION.md](CONFIGURATION.md) § Environment Variables for the full list. Key variables: `GH_TOKEN` (Copilot), `ANTHROPIC_API_KEY` (Claude Code), `ADO_PAT`, `JIRA_PAT`, `JIRA_EMAIL`.

3. Configure agent profiles in the `profiles/` directory. Each profile has its own `profile.json`:
   ```bash
   # Example: profiles/ralph-docs/profile.json
   {
     "repo": "~/repositories/kentico-docs-jekyll",
     "cli": "copilot",
     "timeoutMs": 3600000,
     "variants": [
       {
         "stages": [
           { "agent": "ralph.ralph", "role": "primary" }
         ],
         "match": { "projects": ["DF"], "statuses": ["New", "To Do"], "commentTrigger": "@RalphDf" },
         "beforeAgent": { "targetStatus": "In Progress" },
         "afterAgent": { "targetStatus": "Ready for Review" }
       }
     ]
   }
   ```

   See [CONFIGURATION.md](CONFIGURATION.md) for the full configuration reference.

4. Verify JIRA transitions work for your project — the orchestrator resolves transition IDs dynamically from target status names (`beforeAgent.targetStatus`, `afterAgent.targetStatus`):
   ```bash
   curl -u "$JIRA_EMAIL:$JIRA_PAT" \
     "https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/issue/DF-2704/transitions"
   ```

## Usage

```bash
# Development (with tsx for TypeScript)
npm run dev

# Production
npm run build
npm start

# Run tests
npm test

# Type-check + lint
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
2. **Scans comments** for trigger strings (`commentTrigger`) on matching issues. Trigger comments can include parenthesized parameters (e.g. `@RalphDf(codesamples, verbose)`). Uses cached `updated` timestamps to skip unchanged issues — only issues with new JIRA activity trigger API calls.
3. **Plans operations** in the persistent ledger — each trigger comment is consumed exactly once per variant. Trigger parameters (including key-value pairs like `branch_name=xyz`) are persisted and passed to agent templates as `triggerParams` (`Record<string, string>`). See [docs/agent-templates.md](docs/agent-templates.md) for the template parameterization system.
4. **Routes to a profile** — matches the issue's project key and status against profile variants. Unmatched issues are skipped.
5. **Selects CLI** — uses the profile's `cli` preference (`"copilot"` or `"claude"`). Falls back to the other CLI if the preferred one's credential is missing.
5. **Processes one at a time:**
   - Renders agent templates (JIT) and resolves task-scoped MCP macros into `gateway.json`
  - Resolves existing PR metadata for revision tasks when the profile's `vcsProvider` supports it, allowing repo sync and `$task.branch` to reuse the PR's real source/target branches
   - Transitions the JIRA issue to "In Progress" + posts a start comment (with retry)
   - Starts containers via `docker compose up -d --build` (base + security overlay + resources overlay) for the matched profile's repo
   - Runs the setup script inside the container (CLI installs, dependency setup)
   - Loops over the variant's `stages` array, executing each stage sequentially with the appropriate executor:
     - **Container stages** (`mode: "container"`) — run the CLI inside Docker via `docker compose exec`
     - **Local stages** (`mode: "local"`) — run the CLI directly on the host
   - Each stage uses its own agent, model, skills, and timeout (falling back to profile defaults)
   - If any stage fails, the pipeline aborts — remaining stages are skipped
   - Ralph creates a branch, researches via sub-agent, writes the docs himself, runs a reviewer loop, creates an ADO PR, posts a JIRA comment, and attaches the handoff file
6. **Collects results** — `TaskResultWriter` collects audit logs, per-task streaming log, session transcript, and proxy access log to `output/logs/`
7. **Attaches** the session transcript to the JIRA issue
8. **Stops** the container and cleans up volumes
9. **Transitions** the issue to "Ready for Review"
10. **Resumes** polling for the next task

## Responsibility Split

| Responsibility | Owner |
|---|---|
| Poll JIRA, queue issues, dedup | Orchestrator |
| Route to matching profile | Orchestrator |
| CLI selection (Copilot/Claude Code) with fallback | TaskRunner (ContainerManager) |
| Stage pipeline execution (sequential, abort-on-fail) | TaskRunner |
| JIRA transition to "In Progress" + start comment | TaskRunner |
| Container lifecycle (start, exec, stop) | TaskRunner (ContainerManager) |
| Create executor per stage (container vs local mode) | ContainerManager |
| Manage `.git/info/exclude` for bind-mount artifacts | RepoSyncHook (lifecycle hook) |
| Render agent templates (JIT) + resolve MCP macros | TaskRunner |
| `git pull`, branch, write, review, revise | Ralph (inside container) |
| Create PR via ADO REST API, push branch | Ralph (inside container) |
| Post completion comment on JIRA | Ralph (inside container) |
| Attach handoff.md to JIRA issue | Ralph (inside container) |
| JIRA transition to "Ready for Review" | Orchestrator |
| Collect audit logs, transcript, proxy access log, save to disk | TaskResultWriter |
| Attach session transcript to JIRA issue | TaskResultWriter |

## Output

After each task, the orchestrator saves:

```
output/
└── logs/
    ├── <key>-<startTs>/                              # Per-task directory (one per agent run)
    │   ├── <key>-<startTs>-<ts>.log                  # Per-task streaming log (real-time container output)
    │   ├── <key>-<startTs>-<ts>-audit.jsonl          # Audit trail from hooks
    │   ├── <key>-<startTs>-<ts>-transcript.md        # Copilot CLI session transcript
    │   ├── <key>-<startTs>-<ts>-tool-output.log      # Untruncated tool output from hooks
    │   ├── <key>-<startTs>-<ts>-proxy.log            # Squid proxy access log (allowed/denied domains)
    │   ├── <key>-<startTs>-<ts>-sidecar.log          # MCP sidecar gateway output
    │   ├── <key>-<startTs>-<ts>-summary.json         # Execution metadata
    │   └── hook-manifest.json                        # Hook replay manifest (only when skip_hooks param is set)
    ├── activity-YYYY-MM-DD.log                       # Persistent activity log (all sessions)
    ├── container-YYYY-MM-DD.log                      # Persistent container output log
    └── history/
        └── <key>.json                                # Operation ledger
```

Each task gets its own timestamped directory (`<key>-<startTs>/`). Files within are named `<key>-<startTs>-<collectTs>-<sourceId>.<ext>`. The per-task log streams container output in real-time — if the agent crashes mid-run, partial output is available immediately. The activity log (`activity-YYYY-MM-DD.log`) and container output log (`container-YYYY-MM-DD.log`) persist across tasks and restarts. Session transcripts are also attached to the JIRA issue. Handoff files are attached to the JIRA issue by Ralph directly.

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