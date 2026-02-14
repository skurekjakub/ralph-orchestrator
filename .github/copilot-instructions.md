## Project Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It polls JIRA for issues, starts Docker containers, runs an AI meta-agent inside them, and collects results.

## Architecture

```
JIRA poller → in-memory queue → container lifecycle → log collection
                                       ↓
                              docker compose exec <cli>
                                  (copilot | claude)
                                       ↓
                              ralph meta-agent (subagents: tech-writer, reviewer)
                                       ↓
                              git push + ADO PR via REST API
```

**One task at a time.** The orchestrator processes a single JIRA issue before moving to the next.

## Key Components

| File | Purpose |
|---|---|
| `src/index.tsx` | Entry point — wires orchestrator + Ink terminal dashboard |
| `src/orchestrator.ts` | Main loop: dequeue → profile routing → JIRA transition → container exec → collect results |
| `src/orchestrator-types.ts` | Types for orchestrator state, log entries, and completed tasks |
| `src/queue.ts` | In-memory FIFO queue with deduplication (revision-aware) |
| `src/config.ts` | Loads `config.json` + `.env` secrets |
| `src/logger.ts` | Logger interface — all components route logs through the orchestrator |
| `src/jira/client.ts` | JIRA REST API v3 client (search, comment, transition, attachments) |
| `src/jira/poller.ts` | Polls JQL on interval, pushes to queue, deduplicates across multiple JQL queries |
| `src/jira/jql-builder.ts` | Auto-generates JQL queries from profile match rules (projects, keywords, statuses, revisionStatuses) |
| `src/jira/field-extractor.ts` | Extracts and normalizes JIRA custom fields (ADF, {value} wrappers, strings) |
| `src/container/manager.ts` | Container lifecycle orchestration (start, exec, collect logs, stop); CLI selection |
| `src/container/compose-client.ts` | Low-level docker compose wrapper (process spawning, env injection) |
| `src/container/copilot-executor.ts` | Copilot CLI execution inside containers (streaming, timeout, process tracking) |
| `src/container/claude-code-executor.ts` | Claude Code CLI execution inside containers (streaming, timeout, process tracking) |
| `src/container/types.ts` | Container types (CliExecutor interface, ContainerExecResult, RalphResult, CliType) |
| `src/container/prompt.ts` | Builds CLI prompt from JIRA issue fields; embeds revision context (comments + handoff) |
| `src/container/result-parser.ts` | Parses structured result blocks from CLI stdout |
| `src/services/activity-log.ts` | Persistent activity log writer (append-only JSONL to disk) |
| `src/services/heartbeat.ts` | Optional heartbeat sender to the Vercel status dashboard |
| `src/services/profile-router.ts` | Matches JIRA issues to agent profiles by project/keyword/status; returns `{ profile, isRevision }` |
| `src/services/task-runner.ts` | Processes a single issue: JIRA transitions → container exec → result collection → error/review transitions |
| `src/logs/collector.ts` | Saves execution summaries to `output/` |
| `src/util/path.ts` | Shared path resolution utility |
| `src/validate.ts` | Config validation (profile overlaps, compose file existence) |
| `src/retry.ts` | Generic retry with exponential backoff |
| `src/dashboard/*.tsx` | Ink (React for terminal) dashboard components (App, StatusPanel, QueuePanel, HistoryPanel, LogPanel) |
| `ralph-dashboard/` | Next.js status dashboard (Vercel + Upstash Redis) — multi-agent, auto-refreshing |

## Commands

- `npm run dev` — Run in development mode (tsx)
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled output
- `npm test` — Run tests (vitest)
- `npm run lint` — Type-check without emitting

## Docker Compose

Containers are managed via `docker compose` directly — no devcontainer CLI.
All Docker infrastructure (Dockerfiles, compose files, setup scripts, agent definitions) lives in the orchestrator repo under `profiles/<profile-id>/`. Target repos are mounted at `/workspace` via `TARGET_REPO_PATH`.

```bash
# Starting the containers (compose file is in the orchestrator repo)
docker compose -f profiles/ralph-docs/docker-compose.yml up -d --build 2>&1

# Running the setup script
docker compose -f profiles/ralph-docs/docker-compose.yml exec --user vscode app /usr/local/bin/setup.sh 2>&1

# Executing a command inside the container
docker compose -f profiles/ralph-docs/docker-compose.yml exec --user vscode app <command>

# Stopping the containers
docker compose -f profiles/ralph-docs/docker-compose.yml down --volumes --remove-orphans
```

No piping to `head` or `tail` — always show full output.

## Configuration

- `config.json` — Runtime config (polling interval, agent profiles with match rules and CLI preference, dashboard toggle). JQL queries are auto-generated from profile match rules by `src/jira/jql-builder.ts`
- `.env` — Secrets (JIRA token/email, GitHub PAT, Anthropic API key, ADO PATs, dashboard URL/secret)
- See `.env.example` for required variables
- See `CONFIGURATION.md` for the full configuration reference

### Agent Profiles

The `profiles` array in `config.json` maps JIRA issues to repos/agents. Each profile has:
- `id` — unique identifier
- `repo` — path to the target repository
- `composeFile` — path to docker-compose.yml relative to orchestrator root (defaults to `profiles/<id>/docker-compose.yml`)
- `agent` — Copilot CLI agent name (used with Copilot CLI)
- `cli` — `"copilot"` (default) or `"claude"` — which CLI to use for agent execution. Falls back to the other CLI if the preferred one's credential is missing.
- `model` — optional model override (Copilot defaults to `claude-opus-4.6`; Claude Code uses its own default)
- `timeoutMs` — execution timeout
- `match.projects` — JIRA project keys to match
- `match.keywords` — keywords matched case-insensitively against issue summary (empty = catch-all)
- `match.statuses` — only match issues in these JIRA statuses (empty = any status)
- `match.revisionStatuses` — statuses that trigger a revision workflow (e.g. `["Defect Found"]`). Issues in these statuses bypass queue dedup so they can be re-processed. Must not overlap with `match.statuses`.
- `transitions.inProgressId` — JIRA transition ID to move an issue to "In Progress"
- `transitions.readyForReviewId` — JIRA transition ID to move an issue to "Ready for Review"
- `transitions.revisionId` — (optional) transition ID for revision pickup; falls back to `inProgressId`

Profiles are evaluated in order; first match wins. Unmatched issues are skipped.

### Dashboard

The `dashboard` section in `config.json` controls heartbeat reporting to the Vercel status dashboard:
- `enabled` — set to `false` to disable heartbeat sending entirely (no network calls)
- `intervalMs` — heartbeat interval in milliseconds (default: 30000)

The dashboard uses **Upstash Redis** (added via the Vercel Marketplace integration) for state storage. Env vars `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are auto-populated by the integration.

Also requires `DASHBOARD_URL` and `DASHBOARD_SECRET` in `.env`. If `enabled` is false or the env vars are missing, no heartbeats are sent.

Each orchestrator generates a fresh UUID on startup (the agent ID). Multiple orchestrators can report to the same dashboard — each gets its own card. Agents are auto-removed after 24h of no heartbeats.

## Conventions

- ESM-only (`"type": "module"` in package.json)
- All imports use `.js` extensions (NodeNext module resolution)
- No JIRA SDK — uses native `fetch` against REST API v3 (cloud endpoint: `api.atlassian.com/ex/jira/{cloudId}`)
- Docker compose for container management — no devcontainer CLI
- `execa` v9 for all subprocess management
- Tests use `vitest` in `tests/` directory
- All components accept a `Logger` interface for centralized log routing
- Copilot CLI defaults to `--model claude-opus-4.6` (configurable via profile `model`)
- Claude Code CLI uses `--dangerously-skip-permissions` (model configurable via profile `model`)
- NEVER REEXPORT, update original imports instead

### Comments

- Only add comments that explain **why** something works a certain way, or document non-obvious behavior and edge cases.
- Never add comments that restate what the code already says (e.g., `// increment counter` above `counter++`).
- Never add comments about previous behavior, iterations, or changelog-style notes (e.g., `// was X, now Y`, `// changed from`).
- Section-separator comments (`// --- Section name ---`) are unnecessary when the code structure is self-evident.
- JSDoc on public interfaces, types, classes, and methods is encouraged.

## Profile Infrastructure

All Docker and agent infrastructure is centralized in the orchestrator repo. Target repos contain no Ralph-specific files.

```
profiles/
  <profile-id>/
    Dockerfile          — Container image definition
    docker-compose.yml  — Services, env vars, volume mounts
    setup.sh            — Post-create setup script (CLI installs, git config)
    agents/             — Copilot CLI agent definitions (.md files)
shared/
  hooks/                — Copilot CLI audit hooks (shared across all profiles)
    log-*.sh            — Hook scripts for session logging
    ralph-audit.json    — Hook configuration
```

Compose files use `TARGET_REPO_PATH` (injected by ComposeClient) to mount the target repo at `/workspace`. Agent files and hooks are overlay-mounted as individual read-only files, preserving non-Ralph agents in the target repo.

Currently configured target repos:
- `kentico-docs-jekyll` — Documentation portal (profile: `ralph-docs`)
- `kentico-docs-autocomplete-vscode` — VS Code extension (profile: `ralph-vscode`)

## JIRA Integration

- Project: **DF**
- JQL filter: auto-generated from profile match rules by `src/jira/jql-builder.ts` — multiple queries supported, results deduplicated by issue key. Both `statuses` and `revisionStatuses` are included in JQL filters.
- On pickup: orchestrator transitions to "In Progress" + posts a start comment
- On revision pickup: orchestrator transitions from revision status (e.g. \"Defect Found\") to \"In Progress\" using profile `transitions.revisionId` (falls back to `transitions.inProgressId`), fetches all JIRA comments + latest `handoff.md` attachment, embeds them in the prompt
- On completion: **Ralph itself** posts a completion comment + attaches the handoff file to the JIRA issue
- On error: orchestrator posts an error comment; the issue stays in "In Progress" for human review
- Auth: Basic (`email:apiToken`)
- API base: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`
- Search endpoint: `/rest/api/3/search/jql` (the old `/search` is deprecated)

### Revision Workflow

When a JIRA issue is in a `revisionStatuses` status (e.g. "Defect Found"), the orchestrator:
1. Matches the profile with `isRevision=true` (via `ProfileRouter`)
2. Bypasses queue dedup so the issue can be re-processed
3. Fetches all JIRA comments (ADF → plain text) and downloads the latest `handoff.md` attachment
4. Builds a revision-aware prompt with `Mode: REVISION` header, embedded comments, and handoff content
5. The agent follows its Revision Workflow instead of the Standard Workflow
6. After completion, the orchestrator transitions to "Ready for Review" as usual

## Output

After each task, the orchestrator collects:
- `output/logs/<key>-<timestamp>.jsonl` — Full audit trail from hooks
- `output/logs/<key>-<timestamp>-copilot.log` — Full CLI stdout/stderr
- `output/logs/<key>-<timestamp>-summary.json` — Execution metadata
- `output/logs/activity-YYYY-MM-DD.log` — Persistent activity log (all sessions, never truncated)

Handoff files are attached to the JIRA issue by Ralph directly (not saved locally).

## Agent Workflow Rules

**After completing any task, always use `ask_questions` to prompt for the next task.** See `.github/copilot-agent-instructions.md` for details. This is mandatory — never end a turn without it.
