# Local Testing & Development

Tools for testing agent profiles, validating configuration, and debugging locally without running the full orchestrator loop.

## Quick Reference

| Command                                    | Purpose                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `npm run agent <trigger> "<prompt>"`       | Run a variant's first stage with a direct prompt                          |
| `npm run dev`                              | Start the full orchestrator (polls JIRA, processes triggers)              |
| `npm run validate`                         | Validate env vars, config, profiles, skills, security, Docker, host tools |
| `npm test`                                 | Lint (type-check, eslint, prettier) + build + run all Vitest tests        |
| `npx tsx scripts/reset-issue.ts [KEY]`     | Reset a JIRA issue to clean "To Do" state                                 |
| `npx tsx scripts/run-hooks.ts <outputDir>` | Replay a task's post-task hooks from its `hook-manifest.json`             |

## Run Agent Locally

Run a variant's first stage in its full container environment (app + MCP sidecar + egress proxy) with a direct prompt, bypassing JIRA entirely. It uses live MCP credentials, so the agent can push, comment and open PRs as in a real run.

```bash
npm run agent @RalphAutocomplete "Explain the project structure"
npm run agent @MalphAutocomplete "Review the latest changes"
```

**What it does:**

1. Runs the startup pipeline (validates prerequisites, builds MCP servers, generates per-profile configs)
2. Finds the variant matching the trigger string (case-insensitive)
3. Renders the variant's agents, skills, compose overlay and JIT MCP config as a task does
4. Creates a workspace from the profile's `repoUrl` at `cache/workspaces/local-run-<timestamp>/`, on a local branch `local-run-<timestamp>` from `main`
5. Starts the full Docker stack, prepares the CLI homes and clean paths, registers the log sources and runs the profile's setup script
6. Runs the first stage's CLI, Claude Code or Copilot, on the prompt as given, without the task prompt template, continuations or the result contract
7. Collects logs to `output/logs/local-run-<timestamp>/`
8. Tears down all containers and keeps the workspace

**Requirements:** Same as the full orchestrator — Docker running, `.env` configured with the credentials of the stage's CLI, and the profile's `repoUrl` reachable with its `repoPat`.

**Tips:**

- Use a short prompt that asks for the MCP tools the agent sees for quick infrastructure validation (sidecar health, tool filtering)
- All logs (local and JIRA) are saved in timestamped folders: `output/logs/<key>-<timestamp>/`
- The script exits after the single run — no polling loop
- Local stages and post-task hooks do not run; replay hooks with `scripts/run-hooks.ts`

## Validate Configuration

Run all startup validation checks without starting the orchestrator:

```bash
npm run validate
```

Checks: environment variables (including the credential of every CLI a stage runs), `config.json` schema, profile.json files (repo PAT, variants, compose files, agent templates and graphs, stage CLIs and models, skills, MCP servers), runtime skill frontmatter, security infrastructure (compose files, squid config, no docker.sock mounts), the Docker daemon, and host tools: `perl` for transcript redaction, `jq` and the pinned CLI in `node_modules/.bin` for host stages.

## Reset Test Issue

Reset a JIRA issue and all local state to a clean "To Do" state for re-testing:

```bash
npx tsx scripts/reset-issue.ts           # resets DOC-3143 (default)
npx tsx scripts/reset-issue.ts DOC-3122  # resets a specific issue
npx tsx scripts/reset-issue.ts --hard --trigger   # harder task description, then post "@Ralph"
```

The `npm run reset-testenv[:medium|:hard|…]` scripts run it with a difficulty flag, which picks the description the issue is reset to.

**What it cleans:**

- JIRA: deletes all comments and attachments, resets fields, transitions to "To Do"
- Local: clears the issue's operation ledger under every data source, its trigger-cache entry and its `output/logs/<KEY>-*` folders
- Git: deletes the **remote** `ralph/<KEY>*` branches on the ralph-docs `repoUrl` and the issue's workspaces under `cache/workspaces/`
- Docker: removes orphaned containers of the `ralph-sandbox` compose project

## Unit Tests

```bash
npm test              # lint + build + run all tests
npm run test:watch    # watch mode (re-runs on file changes)
```

Tests use Vitest with ESM mode. Shared test factories are in `tests/helpers/factories.ts` (data) and `tests/helpers/mocks.ts` (service mocks). The audit-hook tests in `tests/hooks/` run the `shared/hooks/` scripts, so `npm test` needs `bash`, `jq` and `perl` on the PATH.

## Replay Post-Task Hooks

```bash
npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974
npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974 --hook run-analysis
```

Replays the hooks a task saved in `<outputDir>/hook-manifest.json` (written instead of running them when the trigger had `skip_hooks`) through the same `PostTaskHookRunner` a task uses: each stage in its own workspace under `<outputDir>/hooks/<hook>/`, on the host, with the stage's CLI from `node_modules/.bin`.

## Full Orchestrator (Dev Mode)

```bash
npm run dev
```

Starts the full orchestrator loop with the Ink terminal dashboard. Polls JIRA, scans for triggers, processes operations. Use this when testing the end-to-end flow with real JIRA issues.

Press `Ctrl+C` for graceful shutdown (stops the active task's containers and waits for their teardown). Press twice to force-exit.
