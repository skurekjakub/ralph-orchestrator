## Project Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It polls JIRA for issues, starts Docker containers, runs an AI meta-agent inside them, and collects results.

## Architecture

```
JIRA poller → comment discovery → operation ledger → container lifecycle → log collection
                                       ↓
                              docker compose exec <cli>
                                  (copilot | claude)
                                       ↓
                              ralph meta-agent (subagents: researcher, reviewer)
                                       ↓
                              git push + ADO PR via REST API
```

**Comment-driven.** All agent invocations are triggered by JIRA comments matching a `commentTrigger` string. The orchestrator polls JIRA for issues, scans their comments for triggers, plans operations in a persistent ledger, and executes them one at a time.

**One task at a time.** The orchestrator processes a single operation before moving to the next.

## Key Components

| File | Purpose |
|---|---|
| `src/index.tsx` | Entry point — wires orchestrator + Ink terminal dashboard |
| `src/orchestrator.ts` | Main loop: ledger-driven execution → result recording; uses `createOrchestratorDeps()` factory |
| `src/orchestrator-types.ts` | Types: `OrchestratorState`, `ActiveTask`, `OrchestratorDeps`, `CompletedTask`, `LogEntry` |
| `src/orchestrator-observer.ts` | Builds state snapshots + heartbeat payloads for the Ink dashboard and status API |
| `src/services/operation-ledger.ts` | Persistent per-issue operation history — plans, tracks lifecycle, crash recovery, dedup |
| `src/config.ts` | Loads `config.json` (global settings) + `profiles/*/profile.json` (agent profiles) + `.env` secrets |
| `src/logger.ts` | Logger interface — all components route logs through the orchestrator |
| `src/jira/client.ts` | JIRA REST API v3 client (search with auto-pagination, comment, transition, attachments — both download and upload) |
| `src/jira/poller.ts` | Polls JQL on interval, pushes to queue, deduplicates across multiple JQL queries |
| `src/jira/jql-builder.ts` | Auto-generates JQL queries from profile match rules (projects, statuses) |
| `src/jira/field-extractor.ts` | Extracts and normalizes JIRA custom fields (ADF, {value} wrappers, strings) |
| `src/container/agent-includes.ts` | Resolves include markers in agent template files at startup |
| `src/container/manager.ts` | Container lifecycle orchestration (start, exec, collect logs/transcript, stop); CLI selection |
| `src/container/compose-client.ts` | Low-level docker compose wrapper (process spawning, env injection including `TARGET_REPO_PATH` and `SHARED_HOOKS_PATH`) |
| `src/container/copilot-executor.ts` | Copilot CLI execution inside containers (streaming, timeout, `--share` transcript export) |
| `src/container/claude-code-executor.ts` | Claude Code CLI execution inside containers (streaming, timeout, process tracking) |
| `src/container/stream-capture.ts` | Shared line-buffered streaming capture for child processes (used by both executors and container build/setup) |
| `src/container/types.ts` | Container types (CliExecutor interface, ContainerExecResult, RalphResult, CliType) |
| `src/container/prompt.ts` | Builds CLI prompt from JIRA issue fields; embeds revision context (comments + handoff) |
| `src/container/result-parser.ts` | Parses structured result blocks from CLI stdout |
| `src/services/activity-log.ts` | Persistent activity log writer — daily aggregate logs + per-task streaming logs |
| `src/services/heartbeat.ts` | Optional heartbeat sender to the Vercel status dashboard |
| `src/services/orchestrator-comments.ts` | Centralized JIRA comment templates for orchestrator messages |
| `src/services/preflight.ts` | Named preflight check registry — validates prerequisites before agent execution |
| `src/services/trigger-scanner.ts` | Scans issue comments for trigger strings, plans operations in the ledger, posts ack comments. Caches `updated` timestamps to skip unchanged issues. |
| `src/services/profile-router.ts` | Matches JIRA issues to agent profiles by project/status; validates state before execution |
| `src/services/operation-ledger.ts` | Persistent per-issue operation history — plans, tracks lifecycle, crash recovery, dedup |
| `src/services/task-runner.ts` | Processes a single issue: JIRA transitions → container exec → result/transcript collection |
| `src/logs/collector.ts` | Saves execution summaries to `output/` |
| `src/util/path.ts` | Shared path resolution utility |
| `src/validate.ts` | Config validation (profile overlaps, compose file existence, agent name verification against `.agent.md` files) |
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

- `config.json` — Global settings (JIRA connection, polling interval, output paths, dashboard toggle)
- `profiles/*/profile.json` — Per-profile config with agent variants, repo path, CLI preference, and match rules
- `.env` — Secrets (JIRA token/email, GitHub PAT, Anthropic API key, ADO PATs, dashboard URL/secret)
- See `.env.example` for required variables
- See `CONFIGURATION.md` for the full configuration reference

### Agent Profiles

Each profile directory under `profiles/` contains a `profile.json` that maps JIRA issues to a repo and agent configuration. Profiles are auto-discovered at startup.

**Profile-level fields** (shared by all variants):
- `repo` — path to the target repository
- `cli` — `"copilot"` (default) or `"claude"` — which CLI to use. Falls back to the other CLI if the preferred one's credential is missing.
- `model` — optional model override (Copilot defaults to `claude-opus-4.6`; Claude Code uses its own default). Can be overridden per-variant.
- `timeoutMs` — execution timeout
- `beforeAgent.transitionId` — JIRA transition ID applied before agent execution (e.g. "In Progress")
- `afterAgent.transitionId` — JIRA transition ID applied after successful execution (e.g. "Ready for Review")

**Variant-level fields** (each variant expands into a separate routing entry):
- `agent` — Copilot CLI agent name (must match `<name>.agent.md` file in the profile's `agents/` directory)
- `model` — optional model override (overrides profile-level)
- `match.projects` — JIRA project keys to match
- `match.statuses` — only match issues in these JIRA statuses (empty = any status)
- `match.commentTrigger` — JIRA comment must contain this string (case-insensitive) to trigger the variant. Required for all variants.
- `match.revisionStatuses` — statuses that indicate a revision task (e.g. `["Defect Found"]`). When the issue is in one of these statuses, the agent receives a `Mode: REVISION` prompt with the previous handoff attachment. Empty = never treat as revision.

Variants are evaluated in order (across all profiles). The orchestrator scans all comments on matching issues and plans operations for each unconsumed trigger.

The `agentName` field on `AgentProfile` stores the raw CLI name (e.g. `ralph.ralph`). The `displayName` field strips the `ralph.` prefix for use in JIRA comments and logs (e.g. `ralph`).

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
    profile.json        — Profile config: repo, cli, variants, transitions
    Dockerfile          — Container image definition
    docker-compose.yml  — Services, env vars, volume mounts
    setup.sh            — Post-create setup script (CLI installs, git config)
    agents/             — Agent template files (.agent.md with include markers)
      .build/           — Resolved agent files (generated at startup, gitignored)
shared/
  hooks/                — Copilot CLI audit hooks (shared across all profiles)
    log-*.sh            — Hook scripts for session logging
    ralph-audit.json    — Hook configuration
  agent-includes/       — Shared include files for agent templates
    jira-api.md         — JIRA API curl templates + wiki markup reference
```

Agent template files use `<!-- include: name.md -->` markers that are resolved from `shared/agent-includes/` at orchestrator startup. The resolved files are written to `agents/.build/` and mounted into containers. This eliminates duplication of JIRA API instructions across agent files.

Compose files use `TARGET_REPO_PATH` and `SHARED_HOOKS_PATH` (injected by ComposeClient) for volume mounts. Agent files and hooks are overlay-mounted as individual read-only files, preserving non-Ralph agents in the target repo.

Currently configured target repos:
- `kentico-docs-jekyll` — Documentation portal (profile: `ralph-docs`)
- `kentico-docs-autocomplete-vscode` — VS Code extension (profile: `ralph-vscode`)

## JIRA Integration

- Projects: **DF**, **DOC**
- JQL filter: auto-generated from profile match rules by `src/jira/jql-builder.ts` — uses projects + statuses, results deduplicated by issue key. Search auto-paginates (100 per page) to fetch all matching issues.
- **Comment-triggered:** The poller discovers issues via JQL, then the orchestrator scans each issue's comments for `commentTrigger` matches. Unconsumed triggers are planned in the operation ledger.
- On trigger discovery: posts an ack comment ("🤖 Got it! Queueing [agent]...")
- On pickup: applies `beforeAgent` transition (if configured) + runs the agent
- On completion: applies `afterAgent` transition (if configured); **Ralph itself** posts a completion comment + attaches the handoff file
- On error: orchestrator posts an error comment; records error in the ledger
- Auth: Basic (`email:apiToken`)
- API base: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`
- Search endpoint: `/rest/api/3/search/jql` (the old `/search` is deprecated)

### Operation Ledger

The orchestrator maintains a persistent operation ledger (`output/logs/history/<issueKey>.json`) that tracks every agent invocation through its lifecycle:

```
pending → active → completed | error
              ↗
rejected (invalid state, conflict, preflight fail)
```

- **Comment-trigger dedup:** Each trigger comment is consumed exactly once per variant. Repeated triggers on the same comment are ignored.
- **Crash recovery:** On startup, any `active` operations from a previous session are marked as `error`, and a recovery comment is posted to JIRA.
- **State re-validation:** Before executing a pending operation, the orchestrator re-fetches the issue to verify it's still in a valid status. If not, the operation is rejected.
- **Pending operations survive restart:** They're persisted on disk and resumed after recovery.

## Output

After each task, the orchestrator collects:
- `output/logs/<key>-<timestamp>.log` — Per-task streaming log (container output in real-time)
- `output/logs/<key>-<timestamp>.jsonl` — Full audit trail from hooks
- `output/logs/<key>-<timestamp>-transcript.md` — Copilot CLI session transcript (via `--share`)
- `output/logs/<key>-<timestamp>-summary.json` — Execution metadata
- `output/logs/activity-YYYY-MM-DD.log` — Persistent activity log (all sessions, never truncated)
- `output/logs/container-YYYY-MM-DD.log` — Persistent container output log (all sessions)
- `output/logs/history/<issueKey>.json` — Operation ledger per issue (lifecycle, dedup, audit trail)

Session transcripts are also attached to the JIRA issue. Handoff files are attached to the JIRA issue by Ralph directly (not saved locally).

## Agent Workflow Rules

**After completing any task, always use `ask_questions` to prompt for the next task.** See `.github/copilot-agent-instructions.md` for details. This is mandatory — never end a turn without it.
