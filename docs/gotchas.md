# Gotchas

> **Adapt me.** Hard-won lessons agents should re-read when a symptom matches:
> one heading per trap, the symptom first, then the cause and the fix. The
> `rubber-duk-*` agents read this file before reviewing or building.

## `npm run dev` is not a smoke test

**Symptom:** a "quick check" posts JIRA comments, transitions issues, resets a
target repo or starts Docker stacks.
**Cause:** `npm run dev` (and `npm start`) is the real orchestrator: it polls
live JIRA, rebuilds MCP servers, runs `git fetch/checkout/reset --hard` in the
profile repos, lets agents push branches and open PRs, and writes
`cache/trigger-cache.json` and `output/`.
**Fix:** verify with `npm test` or `npx vitest run <file>`; for UI, use
`npm run dashboard` (reads `output/logs/` only). Run `dev`, `start`,
`npm run agent` or `reset-testenv` only when the user asks (AGENTS.md
§ Commands).

## A broken script passes `npm test`

**Symptom:** `npm test` is green, then `npx tsx scripts/<name>.ts` fails on a
type or import error.
**Cause:** `scripts/` is outside both tsconfigs (`tsconfig.json` includes
`src/**`, `tests/tsconfig.json` includes `tests/**`) and is in the ESLint
`ignores` list.
**Fix:** run the script you touched (only if it is side-effect free) or
type-check it by hand; scripts that import `src/` break silently when `src/`
changes.

## Edits under `.build/` disappear

**Symptom:** a change to a rendered agent, skill, `gateway.json`, overlay
compose file or `squid.conf` is gone after the next task.
**Cause:** `profiles/*/.build/` is generated (and gitignored);
`ProfileSetupService` re-renders it every task and every stage.
**Fix:** edit the source — `profiles/<id>/agents/*.agent.md`,
`shared/agent-includes/`, `shared/skills/<name>/`, `profile.json` or
`src/container/setup/*`.

## Local stages write into this checkout

**Symptom:** `.ralph/` and `.github/agents/` appear at the repo root, or a
host-side hook reads or edits this repo's files.
**Cause:** `mode: "local"` stages and post-task hooks run the host `copilot`
CLI with cwd = this repo root; `LocalCopilotExecutor` symlinks the rendered
agents into `.github/agents/` and writes `.ralph/` here.
**Fix:** both paths are gitignored — never commit them. Paths in a local-stage
template are host paths relative to this repo, not `/workspace/...`.

## Green root `npm test`, untested change

**Symptom:** a new test never runs, or a dashboard / MCP server change ships
with failing tests.
**Cause:** root `vitest.config.ts` includes only `tests/**/*.test.ts` (a
`.test.tsx` there is ignored) and excludes `dashboard-local/`,
`ralph-dashboard/`, `shared/mcp-servers/` and `ralphchives/`.
**Fix:** name root tests `*.test.ts`; for a sub-project, run its own `lint`,
`test` and `build` inside its directory (CI's `pr-validation.yml` does).

## Replaying an existing trigger comment plans nothing

**Symptom:** re-testing a trigger comment on an issue that already ran
produces no operation, and the scan log counts the issue as "unchanged" or
the trigger as "consumed".
**Cause:** two dedup layers. `TriggerScanner` skips issues whose `updated`
timestamp matches `cache/trigger-cache.json` without fetching comments, and
the operation ledger records each trigger comment id as consumed once per
`variantKey`.
**Fix:** post a new trigger comment (new comment id, new `updated`). To replay
the same comment, clear the issue's entry in `cache/trigger-cache.json` and
its ledger file under `<output.logDir>/history/<dataSource>/`. Ask before
`npm run reset-testenv` — it deletes JIRA comments and remote branches.
