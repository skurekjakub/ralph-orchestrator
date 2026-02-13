## Project Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It polls JIRA for issues, spins up the Ralph devcontainer, runs an AI meta-agent inside it, and collects results.

## Architecture

```
JIRA poller → in-memory queue → container lifecycle → log collection
                                       ↓
                              devcontainer exec copilot
                                       ↓
                              ralph meta-agent (subagents: tech-writer, reviewer)
                                       ↓
                              git push + ADO PR via MCP
```

**One task at a time.** The orchestrator processes a single JIRA issue before moving to the next.

## Key Components

| File | Purpose |
|---|---|
| `src/index.tsx` | Entry point — wires orchestrator + Ink terminal dashboard |
| `src/orchestrator.ts` | Main loop: dequeue → JIRA transition → container exec → collect results |
| `src/queue.ts` | In-memory FIFO queue with deduplication |
| `src/config.ts` | Loads `config.json` + `.env` secrets |
| `src/logger.ts` | Logger interface — all components route logs through the orchestrator |
| `src/jira/client.ts` | JIRA REST API v3 client (search, comment, transition) |
| `src/jira/poller.ts` | Polls JQL on interval, pushes to queue, deduplicates across multiple JQL queries |
| `src/container/manager.ts` | Devcontainer lifecycle (start, exec, collect logs, stop) |
| `src/logs/collector.ts` | Saves execution summaries to `output/` |
| `src/dashboard/*.tsx` | Ink (React for terminal) dashboard components (App, StatusPanel, QueuePanel, HistoryPanel, LogPanel) |

## Commands

- `npm run dev` — Run in development mode (tsx)
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled output
- `npm test` — Run tests (vitest)
- `npm run lint` — Type-check without emitting

## devcontainer work 

Always interact with the devcontainer via the CLI — never call `docker compose` or `docker exec` directly (except for teardown, since the CLI has no `down` command, and `docker info` for prerequisite checks).

Always invoke the devcontainer CLI via `npx` so that the local `@devcontainers/cli` package is used (it's a devDependency). Never assume a global installation.

```bash
# Starting the container
npx @devcontainers/cli up --workspace-folder ~/repositories/kentico-docs-jekyll --config ~/repositories/kentico-docs-jekyll/.ralph/devcontainer.json 2>&1

# Rebuilding from scratch
npx @devcontainers/cli up --workspace-folder ~/repositories/kentico-docs-jekyll --config ~/repositories/kentico-docs-jekyll/.ralph/devcontainer.json --build-no-cache --remove-existing-container 2>&1

# Executing a command inside the container
npx @devcontainers/cli exec --workspace-folder ~/repositories/kentico-docs-jekyll --config ~/repositories/kentico-docs-jekyll/.ralph/devcontainer.json -- <command>

# Stopping the container (no CLI equivalent — use docker compose directly)
docker compose -f ~/repositories/kentico-docs-jekyll/.ralph/docker-compose.yml down --volumes
```

No piping to `head` or `tail` — always show full output.

## Configuration

- `config.json` — Runtime config (JQL query, polling interval, timeouts)
- `.env` — Secrets (JIRA token/email, GitHub PAT, ADO PATs, path to Ralph repo)
- See `.env.example` for required variables

## Conventions

- ESM-only (`"type": "module"` in package.json)
- All imports use `.js` extensions (NodeNext module resolution)
- No JIRA SDK — uses native `fetch` against REST API v3 (cloud endpoint: `api.atlassian.com/ex/jira/{cloudId}`)
- Devcontainer CLI invoked via `npx @devcontainers/cli` (local dep, not global)
- `execa` v9 for all subprocess management
- Tests use `vitest` in `tests/` directory
- All components accept a `Logger` interface for centralized log routing
- Copilot CLI inside the container always uses `--model claude-opus-4.6`

## The Ralph Ecosystem (external repo)

This orchestrator drives the Ralph devcontainer which lives in the `kentico-docs-jekyll` repo under `.ralph/`. Key pieces there:

- **`.ralph/`** — Devcontainer config, docker-compose, setup scripts
- **`.ralph/hooks/`** — Copilot CLI hooks that log all agent activity to `.ralph/logs/audit.jsonl`
- **`.github/agents/autonomous/ralph.agent.md`** — Meta-agent (orchestrates tech-writer + reviewer)
- **`.github/agents/autonomous/ralph.tech-writer.agent.md`** — Autonomous tech-writer sub-agent
- **`.github/agents/autonomous/ralph.reviewer.agent.md`** — Autonomous reviewer sub-agent
- **`.github/hooks/ralph-audit.json`** — Hook config for Copilot CLI session logging

## JIRA Integration

- Project: **DF**
- JQL filter: `jql` array in `config.json` — multiple queries supported, results deduplicated by issue key
- On pickup: orchestrator transitions to "In Progress" + posts a start comment
- On completion: **Ralph itself** posts a completion comment + attaches the handoff file to the JIRA issue
- Auth: Basic (`email:apiToken`)
- API base: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`
- Search endpoint: `/rest/api/3/search/jql` (the old `/search` is deprecated)

## Output

After each task, the orchestrator collects:
- `output/logs/<key>-<timestamp>.jsonl` — Full audit trail from hooks
- `output/logs/<key>-<timestamp>-summary.json` — Execution metadata

Handoff files are attached to the JIRA issue by Ralph directly (not saved locally).
