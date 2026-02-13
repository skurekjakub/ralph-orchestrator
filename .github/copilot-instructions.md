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
| `src/orchestrator.ts` | Main loop: dequeue → JIRA transition → container exec → collect → JIRA comment |
| `src/queue.ts` | In-memory FIFO queue with deduplication |
| `src/config.ts` | Loads `config.json` + `.env` secrets |
| `src/jira/client.ts` | JIRA REST API v3 client (search, comment, transition) |
| `src/jira/poller.ts` | Polls JQL on interval, pushes to queue |
| `src/container/manager.ts` | Devcontainer lifecycle (start, exec, collect logs/handoff, stop) |
| `src/logs/collector.ts` | Saves execution summaries to `output/` |
| `src/dashboard/*.tsx` | Ink (React for terminal) dashboard components |

## Commands

- `npm run dev` — Run in development mode (tsx)
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled output
- `npm test` — Run tests (vitest)
- `npm run lint` — Type-check without emitting

## Configuration

- `config.json` — Runtime config (JQL query, polling interval, timeouts)
- `.env` — Secrets (JIRA token/email, GitHub PAT, ADO PATs, path to Ralph repo)
- See `.env.example` for required variables

## Conventions

- ESM-only (`"type": "module"` in package.json)
- All imports use `.js` extensions (NodeNext module resolution)
- No JIRA SDK — uses native `fetch` against REST API v3
- Devcontainer CLI invoked via `npx @devcontainers/cli` (local dep, not global)
- `execa` v9 for all subprocess management
- Tests use `vitest` in `tests/` directory

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
- JQL filter: issues with "Ralph" in title, status = "New"
- On pickup: transition to "In Progress" + comment
- On completion: comment with status + PR link
- Auth: Basic (`email:apiToken`)

## Output

After each task, the orchestrator collects:
- `output/logs/<key>-<timestamp>.jsonl` — Full audit trail from hooks
- `output/logs/<key>-<timestamp>-summary.json` — Execution metadata
- `output/handoffs/<key>/handoff.md` — Context handoff from the meta-agent
