# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. 


## Root Cause


No quick fixes. Always diagnose to the root cause and devise proper solutions. Never apply patches or workarounds unless the user explicitly asks.


---


## Security & Secrets


- Never hardcode secrets or commit them to git
- Use separate API tokens/credentials for dev, staging, and prod environments
- Validate all input server-side — never trust client data
- Add rate limiting on auth and write operations


## Architecture & Code Quality


- Design architecture before building — don't let it emerge from spaghetti
- Break up large view controllers/components early
- Wrap external API calls in a clean service layer (easier to cache, swap, or extend later)
- Version database schema changes through proper migrations
- Use real feature flags, not commented-out code


## Observability


- Add crash reporting from day one
- Implement persistent logging (not just console output)
- Include a `/health` endpoint for every service


## Environments & Deployment


- Maintain a real staging environment that mirrors production
- Set CORS to specific origins, never `*`
- Set up CI/CD early — deploys come from the pipeline, not a laptop
- Document how to run, build, and deploy the project


## Testing & Resilience


- Test unhappy paths: network failures, unexpected API responses, malformed data
- Test backup restores at least once — don't wait for an emergency
- Don't assume the happy path is sufficient


## Time Handling


- Store all timestamps in UTC
- Convert to local time only on display


## Discipline


- Fix hacky code now or create a tracked ticket with a deadline — "later" never comes
- Don't skip fundamentals just because the code compiles and runs

## Commands

```bash
npm run dev          # Run with tsx (no build step, for development)
npm run build        # rm -rf dist && tsc
npm start            # validate + build + run dist/index.js
npm run lint         # tsc --noEmit (src + tests) + eslint
npm test             # lint + build + vitest run
npm run test:watch   # vitest watch mode (no lint/build)
npm run validate     # Pre-start env/config/Docker/profile/security checks
```

To run a single test file:
```bash
npx vitest run tests/services/task-runner.test.ts
```

## Architecture

Ralph Orchestrator autonomously processes JIRA documentation tasks by polling for issues, routing them to agent profiles, spinning up isolated Docker containers, running AI CLIs (GitHub Copilot or Claude Code) inside them, then collecting results and transitioning JIRA issues.

```
JIRA poller → comment trigger scan → operation ledger → profile router
                                                              ↓
                                            task runner: JIRA transition → container lifecycle → task result writer
                                                              ↓
                                                  docker compose exec <copilot|claude>
                                                              ↓
                                                  JIRA transition + comment + attachment
```

**One operation at a time.** The main loop awaits a `workSignal` (event-driven, no polling loop) and processes one task before fetching the next.

### Dependency Injection

Every service has an `I`-prefixed interface in the same file (e.g., `IJiraClient` in `src/datasource/connectors/jira/jira-client.ts`). All consumers depend on interfaces, never classes. **Only `src/awilix-cradle.ts` imports concrete classes** — this is the sole composition root (awilix `InjectionMode.PROXY`, `strict: true`). Configuration is injected as individual **config slices** (`jiraConfig`, `outputConfig`, `profiles`, etc.) rather than a monolithic config object. Tests use `Mocked<IInterface>` for structurally-typed mocks without `as any`.

### Container Lifecycle — Three-File Compose Merge

```
profiles/<id>/docker-compose.yml          (base: services, volumes, env)
+ shared/security/docker-compose.security.yml  (Squid proxy, network isolation, resource limits)
+ profiles/<id>/.build/docker-compose.overlay.yml  (MCP sidecar, skill mounts, resource mounts — generated at startup)
```

`ComposeClient` merges all three automatically via `-f` flags. The overlay is skipped if absent.

### Agent Templates — JIT Rendering

Agent templates live in `profiles/<id>/agents/*.agent.md` (Liquid syntax). Shared partials are in `shared/agent-includes/*.md` (supports subdirectories, e.g. `personality/ralph`, `ralph-docs/ralph-standard-workflow`). Before each task, `AgentTemplateRenderer` (`src/container/setup/agent-includes.ts`) renders templates with a `TemplateContext` containing profile metadata, task fields (including description, created, updated), trigger metadata (`commentTrigger`, `triggerParams`), runtime flags (`isRevision`), and stage context (`stageRole`, `stageMode`, `stageIndex`, `stageCount`, `isLastStage`, `stageSkills`), writing output to `profiles/<id>/.build/`. The `triggerParams` (`Record<string, string>`) maps bare params to `"true"` and key-value params to the value — built by `buildTriggerParams()` in the same module. These files are mounted read-only into the container.

Custom Liquid tags: `{% section "name" %}...{% endsection %}` wraps content in `<name>...</name>` XML boundaries.

### MCP Servers — Least-Privilege

Each profile declares `mcpServers` in `profile.json`. This drives three things simultaneously:
- **Tools:** Agent only sees tools from declared servers
- **Network:** MCP sidecar has unrestricted direct internet access via `ralph-sidecar-external`; agent's Squid allowlist is restricted to AI providers + package registries
- **Credentials:** MCP secrets go into `gateway.json` inside the sidecar — agent container gets URL-only `mcp-config.json`

MCP sidecar uses `supergateway` to bridge stdio servers to Streamable HTTP.

Available servers: `ado`, `jira-kentico`, `discord-hitl`, `playwright`, `web-fetch`, `microsoft-docs`, `ralphchives-write`, `ralphchives-read`.

### Task-Scoped Parameters (JIT)

Profile `mcpServers` entries can include `env` blocks with per-server environment variables. Values starting with `$` are runtime macros (`$task.id`, `$task.project`, `$task.branch`, `$task.title`) resolved per-task from the JIRA issue. `$trigger.<key>` macros resolve trigger parameter values from the JIRA comment (e.g. `$trigger.branch` resolves from `@RalphDf(branch=feature-xyz)`; returns empty string if missing). `$variantEnv.PREFIX` macros construct a variant-specific env var name as `PREFIX_PROFILEID_DISPLAYNAME` (uppercase, dashes→underscores) and resolve it from `process.env` — enabling per-variant secrets like API tokens (e.g. `$variantEnv.NODEBB_TOKEN` → `NODEBB_TOKEN_RALPH_DOCS_RALPH`). Before each task, `JitMcpConfigWriter` resolves macros and injects all env values into `gateway.json`. Servers declare `requiredConfig` in their manifest — validated at startup against profile configs. The MCP server reads env vars at startup and conditionally removes parameters from tool schemas, simplifying the agent's interface.

### Operation Ledger

Persistent per-issue state machine at `output/logs/history/<issueKey>.json`. State flow: `pending → active → completed | error | rejected`. Enables crash recovery (active operations from crashed sessions are marked error on restart) and comment-trigger deduplication (each trigger consumed exactly once per variant).

### Data Source Plugins

Data source connectors are loaded as plugins via dynamic `import()` at startup. Built-in plugins (JIRA) are listed in `BUILTIN_PLUGINS` in `app-startup.ts`; user plugins are specified in `config.plugins`. Each plugin module calls `registerDataSourceFactory(type, factory)` at import time to self-register. `buildDataSourceMaps()` in `src/datasource/registry.ts` instantiates connectors from config using registered factories. See `docs/data-source-registration.md` for the full integration guide.

### Continuation Loop

When `maxContinuations > 0` in `profile.json`, `ContainerManager.execute()` automatically retries if the agent's session ends without the `===RALPH_RESULT_START===` block. Uses CLI `--continue` flag to resume the previous session. Exponential backoff between attempts (5s base, 30s cap). Both `CopilotExecutor` and `ClaudeCodeExecutor` implement `continueSession()`.

### Key Files

| File | Role |
|---|---|
| `src/orchestrator.ts` | Main event loop |
| `src/config/types.ts` | Runtime config interfaces (`IDataSourceConfig`, `IAgentProfile`, `IAppConfig`, etc.) |
| `src/config/schemas.ts` | Zod validation schemas for `config.json` and `profile.json` |
| `src/config/loader.ts` | `loadConfig()` — reads config.json + .env, discovers profiles |
| `src/config/constants.ts` | Shared constants (`DEFAULT_MODEL`) |
| `src/awilix-cradle.ts` | Sole composition root (registers all classes with awilix) |
| `src/app-startup.ts` | Startup pipeline: validate → load config → load plugins → setup profiles |
| `src/services/task-runner.ts` | Single operation executor (4-phase pipeline) |
| `src/services/task-result-writer.ts` | Post-execution: log collection, transcript attach, summary |
| `src/services/task-context.ts` | TaskContext + TaskCallbacks interfaces, buildTaskContext() |
| `src/services/trigger-scanner.ts` | Scans JIRA comments for trigger strings |
| `src/services/operation-ledger.ts` | Persistent per-issue state machine |
| `src/container/manager.ts` | Full container lifecycle + stage-based executor creation |
| `src/container/types.ts` | CLI types, `StageResult`, `deriveStageProfile()` for per-stage profile derivation |
| `src/container/cli-executors/cli-executor-factory.ts` | Factory: `create()` (container) and `createLocal()` (host) executors |
| `src/container/cli-executors/local-copilot-executor.ts` | Host-side CLI executor for `mode: "local"` stages |
| `src/container/setup/agent-includes.ts` | JIT Liquid template renderer |
| `src/container/setup/jit-mcp-params.ts` | JIT task-scoped MCP param injector |
| `src/container/lifecycle.ts` | Pre-execution lifecycle hooks (RepoSyncHook: git exclude + sync) |
| `src/util/branch.ts` | Branch name slugification utility |
| `src/container/setup/profile-setup.ts` | Profile initialization orchestrator |
| `src/datasource/registry.ts` | Data source factory registry (`registerDataSourceFactory`, `buildDataSourceMaps`) |
| `src/datasource/connectors/jira/factory.ts` | JIRA connector factory (self-registers at import time) |

## Conventions

- **ESM-only** (`"type": "module"`). All imports use `.js` extensions (NodeNext resolution).
- **No JIRA SDK** — native `fetch` against REST API v3.
- **`execa` v9** for all subprocess calls (docker, npm, tsx, CLI tools).
- **Never re-export** — update the import site to point to the original source.
- **Comments explain why**, not what. No restatements, no changelog-style notes.
- **JSDoc** on public interfaces, types, classes, and methods.
- Unused variables prefixed with `_`.

## Testing

Tests live in `tests/` mirroring `src/` structure. `tests/helpers/factories.ts` provides pure value constructors (no mocks). Service mocks use `Mocked<IInterface>` for type safety.

Vitest has no config file — it uses defaults. `npm test` runs lint + build + vitest; `npm run test:watch` skips lint/build for faster iteration.

## Profile Structure

```
profiles/<id>/
  profile.json        — repo path, cli (copilot|claude), variants with match rules
  Dockerfile
  docker-compose.yml
  setup.sh
  agents/             — Liquid agent templates (*.agent.md)
  resources/          — Profile-specific files mounted into container
  .build/             — Generated at startup (gitignored): rendered templates, mcp-config.json, gateway.json, overlay compose, squid.conf
shared/
  security/           — Squid proxy compose overlay + base squid.conf
  agent-includes/     — Shared Liquid partials (*.md)
  mcp-servers/<name>/ — mcp-server.json manifest + optional src/dist for custom servers
  mcp-sidecar/          — Gateway container (supergateway process manager, git for push/PR tools)
  skills/             — Shared agent skill folders (mounted per-profile into .github/skills/,
                        excluded from git via .git/info/exclude managed by RepoSyncHook)
```

Profile variants match issues by `projects`, `statuses`, and `commentTrigger`. Each variant contains a `stages` array defining a sequential agent pipeline. The first stage's `agent` determines `agentName`; `displayName` strips the `ralph.` prefix. Stages can run inside Docker (`mode: "container"`) or on the host (`mode: "local"`), with per-stage overrides for agent, model, skills, and timeout. Trigger comments support parenthesized parameters (e.g. `@RalphDf(codesamples, verbose)`) — parsed into `triggerParams` (key-value lookup), available in templates. The `vcsProvider` field (`"ado" | "github"`, default `"ado"`) controls the auth header format used by the repo-sync hook; `repoPat` names the env var holding the git PAT (defaults to `ADO_PAT` for ADO, `GH_TOKEN` for GitHub).

**Bind-mount artifact exclusion.** Docker bind mounts for skills, agent templates, and `.ralph/` create host-side files inside the target repo checkout. The `RepoSyncHook` writes patterns (`.ralph/`, `.github/skills/`, `.github/agents/`) to `.git/info/exclude` before any git operation, preventing these artifacts from blocking checkout, appearing in status, or being staged.

## Output Layout

```
output/logs/
  <key>-<startTs>/          — Per-task directory
    <key>-<ts>.log          — Real-time container output
    <key>-<ts>-audit.jsonl  — Audit trail from hooks
    <key>-<ts>-transcript.md
    <key>-<ts>-proxy.log    — Squid access log
    <key>-<ts>-sidecar.log
    <key>-<ts>-summary.json
  activity-YYYY-MM-DD.log   — Persistent daily activity log
  container-YYYY-MM-DD.log  — Persistent container output log
  history/<issueKey>.json   — Operation ledger
```
