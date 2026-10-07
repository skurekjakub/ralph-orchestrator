# Ralph Orchestrator

Autonomous orchestrator that polls JIRA for documentation tasks, routes them to the appropriate agent profile, spins up Docker containers, runs an AI agent CLI inside them (Claude Code by default, or GitHub Copilot CLI), and collects results. Supports multiple agent profiles — each binding a repository, Docker compose setup, agent pipeline and CLI to JIRA issue matching rules.

## Prerequisites

- Node.js 24+
- Docker Desktop running
- git on the host, and a PAT that can clone and push the target repos your profiles reference (e.g. `kentico-docs-jekyll`). The orchestrator clones them itself; you don't prepare a checkout.
- perl 5 on the host, for transcript redaction (preinstalled on Linux and macOS)
- jq 1.6 or later on the host when a `mode: "local"` stage runs Claude Code (both bundled profiles do, in their `run-analysis` post-task hook): Ralph's audit hooks run on the host for those stages

## Setup

1. Clone and install:

   ```bash
   git clone <repo-url> ~/projects/ralph-orchestrator
   cd ~/projects/ralph-orchestrator
   npm install
   ```

   `npm install` also installs the agent CLIs that host stages run, at the exact versions pinned in `package.json` `dependencies` (`@anthropic-ai/claude-code`, `@github/copilot`). The agent images install the same versions at build time.

2. Create `config.json` and `.env` from the templates and fill in the values:

   ```bash
   cp config.json.sample config.json
   cp .env.example .env
   ```

   `config.json` holds the data sources (JIRA `cloudId`), output paths, dashboard and prompt-audit settings, and which credential Claude Code authenticates with (`claudeAuth`, `"oauth-token"` by default). `npm run validate` fails without it.

   Key variables in `.env`:
   - `CLAUDE_CODE_OAUTH_TOKEN` for Claude Code, from `claude setup-token`. With `"claudeAuth": "api-key"` in `config.json`, set `ANTHROPIC_API_KEY` instead.
   - `GH_TOKEN`, only when a stage runs Copilot CLI or a profile has `"vcsProvider": "github"`.
   - `ADO_PAT`.
   - One `JIRA_PAT_<KEY>` / `JIRA_EMAIL_<KEY>` pair per JIRA data source, where `<KEY>` is the data source key from `config.json` uppercased with dashes replaced by underscores (`my-jira` → `JIRA_PAT_MY_JIRA`).

   Startup fails when `ADO_PAT`, a profile's `repoPat` variable, a data source's JIRA pair, or the credential of a CLI some stage runs is missing. See [docs/user-guide/environment-variables.md](docs/user-guide/environment-variables.md) for the full list.

3. Configure agent profiles in the `profiles/` directory. Each profile has its own `profile.json`, and its `dataSource` must name a key in `config.json` `dataSources`:

   ```bash
   # Example: profiles/ralph-docs/profile.json
   {
     "repoUrl": "https://dev.azure.com/my-org/my-project/_git/kentico-docs-jekyll",
     "dataSource": "my-jira",
     "cli": "claude",
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

The Ink terminal dashboard shows the current task, the agent CLI's output and the orchestrator's log:

```
╭──────────────────────────────────────────────────────────╮
│  🤖 Ralph Orchestrator                                   │
│  Status: ⠋ WORKING                                       │
│                                                          │
│  Current: DF-2759 — Add troubleshooting tips             │
│  Profile: ralph-docs                                     │
│  Elapsed: 4m 32s                                         │
│                                                          │
│  Container Output                                        │
│  14:35:44 · [claude] Researching task...                 │
│  14:36:01 · [claude] Creating branch...                  │
│                                                          │
│  Orchestrator Log                                        │
│  14:31:10 · Picked up DF-2759: Add troubleshooting tips  │
│  14:31:12 · Stage primary: claude CLI (container),       │
│             agent ralph.ralph                            │
│  ──────────────────────────────────────────────────      │
│  Queue (1):                                              │
│    1. DF-2757 — Deploy to the SaaS environment           │
│                                                          │
│  Completed today: 1                                      │
│    ✅ DF-2704 — Custom modules (12m 14s) [ralph-docs]    │
│  ──────────────────────────────────────────────────      │
│  Output: ./output/logs/ │ Press Ctrl+C to stop           │
╰──────────────────────────────────────────────────────────╯
```

Press `Ctrl+C` to gracefully stop (kills active container, cleans up resources). Press twice to force-exit.

## How It Works

1. **Polls JIRA** every 60s for issues matching JQL queries auto-generated from profile match rules. Auto-paginates to fetch all results (no truncation).
2. **Scans comments** for trigger strings (`commentTrigger`) on matching issues. Trigger comments can include parenthesized parameters (e.g. `@RalphDf(codesamples, verbose)`). Uses cached `updated` timestamps to skip unchanged issues — only issues with new JIRA activity trigger API calls.
3. **Plans operations** in the persistent ledger — each trigger comment is consumed exactly once per variant. Trigger parameters (including key-value pairs like `branch_name=xyz`) are persisted and passed to agent templates as `triggerParams` (`Record<string, string>`). See [docs/dev-doc/agent-templates.md](docs/dev-doc/agent-templates.md) for the template parameterization system.
4. **Routes to a profile** — matches the issue's project key and status against profile variants. Unmatched issues are skipped.
5. **Selects the CLI per stage** — the stage's `cli`, else the profile's (`"claude"` by default, or `"copilot"`). Startup validation requires each chosen CLI's credential; there is no fallback to the other CLI.
6. **Processes one at a time:**
   - Renders agent templates (JIT) and resolves task-scoped MCP macros into `gateway.json`
   - Resolves existing PR metadata for revision tasks when the profile's `vcsProvider` supports it, allowing the task's workspace and `$task.branch` to reuse the PR's real source/target branches
   - Transitions the JIRA issue to the variant's `beforeAgent.targetStatus` + posts a start comment (with retry)
   - Creates the task's workspace (`TaskWorkspaceManager`): fetches the profile's clone in `cache/repos/<profileId>`, clones it into `cache/workspaces/<key>-<startTs>` on the base branch and checks out the task branch
   - Starts containers via `docker compose up -d --build` (the profile's compose file, the security overlay and the generated per-task overlay) with the workspace mounted at `/workspace`; the images carry both agent CLIs at the versions `package.json` pins
   - Runs the profile's setup script inside the container (target-repo dependencies, git identity)
   - Loops over the variant's `stages` array, executing each stage sequentially with the executor of its CLI and mode:
     - **Container stages** (`mode: "container"`) — run the CLI inside the agent container via `docker compose exec`
     - **Local stages** (`mode: "local"`) — run the pinned CLI from `node_modules/.bin` on the host, in the stage's own workspace under the task's output directory (`stages/<role>/`)
   - Each stage uses its own agent, CLI, model, skills, and timeout (falling back to profile defaults)
   - A stage must end with the agent's result unless it sets `requireResultBlock: false`: structured output on Claude Code (`--json-schema`), the `===RALPH_RESULT_START===` block on Copilot CLI. A stage that fails or ends without one aborts the pipeline, and the remaining stages are skipped
   - The agent (e.g. Ralph) dispatches research, writing and review subagents, then pushes the branch and creates an ADO PR, posts a JIRA comment and attaches the handoff file through MCP tools that run in the MCP sidecar
7. **Collects results** — `TaskResultWriter` collects the container logs (audit trail, CLI debug logs, session logs, proxy and sidecar logs, artifacts) into `output/logs/`, and `RunArtifactsDeriver` redacts the transcript and derives the Claude Code run telemetry
8. **Attaches** the redacted session transcript to the JIRA issue
9. **Stops** the container and cleans up volumes
10. **Runs post-task hooks** — local-only analysis pipelines declared in the variant's `postTaskHooks`, each stage in its own workspace under `hooks/<hook>/<role>/` (failures never affect the task result)
11. **Deletes the workspace** when the task succeeded; a failed task's workspace stays for inspection and its path is logged
12. **Transitions** the issue to the variant's `afterAgent.targetStatus` on success
13. **Resumes** polling for the next task

## Responsibility Split

| Responsibility                                                          | Owner                                      |
| ----------------------------------------------------------------------- | ------------------------------------------ |
| Poll JIRA, queue issues, dedup                                          | Orchestrator                               |
| Route to matching profile                                               | Orchestrator                               |
| CLI per stage (Claude Code or Copilot CLI), no fallback                 | Config loader → stage executor factory     |
| Stage pipeline execution (sequential, abort-on-fail)                    | TaskRunner                                 |
| JIRA transition to "In Progress" + start comment                        | TaskRunner                                 |
| Container lifecycle (start, exec, stop)                                 | TaskRunner (ContainerManager)              |
| Create executor per stage (container vs local mode)                     | ContainerManager (stage executor factory)  |
| Manage `.git/info/exclude` for bind-mount artifacts                     | TaskRunner (TaskWorkspaceManager)          |
| Create the task's workspace on the task branch, delete it after success | TaskRunner (TaskWorkspaceManager)          |
| Render agent templates (JIT) + resolve MCP macros                       | TaskRunner (ProfileSetupService)           |
| Research, write, review, revise                                         | Ralph and its subagents (inside container) |
| Push branch + create ADO PR (`ado` MCP tools)                           | Ralph (inside container) → MCP sidecar     |
| Post completion comment on JIRA (`jira-kentico` MCP tools)              | Ralph (inside container) → MCP sidecar     |
| Attach handoff.md to JIRA issue (`jira-kentico` MCP tools)              | Ralph (inside container) → MCP sidecar     |
| Post-task hooks (local analysis pipelines)                              | TaskRunner (PostTaskHookRunner)            |
| JIRA transition to `afterAgent.targetStatus`                            | Orchestrator                               |
| Collect audit logs, transcript, proxy access log, save to disk          | TaskResultWriter                           |
| Redact transcripts, derive run telemetry                                | TaskResultWriter (RunArtifactsDeriver)     |
| Attach session transcript to JIRA issue                                 | TaskResultWriter                           |

## Output

After each task, the orchestrator saves:

```
output/
└── logs/
    ├── <key>-<startTs>/                                    # Per-task directory (one per agent run)
    │   ├── <key>-<startTs>-<ts>.log                        # Per-task streaming log (real-time container output)
    │   ├── <key>-<startTs>-cli-debug-stream.log            # The container CLIs' debug logs, streamed while the stages run
    │   ├── <key>-<startTs>-<ts>-audit.jsonl                # Audit trail from Ralph's hooks
    │   ├── <key>-<startTs>-<ts>-pre-tool.log               # Tool invocations logged by the pre-tool hook
    │   ├── <key>-<startTs>-<ts>-tool-output.log            # Untruncated tool output from hooks
    │   ├── <key>-<startTs>-<ts>-proxy.log                  # Squid proxy access log (allowed/denied domains)
    │   ├── <key>-<startTs>-<ts>-sidecar.log                # MCP sidecar gateway output
    │   ├── <key>-<startTs>-<ts>-state.md                   # Agent state file (.ralph/tasks/<key>/state.md)
    │   ├── <key>-<startTs>-<ts>-artifacts/                 # Exported subagent artifacts (.ralph/tasks/<key>/artifacts)
    │   ├── <key>-<startTs>-<ts>-transcript.md              # Redacted session transcript, attached to the work item
    │   ├── <key>-<startTs>-<ts>-claude-cli-debug.log       # Claude Code debug log
    │   ├── <key>-<startTs>-<ts>-claude-sessions/           # Raw Claude Code session logs (main threads and subagents, JSONL)
    │   ├── <key>-<startTs>-<ts>-claude-run-telemetry.json  # Claude Code spans, tool calls, durations and errors, derived from the session logs
    │   ├── <key>-<startTs>-<ts>-claude-transcript.md       # Claude Code transcript, when Copilot's own transcript holds transcript.md
    │   ├── <key>-<startTs>-<ts>-cli-debug.log              # Copilot CLI debug log
    │   ├── <key>-<startTs>-<ts>-session-state/             # Exported Copilot CLI session state
    │   ├── <key>-<startTs>-<ts>-session-db                 # Exported Copilot CLI session store
    │   ├── <key>-<startTs>-<ts>-summary.json               # Execution metadata: status, failure category and reason, CLI error, session ids
    │   ├── stages/<role>/                                  # Host workspace of a mode "local" stage: work/ (cwd), home/ (CLI home), logs/
    │   ├── hooks/<hook-name>/                              # Post-task hook output (hook.outputDir)
    │   │   ├── artifacts/                                  # Artifacts shared by the hook's stages
    │   │   └── <role>/                                     # Host workspace of each hook stage: work/, home/, logs/
    │   └── hook-manifest.json                              # Hook replay manifest (only when skip_hooks param is set)
    ├── activity-YYYY-MM-DD.log                             # Persistent activity log (all sessions)
    ├── container-YYYY-MM-DD.log                            # Persistent container output log
    └── history/
        └── <dataSource>/
            └── <key>.json                                  # Operation ledger (per data source, per issue)
```

A task gets the files of the CLIs its container stages run: `claude-*` and the Claude Code `transcript.md` for Claude Code, `cli-debug.log`, `session-state/`, `session-db` and Copilot's own `transcript.md` for Copilot CLI. A host stage's `logs/` holds its CLI's debug log (`claude.log` for Claude Code, `cli-debug/` for Copilot CLI); a Claude Code host stage also writes Ralph's audit files there, and its settings file is `<role>/claude-settings.json`.

Repositories and workspaces live under `cache/` (git-ignored):

```
cache/
├── trigger-cache.json                                # Last-seen `updated` timestamp per issue
├── repos/<profileId>/                                # The orchestrator's bare clone of the profile's repoUrl
└── workspaces/<key>-<startTs>/                       # A task's own clone, mounted at /workspace; kept only when the task failed
```

A failed task's workspace stays until you delete it, so you can inspect what the agent left behind.

Each task gets its own timestamped directory (`<key>-<startTs>/`). Collected files are named `<key>-<startTs>-<collectTs>-<sourceId>.<ext>`; in multi-stage pipelines each container stage's logs are also collected after it ends, with the stage role inserted before the source ID (`<key>-<startTs>-<collectTs>-<role>-<sourceId>.<ext>`). The per-task log streams container output in real-time — if the agent crashes mid-run, partial output is available immediately. The activity log (`activity-YYYY-MM-DD.log`) and container output log (`container-YYYY-MM-DD.log`) persist across tasks and restarts. Handoff files are attached to the JIRA issue by Ralph directly.

What is scrubbed of credentials, and where:

- **Audit hooks.** Ralph's hooks scrub every record they write (`audit.jsonl`, `pre-tool.log`, `tool-output.log`, `ralph.log`) with `shared/hooks/lib/redact.pl`, against the credentials in their own environment: the container's, or a Claude Code host stage's.
- **Transcripts.** Once a task returns a result, whatever its status, `RunArtifactsDeriver` scrubs in place every transcript a CLI wrote itself (Copilot's `transcript.md`, a stage's `<role>-transcript.md`), and writes the transcript it renders from the Claude Code session logs already scrubbed. It runs the same script with the orchestrator's environment, which holds every secret from `.env`, so the host needs perl. Only then is `transcript.md` attached to the JIRA issue. A transcript that cannot be scrubbed is not attached, and stays on disk as the CLI wrote it.
- **Nothing else.** The `claude-sessions/` export, Copilot's `session-state/` and `session-db`, the debug logs, the proxy and sidecar logs, `state.md`, `artifacts/`, the per-task and daily logs, and the summary's `stderr` and `agentText` hold what the CLIs and agents wrote, unscrubbed.
- **A task that throws.** When a phase throws instead of returning a result (the containers or the setup script fail, a stage cannot start its CLI), the orchestrator only collects the logs: no transcript is scrubbed, rendered or attached, and no summary is written. Copilot's own transcript then stays in `output/` unscrubbed.

The local dashboard's Logs tab (`npm run dashboard`) lists each task directory as one run, with the summary's failure reason, CLI error, agent text and a warning for sessions Ralph's hooks did not run in. Its Timeline reads a Claude Code run's subagents and call durations from the run telemetry, and says that token and context-window charts are not available for Claude Code runs, since the telemetry records no token usage.

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

| Path               | Contents                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `src/`             | Orchestrator source (TypeScript, ESM)                                                        |
| `tests/`           | Vitest tests                                                                                 |
| `profiles/<id>/`   | Agent profiles: `profile.json`, Dockerfile, compose file, setup script, agent templates      |
| `shared/`          | Security overlay, audit hooks, agent includes, skills, MCP servers, MCP sidecar              |
| `scripts/`         | Operator and debugging scripts (`npm run validate`, `npm run agent`, `reset-testenv:*`, …)   |
| `dashboard-local/` | Local Vite dashboard for browsing Claude Code and Copilot CLI run logs (`npm run dashboard`) |
| `ralph-dashboard/` | Status dashboard (Next.js, receives heartbeats)                                              |
| `ralphchives/`     | Ralphchives knowledge base stack (NodeBB, Neo4j, sync)                                       |
| `docs/`            | User guide, design docs, research notes                                                      |
| `containment/`     | Quarantined archive of material unrelated to this project. Not part of the product.          |

## Verified JIRA API Endpoints

| #   | Endpoint                                   | Verified |
| --- | ------------------------------------------ | -------- |
| 1   | `GET /rest/api/3/issue/{key}`              | ✅       |
| 2   | `POST /rest/api/3/issue/{key}/comment`     | ✅       |
| 3   | `POST /rest/api/3/issue/{key}/attachments` | ✅       |
| 4   | `GET /rest/api/3/issue/{key}/transitions`  | ✅       |
| 5   | `GET /rest/api/3/search/jql`               | ✅       |
