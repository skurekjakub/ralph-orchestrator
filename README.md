# Ralph Orchestrator

Autonomous orchestrator that polls JIRA for documentation tasks, routes them to the appropriate agent profile, spins up Docker containers, runs an AI agent (Copilot CLI or Claude Code CLI) inside them, and collects results. Supports multiple agent profiles — each binding a repository, Docker compose setup, agent name, and CLI preference to JIRA issue matching rules.

## Prerequisites

- Node.js 24+
- Docker Desktop running
- git on the host, and a PAT that can clone and push the target repos your profiles reference (e.g. `kentico-docs-jekyll`). The orchestrator clones them itself; you don't prepare a checkout.
- perl 5 on the host, for transcript redaction (preinstalled on Linux and macOS)

## Setup

1. Clone and install:

   ```bash
   git clone <repo-url> ~/projects/ralph-orchestrator
   cd ~/projects/ralph-orchestrator
   npm install
   ```

2. Create `config.json` and `.env` from the templates and fill in the values:

   ```bash
   cp config.json.sample config.json
   cp .env.example .env
   ```

   `config.json` holds the data sources (JIRA `cloudId`), output paths, dashboard and prompt-audit settings. `npm run validate` fails without it.

   Key variables in `.env`: `GH_TOKEN` (Copilot), `ANTHROPIC_API_KEY` (Claude Code), `ADO_PAT`, and one `JIRA_PAT_<KEY>` / `JIRA_EMAIL_<KEY>` pair per JIRA data source, where `<KEY>` is the data source key from `config.json` uppercased with dashes replaced by underscores (`my-jira` → `JIRA_PAT_MY_JIRA`). Startup fails if `GH_TOKEN`, `ADO_PAT` or a data source's JIRA pair is missing. See [docs/user-guide/environment-variables.md](docs/user-guide/environment-variables.md) for the full list.

3. Configure agent profiles in the `profiles/` directory. Each profile has its own `profile.json`, and its `dataSource` must name a key in `config.json` `dataSources`:

   ```bash
   # Example: profiles/ralph-docs/profile.json
   {
     "repoUrl": "https://dev.azure.com/my-org/my-project/_git/kentico-docs-jekyll",
     "dataSource": "my-jira",
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

   `repoUrl` is the repository's `https://` URL without credentials. The orchestrator authenticates with the PAT in the env var the profile's `repoPat` names (`ADO_PAT` by default, `GH_TOKEN` for `"vcsProvider": "github"`): it clones the repository into `cache/repos/<profileId>` on the first task and gives every task its own clone under `cache/workspaces/` (see [Output](#output)).

   See [docs/user-guide/](docs/user-guide/README.md) for the operator reference (configuration, environment variables, profiles, trigger parameters, template variables, MCP servers, runtime macros, skills).

4. Verify JIRA transitions work for your project — the orchestrator resolves transition IDs dynamically from target status names (`beforeAgent.targetStatus`, `afterAgent.targetStatus`):

   ```bash
   curl -u "$JIRA_EMAIL_MY_JIRA:$JIRA_PAT_MY_JIRA" \
     "https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/issue/DF-2704/transitions"
   ```

5. Validate the setup (env vars, config, Docker, profiles, security infrastructure):
   ```bash
   npm run validate
   ```

## Usage

```bash
# Development (runs the TypeScript sources with tsx)
npm run dev

# Production: validate, bundle src/ into dist/index.js with esbuild, run the bundle
npm start

# Bundle only
npm run build

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
3. **Plans operations** in the persistent ledger — each trigger comment is consumed exactly once per variant. Trigger parameters (including key-value pairs like `branch_name=xyz`) are persisted and passed to agent templates as `triggerParams` (`Record<string, string>`). See [docs/dev-doc/agent-templates.md](docs/dev-doc/agent-templates.md) for the template parameterization system.
4. **Routes to a profile** — matches the issue's project key and status against profile variants. Unmatched issues are skipped.
5. **Selects CLI** — uses the profile's `cli` preference (`"copilot"` or `"claude"`). Falls back to the other CLI if the preferred one's credential is missing.
6. **Processes one at a time:**
   - Renders agent templates (JIT) and resolves task-scoped MCP macros into `gateway.json`
   - Resolves existing PR metadata for revision tasks when the profile's `vcsProvider` supports it, allowing the task's workspace and `$task.branch` to reuse the PR's real source/target branches
   - Transitions the JIRA issue to the variant's `beforeAgent.targetStatus` + posts a start comment (with retry)
   - Creates the task's workspace (`TaskWorkspaceManager`): fetches the profile's clone in `cache/repos/<profileId>`, clones it into `cache/workspaces/<key>-<startTs>` on the base branch and checks out the task branch
   - Starts containers via `docker compose up -d --build` (base + security overlay + resources overlay) with the workspace mounted at `/workspace`
   - Runs the setup script inside the container (CLI installs, dependency setup)
   - Loops over the variant's `stages` array, executing each stage sequentially with the appropriate executor:
     - **Container stages** (`mode: "container"`) — run the CLI inside Docker via `docker compose exec`
     - **Local stages** (`mode: "local"`) — run the CLI directly on the host
   - Each stage uses its own agent, model, skills, and timeout (falling back to profile defaults)
   - If any stage fails, the pipeline aborts — remaining stages are skipped
   - The agent (e.g. Ralph) dispatches research, writing and review subagents, then pushes the branch and creates an ADO PR, posts a JIRA comment and attaches the handoff file through MCP tools that run in the MCP sidecar
7. **Collects results** — `TaskResultWriter` collects audit logs, per-task streaming log, session transcript, and proxy access log to `output/logs/`
8. **Attaches** the session transcript to the JIRA issue
9. **Stops** the container and cleans up volumes
10. **Runs post-task hooks** — local-only analysis pipelines declared in the variant's `postTaskHooks` (failures never affect the task result)
11. **Deletes the workspace** when the task succeeded; a failed task's workspace stays for inspection and its path is logged
12. **Transitions** the issue to the variant's `afterAgent.targetStatus` on success
13. **Resumes** polling for the next task

## Responsibility Split

| Responsibility                                                          | Owner                                      |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| Poll JIRA, queue issues, dedup                                          | Orchestrator                               |
| Route to matching profile                                               | Orchestrator                               |
| CLI selection (Copilot/Claude Code) with fallback                       | TaskRunner (ContainerManager)              |
| Stage pipeline execution (sequential, abort-on-fail)                    | TaskRunner                                 |
| JIRA transition to "In Progress" + start comment                        | TaskRunner                                 |
| Container lifecycle (start, exec, stop)                                 | TaskRunner (ContainerManager)              |
| Create executor per stage (container vs local mode)                     | ContainerManager                           |
| Manage `.git/info/exclude` for bind-mount artifacts                     | TaskRunner (TaskWorkspaceManager)          |
| Create the task's workspace on the task branch, delete it after success | TaskRunner (TaskWorkspaceManager)          |
| Render agent templates (JIT) + resolve MCP macros                       | TaskRunner (ProfileSetupService)           |
| Research, write, review, revise                                         | Ralph and its subagents (inside container) |
| Push branch + create ADO PR (`ado` MCP tools)                           | Ralph (inside container) → MCP sidecar     |
| Post completion comment on JIRA (`jira-kentico` MCP tools)              | Ralph (inside container) → MCP sidecar     |
| Attach handoff.md to JIRA issue (`jira-kentico` MCP tools)              | Ralph (inside container) → MCP sidecar     |
| Post-task hooks (local analysis pipelines)                              | TaskRunner                                 |
| JIRA transition to `afterAgent.targetStatus`                            | Orchestrator                               |
| Collect audit logs, transcript, proxy access log, save to disk          | TaskResultWriter                           |
| Attach session transcript to JIRA issue                                 | TaskResultWriter                           |

## Output

After each task, the orchestrator saves:

```
output/
└── logs/
    ├── <key>-<startTs>/                              # Per-task directory (one per agent run)
    │   ├── <key>-<startTs>-<ts>.log                  # Per-task streaming log (real-time container output)
    │   ├── <key>-<startTs>-<ts>-audit.jsonl          # Audit trail from hooks
    │   ├── <key>-<startTs>-<ts>-transcript.md        # Session transcript, credentials redacted (Copilot's own, or rendered from the Claude Code sessions)
    │   ├── <key>-<startTs>-<ts>-claude-sessions/     # Exported Claude Code session logs (main threads and subagents, JSONL)
    │   ├── <key>-<startTs>-<ts>-claude-run-telemetry.json # Claude Code spans, tool calls, durations and errors, derived from the session logs
    │   ├── <key>-<startTs>-<ts>-pre-tool.log         # Tool invocations logged by the pre-tool hook
    │   ├── <key>-<startTs>-<ts>-tool-output.log      # Untruncated tool output from hooks
    │   ├── <key>-<startTs>-<ts>-cli-debug.log        # CLI debug log
    │   ├── <key>-<startTs>-<ts>-proxy.log            # Squid proxy access log (allowed/denied domains)
    │   ├── <key>-<startTs>-<ts>-sidecar.log          # MCP sidecar gateway output
    │   ├── <key>-<startTs>-<ts>-state.md             # Agent state file (.ralph/tasks/<key>/state.md)
    │   ├── <key>-<startTs>-<ts>-session-state/       # Exported CLI session state
    │   ├── <key>-<startTs>-<ts>-session-db           # Exported CLI session store
    │   ├── <key>-<startTs>-<ts>-artifacts/           # Exported subagent artifacts (.ralph/tasks/<key>/artifacts)
    │   ├── <key>-<startTs>-<ts>-summary.json         # Execution metadata
    │   ├── hooks/<hook-name>/                        # Post-task hook output directory (hook.outputDir)
    │   └── hook-manifest.json                        # Hook replay manifest (only when skip_hooks param is set)
    ├── activity-YYYY-MM-DD.log                       # Persistent activity log (all sessions)
    ├── container-YYYY-MM-DD.log                      # Persistent container output log
    └── history/
        └── <dataSource>/
            └── <key>.json                            # Operation ledger (per data source, per issue)
```

Repositories and workspaces live under `cache/` (git-ignored):

```
cache/
├── trigger-cache.json                                # Last-seen `updated` timestamp per issue
├── repos/<profileId>/                                # The orchestrator's bare clone of the profile's repoUrl
└── workspaces/<key>-<startTs>/                       # A task's own clone, mounted at /workspace; kept only when the task failed
```

A failed task's workspace stays until you delete it, so you can inspect what the agent left behind.

Each task gets its own timestamped directory (`<key>-<startTs>/`). Collected files are named `<key>-<startTs>-<collectTs>-<sourceId>.<ext>`; in multi-stage pipelines the stage role is inserted before the source ID (`<key>-<startTs>-<collectTs>-<role>-<sourceId>.<ext>`). The per-task log streams container output in real-time — if the agent crashes mid-run, partial output is available immediately. The activity log (`activity-YYYY-MM-DD.log`) and container output log (`container-YYYY-MM-DD.log`) persist across tasks and restarts. Session transcripts are scrubbed of credentials with the audit hooks' rules (`shared/hooks/lib/redact.pl`, so the host needs perl) and attached to the JIRA issue. Handoff files are attached to the JIRA issue by Ralph directly.

The ledger lives at `<output.logDir>/history/<dataSource>/<issueKey>.json` (`output.logDir` defaults to `./output/logs`). Operation states move `pending → active | rejected | error` and `active → completed | error`.

## Documentation

- [docs/user-guide/](docs/user-guide/README.md) — operator reference: `config.json`, `.env`, `profile.json`, trigger parameters, template variables, MCP servers, runtime macros, skills.
- [ARCHITECTURE.md](ARCHITECTURE.md) — system architecture.
- [CONFIGURATION.md](CONFIGURATION.md) — configuration guide with examples.
- [MCP.md](MCP.md) — MCP sidecar, manifests, JIT parameters.
- [SECURITY.md](SECURITY.md) — threat model and container controls.
- [docs/dev-doc/](docs/dev-doc/) — design and internals (dependency injection, agent templates, multi-stage pipelines, data source registration, dataflow diagram).
- [docs/research/](docs/research/) and [docs/past-issues/](docs/past-issues/) — research notes and postmortems.

## Repository Layout

| Path               | Contents                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `src/`             | Orchestrator source (TypeScript, ESM)                                                      |
| `tests/`           | Vitest tests                                                                               |
| `profiles/<id>/`   | Agent profiles: `profile.json`, Dockerfile, compose file, setup script, agent templates    |
| `shared/`          | Security overlay, audit hooks, agent includes, skills, MCP servers, MCP sidecar            |
| `scripts/`         | Operator and debugging scripts (`npm run validate`, `npm run agent`, `reset-testenv:*`, …) |
| `dashboard-local/` | Local Vite dashboard for browsing run logs (`npm run dashboard`)                           |
| `ralph-dashboard/` | Status dashboard (Next.js, receives heartbeats)                                            |
| `ralphchives/`     | Ralphchives knowledge base stack (NodeBB, Neo4j, sync)                                     |
| `docs/`            | User guide, design docs, research notes                                                    |
| `containment/`     | Quarantined archive of material unrelated to this project. Not part of the product.        |

## Verified JIRA API Endpoints

| #   | Endpoint                                   | Verified |
| --- | ------------------------------------------ | -------- |
| 1   | `GET /rest/api/3/issue/{key}`              | ✅       |
| 2   | `POST /rest/api/3/issue/{key}/comment`     | ✅       |
| 3   | `POST /rest/api/3/issue/{key}/attachments` | ✅       |
| 4   | `GET /rest/api/3/issue/{key}/transitions`  | ✅       |
| 5   | `GET /rest/api/3/search/jql`               | ✅       |
