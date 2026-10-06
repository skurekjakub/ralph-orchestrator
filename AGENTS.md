# AGENTS.md

Ralph Orchestrator is a Node.js + TypeScript (ESM) service that turns JIRA comments (e.g. `@RalphDf(codesamples)`) into autonomous agent runs. It polls JIRA, matches comment triggers to profile variants, starts an isolated Docker stack per task (agent container + MCP sidecar + Squid proxy), runs an AI CLI inside it, and reports back to JIRA (transition, comment, transcript attachment). All agent infrastructure lives in this repo; target repos contain no Ralph files.

## Root Cause

No quick fixes. Always diagnose to the root cause and devise proper solutions. Never apply patches or workarounds unless the user explicitly asks.

## Engineering rules

- **Secrets come only from `.env`** (gitignored). MCP credentials go into the sidecar's `profiles/<id>/.build/gateway.json`; the agent container gets the URL-only `mcp-config.json` plus the CLI auth vars in `BASE_CONTAINER_ENV` (`src/container/setup/compose-overlay.ts`). Never add a credential to the agent container env or to a committed file.
- **JIRA content is untrusted input.** Descriptions, comments, attachments and trigger params can be attacker-written. Prompt text goes through `PromptBuilder` (`src/prompt/`: normalizer + injection auditor, `promptAudit.mode`). Anything used as a path, shell argument or compose value must be validated (see `assertSafeItemId` in `src/services/operation-ledger.ts`). `connection.allowedUsers` per data source limits who can trigger.
- **Config is schema-first.** Every `config.json` / `profile.json` key is defined in `src/config/schemas.ts` (zod), typed in `src/config/types.ts`, and mapped in `src/config/loader.ts`. Update `config.json.sample` and `docs/user-guide/` alongside it. Toggle behaviour with real config flags (`enableContinuation`, `promptAudit.mode`, `ralphchives.enabled`, `dashboard.enabled`), never with commented-out code.
- **External systems sit behind a service interface** (`JiraClient`, `VcsSourceClient`, `ComposeClient`) so they can be mocked, retried (`withRetry` in `src/retry.ts`) and swapped.
- **Persistent logging.** Modules doing file I/O, subprocesses, network calls or multi-step orchestration take a `Logger` (`src/logger.ts`) and log progress. The injected logger writes to `<output.logDir>/activity-YYYY-MM-DD.log`. Pure transforms don't log; `consoleLogger` is for tests and scripts only.
- **Timestamps are UTC** (`toISOString()`) in the ledger, logs and summaries. Convert to local time only for display.
- **Test unhappy paths:** JIRA/ADO network failures, non-2xx and malformed API responses, missing or corrupt files (ledger, trigger cache, `.build/`), invalid state transitions, Docker and CLI failures.
- **Fix hacky code now**, or file a tracked issue with a deadline. Don't leave "later" comments.

## Setup

- Node ≥ 24 (`engines`, `.nvmrc`), Docker running, and the target repo cloned at each profile's `repo` path (validation fails otherwise).
- `cp config.json.sample config.json` and `cp .env.example .env` (both gitignored). `npm run setup` = `npm install && npm run validate`.
- Required env: `ADO_PAT`, plus the credential of every CLI a stage runs: `GH_TOKEN` for Copilot, `CLAUDE_CODE_OAUTH_TOKEN` for Claude Code (`ANTHROPIC_API_KEY` with `claudeAuth: "api-key"` in `config.json`). Each profile's `repoPat` variable must be set too. Startup validation (`src/validate/`) enforces these; `loadConfig()` reads unset ones as empty. Each JIRA data source also needs `JIRA_PAT_<KEY>` and `JIRA_EMAIL_<KEY>`, where `<KEY>` is the `dataSources` key uppercased with `-` → `_` (`resolveJiraCredentials` in `src/datasource/connectors/jira/factory.ts`).
- MCP servers read the vars in their manifest's `requiredEnv` (`shared/mcp-servers/<name>/mcp-server.json`). Optional: `ADO_PAT_XPERIENCE`, and `DASHBOARD_URL` + `DASHBOARD_SECRET` for heartbeats. Operator reference: `docs/user-guide/environment-variables.md`.

## Commands

Safe (local only, no external side effects):

```bash
npm run lint         # tsc --noEmit (src + tests) + eslint . + prettier --check . (lint fails on unformatted files)
npm run format       # prettier --write . + eslint --fix (the format-on-edit hook does this per edited file)
npm test             # lint + build + vitest run (CI runs these three gates as separate steps)
npm run test:watch   # vitest watch, no lint/build
npx vitest run tests/services/task-runner.test.ts   # single file
npm run build        # rm -rf dist && tsc
npm run validate     # env/config/profiles/security checks + `docker info`
npm run prompt:vis   # print the agent → include → skill graph (scripts/visualize-agent-graph.ts)
npm run dashboard    # dashboard-local Vite dev server on :3101 (reads output/logs/)
```

Side-effecting. Run these only when the user asks:

| Command                                        | Effect                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`, `npm start`                     | The real orchestrator. It polls live JIRA, posts comments, transitions issues, rebuilds custom MCP servers, starts Docker stacks, runs `git fetch/checkout/reset --hard` in target repos, lets agents push branches and open PRs, and writes `cache/trigger-cache.json` and `output/`. `start` runs validate + build first. |
| `npm run agent <trigger> "<prompt>"`           | `scripts/run-agent.ts`: runs one variant in the full container stack with live MCP credentials.                                                                                                                                                                                                                             |
| `npx tsx scripts/run-hooks.ts <outputDir>`     | Replays post-task hooks from `hook-manifest.json` with the host `copilot` CLI.                                                                                                                                                                                                                                              |
| `npm run reset-testenv[:medium\|:hard\|…]`     | `scripts/reset-issue.ts`: deletes the JIRA issue's comments and attachments, resets fields, transitions it to To Do, deletes local **and remote** `ralph/<KEY>*` branches in the ralph-docs repo, and clears containers, logs and the trigger-cache entry.                                                                  |
| `npm run ralphchives:backup-db`, `:restore-db` | NodeBB backup and restore (`ralphchives/scripts/*.sh`).                                                                                                                                                                                                                                                                     |

`scripts/` is neither type-checked (outside both tsconfigs) nor linted (eslint-ignored), so a broken script only fails when it runs.

## How it works

```
src/index.tsx
  AppStartup.run(): validate → loadConfig → import data-source plugins → [ralphchives stack]
                    → build custom MCP servers + sidecar → resolveAllProfileSetup (profiles/*/.build/)
  createCradle(config) → new Orchestrator(cradle) + DashboardServer (ws :3100) + Ink TUI (src/cli-dashboard/)

Orchestrator loop: one operation at a time; it sleeps until poller.onItems / ledger.onPending fires
  pollers.drain() → TriggerScanner.scan()
      router.matchesProjectAndStatus → commentTrigger match → skip triggers the ledger already consumed
      → allowedUsers check (ledger.reject + comment) → ledger.plan()                       [pending]
  ledger.getAllPending() → executeOperation()
      resolveProfile(variantKey) → refreshIssue → validateStatusMatch → variant `preflight`
      → "revision-ready" preflight when status ∈ revisionStatuses → TaskRunner.run()       [active]
          prepareProfile    ProfileSetupService.prepareForTask (agents, skills, overlay, gateway.json)
          transitionIssue   beforeAgent.targetStatus + start comment
          prepareContainer  rm <repo>/.ralph → compose up → workspace cleaner → setup → RepoSyncHook
          executeAgent      AgentPipelineExecutor: stages in order; stops on a stage error or abort
          collectResults    TaskResultWriter → teardown → postTaskHooks (host, failures ignored)
      → afterAgent.targetStatus → ledger.transition(completed | error)
```

- In code, a **"profile" is one variant.** `loadConfig()` expands each `profiles/<id>/profile.json` into one `IAgentProfile` per variant, keyed by `variantKey` = `<profileId>:<firstStageAgent>:<commentTrigger>`.
- `agentName` is the first stage's `agent`; `displayName` is that name without the `ralph.` prefix.
- Trigger params `@X(a, k=v)` become `triggerParams` (`buildTriggerParams` in `src/container/setup/agent-includes.ts`): a bare param maps to `"true"`, a `k=v` param maps to its value.
- `skip_hooks` writes `hook-manifest.json` instead of running post-task hooks.

## Source map

| Path                                                            | Contents                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                                                          | `index.tsx` entry, `app-startup.ts`, `orchestrator.ts` (+ `-observer`, `-types` enums), `awilix-cradle.ts` + `awilix-cradle-types.ts`, `logger.ts`, `retry.ts`                                                                                                          |
| `src/config/`                                                   | zod `schemas.ts`, `types.ts`, `loader.ts`, `profile-variants.ts` (`resolveProfileVariants`: profile.json → one `IAgentProfile` per variant, shared by loader, validators and profile setup)                                                                             |
| `src/cli/`                                                      | per-CLI knowledge: `ICliRuntime` + `CliRuntimeRegistry` (`cli-runtime.ts`), `copilot/` runtime and container layout, `model-catalog.ts` (model validation, `DEFAULT_COPILOT_MODEL`), `credential-catalog.ts`, interfaces for agent file writers and output decoders     |
| `src/datasource/`                                               | `WorkItem` types, `IDataSourceConnector` + optional capabilities and type guards (`connector.ts`), `IWorkItemPoller`, plugin `registry.ts`                                                                                                                              |
| `src/datasource/connectors/jira/`                               | REST v3 client (native `fetch`), JQL builder, ADF converter, mapper, poller, self-registering `factory.ts`                                                                                                                                                              |
| `src/services/`                                                 | trigger scanner, operation ledger, profile router, task runner, `agent-pipeline-executor.ts`, `profile-setup-service.ts`, result writer, issue/resource managers, `preflight.ts`, VCS PR lookup, activity log, heartbeat, dashboard WebSocket server, comment templates |
| `src/container/`                                                | `manager.ts`, `compose-client.ts`, `lifecycle.ts` (RepoSyncHook), `agent-session-runner.ts`, `continuation-runner.ts`, log collector + source registry, workspace cleaner, stream capture, result parser, `cli-executor-factory.ts`, `types.ts` (`deriveStageProfile`)  |
| `src/container/cli-executors/`                                  | `copilot-executor.ts` (container), `local-copilot-executor.ts` (host), `claude-code-executor.ts` (unreachable), `shared-exec.ts`                                                                                                                                        |
| `src/container/setup/`                                          | `.build/` generation: agent and skill templates, Liquid tags, MCP manifest/config/build, JIT params, compose files + overlay, squid config, URL restrictions, mounts, `profile-setup.ts`                                                                                |
| `src/prompt/`                                                   | prompt assembly (`prompt.ts`, `prompt-builder.ts`), `normalizer.ts`, `prompt-auditor.ts`                                                                                                                                                                                |
| `src/logs/`, `src/validate/`, `src/cli-dashboard/`, `src/util/` | execution summary + failure classification; startup validation; Ink TUI; branch slug / error message / `~` path helpers                                                                                                                                                 |
| `profiles/<id>/`                                                | `profile.json`, `Dockerfile`, `docker-compose.yml`, `setup.sh` (installs the CLI), `agents/*.agent.md`, optional `resources/`, generated `.build/`                                                                                                                      |
| `shared/`                                                       | `security/` (Squid + compose overlay), `hooks/` (container audit hooks), `agent-includes/` (Liquid partials), `mcp-servers/<name>/`, `mcp-sidecar/`, `skills/`                                                                                                          |

## Adding a DI service

1. In the same file, define `IFoo` and `class Foo implements IFoo`. The constructor takes **one destructured deps object** whose keys are cradle tokens (awilix `InjectionMode.PROXY`, `strict: true`). Depend on interfaces and config slices, never on the whole `IAppConfig`.
2. Add `foo: IFoo` to `OrchestratorCradle` in `src/awilix-cradle-types.ts`.
3. Register it in `createCradle()` in `src/awilix-cradle.ts` (`asClass(Foo).singleton()`).
4. Tests construct `Foo` directly with mocks, not with the container. Add `createMockFoo(overrides)` returning `Mocked<IFoo>` to `tests/helpers/mocks.ts` when more than one suite needs it.

Config slices: `dataSources`, `outputConfig`, `dashboardConfig`, `secrets`, `profiles`, `promptAuditConfig`, `ralphchivesConfig`, `enableContinuation`, `claudeAuth`, `preExecuteHooks`.

`awilix-cradle.ts` is the composition root for services, but not the only place that constructs things:

- `index.tsx` builds `AppStartup`, `Orchestrator` and `DashboardServer`.
- Per-task objects (compose client, executors, `ContainerManager`, session runners) are built in `buildContainerFactory`.
- Data-source plugin factories build their own connector and poller.
- `PromptBuilder` is registered without an interface.

Details: `docs/dev-doc/dependency-injection.md`.

## Subsystems

- **Runtime CLI.** Only GitHub Copilot CLI runs today:
  - `CliExecutorFactory` always builds `CopilotExecutor` / `LocalCopilotExecutor` and throws without `GH_TOKEN`.
  - The CLI is chosen per stage: `stages[].cli`, else the profile `cli` (default `copilot`).
  - `src/validate/stages.ts` rejects any stage that resolves to `cli: "claude"`, and `ClaudeCodeExecutor` is unreachable.
  - Model IDs are validated per stage CLI (`src/cli/model-catalog.ts`): Copilot takes dotted ids (`claude-opus-4.6`), Claude Code takes aliases (`opus`) or hyphenated ids.
  - Full Claude Code runtime support is being built and will become the default; Copilot will remain the secondary CLI.
- **Containers.** `ComposeFileResolver` (`src/container/setup/compose-files.ts`) merges three files: `profiles/<id>/docker-compose.yml`, `shared/security/docker-compose.security.yml`, and `profiles/<id>/.build/docker-compose.overlay.yml` (skipped if absent). `ComposeOverlayWriter` regenerates the overlay per task for the variant's servers and skills.
  - The agent runs on the internal `ralph-internal` network behind Squid. The baseline allowlist is `shared/security/squid.conf`, extended by profile `allowlistDomains`.
  - The sidecar also joins `ralph-sidecar-external`.
  - Hardening: `cap_drop: ALL` (+ `DAC_OVERRIDE`, `CHOWN`), `no-new-privileges`, 8G / 4 CPU / 500 PIDs. See `SECURITY.md` and `docs/dev-doc/compose-layering.md`.
- **Target repo.** `RepoSyncHook` (`src/container/lifecycle.ts`) writes `.ralph/`, `.github/skills/` and `.github/agents/` to `.git/info/exclude`, then fetches, checks out and runs `reset --hard` to the task branch. `TaskRunner` deletes `<repo>/.ralph` before each run.
- **Templates.** `AgentTemplateRenderer` (`src/container/setup/agent-includes.ts`) renders `profiles/<id>/agents/*.agent.md` (Liquid; partials from `shared/agent-includes/**`; `{% section "x" %}` → `<x>…</x>`) into `.build/`. `SkillTemplateRenderer` renders `shared/skills/<name>` into `shared/skills/.build/<name>/`. Both re-render per task and per stage, and the output is mounted read-only. Template variables: the `TemplateContext` interface in `agent-includes.ts` and `docs/user-guide/template-variables.md`.
- **MCP.** The effective servers are the union of profile- and variant-level `mcpServers`. Secrets live in `gateway.json` inside the sidecar (`shared/mcp-sidecar/src/gateway.ts`, which serves `/health`).
  - `type: "npm"` servers are bridged through supergateway. `type: "custom"` servers must serve HTTP themselves on their `sidecarPort`.
  - `JitMcpConfigWriter` (`src/container/setup/jit-mcp-params.ts`) resolves `$task.*`, `$trigger.<key>` and `$variantEnv.PREFIX` in `env` per task. Unknown macros or missing variant env vars throw.
  - `sidecarEnv` sets sidecar container env. A manifest `initScript` runs before the gateway via `.build/pre-init.sh`.
  - See `MCP.md` and `docs/user-guide/runtime-macros.md`.
- **Operation ledger.** One file per issue at `<output.logDir>/history/<dataSource>/<issueKey>.json`, with transitions `pending → active | rejected | error` and `active → completed | error` (`VALID_TRANSITIONS`). `pending → error` records an operation that failed before activation (profile gone, work item unreachable, a pre-activation phase threw).
  - On restart, active operations are marked `error`.
  - Each trigger is consumed once per `variantKey`.
  - `TriggerScanner` also persists `cache/trigger-cache.json` and skips issues whose `updated` timestamp hasn't changed. Clear the issue's entry there when re-testing triggers.
- **Data-source plugins.** `BUILTIN_PLUGINS` (`src/app-startup.ts`) and `config.plugins` are `import()`ed. Each module calls `registerDataSourceFactory()`, then `buildDataSourceMaps()` (`src/datasource/registry.ts`) instantiates them. Guide: `docs/dev-doc/data-source-registration.md`.
- **Stages and post-task hooks.**
  - Each variant has a `stages` array. Each stage has `agent`, `role`, `mode` (`container` | `local`) and optional `cli`, `skills`, `model`, `timeoutMs`, the Claude-only `effort` and `maxBudgetUsd`, and `requireResultBlock` (default true for variant stages, false for hook stages); `deriveStageProfile` applies the stage overrides.
  - `local` stages run `copilot` on the host with cwd = this repo root. They symlink rendered agents into `.github/agents/` and write `.ralph/` here.
  - `postTaskHooks` are local-only stage lists that run after teardown, and their failures never change the result. See `docs/dev-doc/multistage-pipelines.md`.
- **Continuation.** A session can be retried with `--continue` (exponential backoff, 5 s base, 30 s cap) when it ends without `===RALPH_RESULT_START===`. This requires **both** `enableContinuation: true` in `config.json` and `maxContinuations > 0` in `profile.json`. The loop lives in `ContinuationRunner`, invoked by `AgentSessionRunner`, and is skipped on timeout.

## Conventions

- ESM only (`"type": "module"`, NodeNext); relative imports use `.js` extensions. `execa` v10 for subprocesses. Native `fetch` against JIRA REST v3, no SDK.
- **Never re-export** (`export … from`). Update the import site to the defining module.
- **No backward-compat wrappers, adapters or shims.** When something moves, update every call site.
- **Enums for fixed string sets** (`OperationStatus`, `StageMode`, `AuditMode`, `VcsProvider`), not string-literal unions. Zod `z.enum` validates the raw JSON.
- **Single responsibility.** If new logic serves a different concern, give it its own module instead of growing an existing class.
- ESLint enforces these rules:
  - `_`-prefix for unused args, vars and caught errors.
  - `no-duplicate-imports`.
  - `any` is an error in `src/` but allowed in `tests/`.
- **JSDoc** on public interfaces, types, classes and methods. Comments explain _why_. Don't restate the code, write history notes, or add section-separator comments.

## Testing

- `vitest.config.ts` runs `tests/**/*.test.ts` only (`.test.tsx` is not picked up). It excludes `shared/mcp-servers/**`, `dashboard-local/**`, `ralph-dashboard/**` and `ralphchives/**`.
- Tests roughly mirror `src/`; `src/container/setup/*` is tested flat in `tests/container/`.
- Helpers in `tests/helpers/`:
  - `factories.ts`: pure `make*` value builders.
  - `mocks.ts`: `createMock*` factories, the custom `Mocked<T>` type, `createMockLogger` and `createSilentLogger`.
  - `mcp-fs.ts`.
- Mock `I`-interfaces, never classes. For ESM modules use `vi.mock` (not `vi.spyOn` on namespaces). Pass `{ delayMs: 1 }` `RetryOptions` instead of raising timeouts. More rules: `.claude/rules/`.

## Sub-projects

Each has its own `package.json` and `npm ci`. Root `npm run lint` and `npm test` skip them, except that root eslint does lint `ralphchives/**`. `.github/workflows/pr-validation.yml` covers all of them.

| Path                        | Stack                                                          | Commands                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/mcp-servers/<name>` | custom TS MCP servers (webpack; `discord-hitl`: tsc + esbuild) | `lint` (tsc), `build`, `test` (vitest) in ado, jira-kentico, ralphchives-read/-write. `playwright` and `codegraphcontext` are npm-type, manifest only |
| `shared/mcp-sidecar`        | gateway process manager                                        | `lint`, `build` (no tests)                                                                                                                            |
| `dashboard-local`           | Vite + React 19 + Tailwind log/graph UI                        | `dev`, `lint`, `test`, `test:watch`, `build`; see `dashboard-local/AGENTS.md`                                                                         |
| `ralph-dashboard`           | Next.js status dashboard (Vercel + Upstash Redis)              | `dev`, `lint`, `build`; `deploy` pushes to Vercel production (side-effecting)                                                                         |
| `ralphchives/sync`          | NodeBB → Neo4j sync pipeline                                   | `build`, `test`, `dev`, `sync:full` (writes to live stores)                                                                                           |

## Dev tooling vs runtime artifacts

- Claude Code dev tooling:
  - Project skills in `.claude/skills/`: agent-eval, cli-debug-log-analysis, skill-creator, mcp-builder, task-failure-diagnosis, dashboard-development, nodebb-interaction, mcp-deployment, ralph-agent-authoring, test-patterns.
  - Path-scoped rules in `.claude/rules/`: testing, scripts, mcp-servers, runtime-agents.
- The `ralph.scientist` post-task hook (host-side, cwd = repo root) also loads **agent-eval, cli-debug-log-analysis, skill-creator and mcp-builder** at runtime, by name from `shared/agent-includes/post-hooks/*.md`. Renaming or removing them breaks that hook.
- `shared/skills/`, `shared/agent-includes/` and `profiles/*/agents/` are **runtime** artifacts mounted into agent containers, not dev tooling. The `.claude/rules/` runtime-agents rule covers editing them.

## containment/

`containment/` holds quarantined material unrelated to this repo, such as other products' agent families and unrelated guides. `.rgignore` hides it from search. Never read, search, cite or reuse it. Never move anything out of it unless the user explicitly asks.

## Docs

- Root: `README.md` (setup, usage, § Output for the per-task log layout under `output/logs/<key>-<startTs>/`), `ARCHITECTURE.md`, `CONFIGURATION.md`, `MCP.md`, `SECURITY.md`.
- `docs/user-guide/` is the most accurate operator reference: configuration, environment variables, profiles, template variables, trigger parameters, runtime macros, MCP servers, skills.
- `docs/dev-doc/`: agent-as-function, agent-templates, codegraph-strategy, compose-layering, data-source-registration, dataflow.drawio, dependency-injection, local-testing, mcp-sidecar-design, mcp-tool-naming, multistage-pipelines, ralphchives, security-audit-exfiltration.
- `docs/research/` (e.g. copilot-cli-internals) and `docs/past-issues/` hold research notes and postmortems.
- When a doc contradicts the code, trust the code and fix the doc.
