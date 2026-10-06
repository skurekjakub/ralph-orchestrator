# Local Testing & Development

Tools for testing agent profiles, validating configuration, and debugging locally without running the full orchestrator loop.

## Quick Reference

| Command                                | Purpose                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `npm run agent <trigger> "<prompt>"`   | Run a single agent variant with a direct prompt              |
| `npm run dev`                          | Start the full orchestrator (polls JIRA, processes triggers) |
| `npm run validate`                     | Validate env vars, config, profiles, Docker, security        |
| `npm test`                             | Type-check + build + run all Vitest tests                    |
| `npx tsx scripts/reset-issue.ts [KEY]` | Reset a JIRA issue to clean "To Do" state                    |

## Run Agent Locally

Run a single agent variant in its full container environment (app + MCP sidecar + egress proxy) with a direct prompt, bypassing JIRA entirely.

```bash
npm run agent @McpProbe "List all available MCP tools"
npm run agent @RalphAutocomplete "Explain the project structure"
npm run agent @MalphAutocomplete "Review the latest changes"
```

**What it does:**

1. Runs the startup pipeline (validates prerequisites, builds MCP servers, generates per-profile configs)
2. Finds the variant matching the trigger string (case-insensitive)
3. Starts the full Docker stack (`docker compose up -d --build`)
4. Prepares the workspace (config dirs, clean paths)
5. Runs the setup script (CLI installs, git config)
6. Executes the agent CLI with the prompt
7. Collects logs (audit, transcript, proxy, sidecar) to `output/logs/local-run-<timestamp>/`
8. Tears down all containers

**Requirements:** Same as the full orchestrator — Docker running, `.env` configured, target repo cloned.

**Tips:**

- Use `@McpProbe` with a simple prompt for quick infrastructure validation (sidecar health, MCP tool availability)
- The `mcp-probe` variant uses `claude-sonnet-4` to avoid consuming premium requests
- All logs (local and JIRA) are saved in timestamped folders: `output/logs/<key>-<timestamp>/`
- The script exits after the single run — no polling loop

## Validate Configuration

Run all startup validation checks without starting the orchestrator:

```bash
npm run validate
```

Checks: environment variables, `config.json` schema, profile.json files, Docker daemon, security infrastructure (compose files, squid config, no docker.sock mounts).

## Reset Test Issue

Reset a JIRA issue and all local state to a clean "To Do" state for re-testing:

```bash
npx tsx scripts/reset-issue.ts           # resets DOC-3143 (default)
npx tsx scripts/reset-issue.ts DOC-3122  # resets a specific issue
```

**What it cleans:**

- JIRA: deletes all comments and attachments, resets fields, transitions to "To Do"
- Local: clears operation ledger for the issue, trigger cache, log files
- Git: deletes `ralph-*` branches in the target repo
- Docker: removes orphaned containers from previous runs

## Unit Tests

```bash
npm test              # lint + build + run all tests
npm run test:watch    # watch mode (re-runs on file changes)
```

Tests use Vitest with ESM mode. Shared test factories are in `tests/helpers/factories.ts` (data) and `tests/helpers/mocks.ts` (service mocks).

## Full Orchestrator (Dev Mode)

```bash
npm run dev
```

Starts the full orchestrator loop with the Ink terminal dashboard. Polls JIRA, scans for triggers, processes operations. Use this when testing the end-to-end flow with real JIRA issues.

Press `Ctrl+C` for graceful shutdown (finishes current task, tears down containers).
