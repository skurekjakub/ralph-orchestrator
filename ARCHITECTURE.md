# Ralph Orchestrator — Architecture

## System Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It bridges JIRA (task management) with a security-hardened container-based AI agent system (execution), supporting both GitHub Copilot CLI and Claude Code CLI.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RALPH ORCHESTRATOR                         │
│                      (this repo — Node.js app)                     │
│                                                                    │
│  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │  JIRA    │─▶│ Trigger │─▶│ Operation│─▶│   Task Runner     │   │
│  │  Poller  │  │ Scanner │  │  Ledger  │  └────────┬──────────┘   │
│  └──────────┘  └─────────┘  └──────────┘           │              │
│       │                                    ┌───────┴───────┐      │
│       │                                    │ CLI Selection  │      │
│  ┌──────────┐                       ┌──────┴──┐ ┌──┴──────┐       │
│  │  JIRA    │                       │ Copilot │ │  Claude │       │
│  │  Client  │                       │Executor │ │Executor │       │
│  └──────────┘                       └────┬────┘ └───┬─────┘       │
│       │                                  └────┬─────┘             │
│       │                                       ▼                   │
│  ┌──────────┐     ┌────────────────────────────────────────────┐  │
│  │Heartbeat │     │           DOCKER CONTAINERS                │  │
│  │ Sender   │──▶  │                                            │  │
│  └──────────┘     │  ┌──────────────┐  ┌────────────────────┐  │  │
│       │      Dash │  │  App (agent)  │  │   MCP Sidecar      │  │  │
│       │           │  │  internal net │──│   gateway.ts        │  │  │
│       │           │  │  cap_drop:ALL │  │   MCP HTTP servers  │  │  │
│       │           │  │  no-sudo      │  │   isolated secrets  │  │  │
│       │           │  └──────────────┘  └────────────────────┘  │  │
│       │           │                    ┌────────────────────┐  │  │
│       │           │                    │  Egress Proxy       │  │  │
│       │           │                    │  (Squid sidecar)    │  │  │
│       │           │                    │  domain allowlist   │  │  │
│       │           │                    └────────────────────┘  │  │
│       │           └────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    INK TERMINAL DASHBOARD                    │  │
│  │  StatusPanel │ QueuePanel │ HistoryPanel │ LogPanel          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. JIRA Cloud ──(JQL poll)──▶ JiraWorkItemPoller ──(WorkItem[])──▶ Trigger Scanner ──(ack comment)──▶ JIRA Cloud
2. Trigger Scanner ──(plan pending ops)──▶ Operation Ledger
3. Ledger ──(next pending)──▶ Orchestrator ──(profile lookup, re-fetch, status check, preflight)──▶ Profile selected
4. TaskRunner ──(render templates + skills, regenerate overlay, JIT gateway.json)──▶ Profile .build/
5. TaskRunner ──(JIRA beforeAgent transition + start comment)──▶ JIRA Cloud
6. TaskWorkspaceManager ──(fetch repoUrl into cache/repos/<id>, clone cache/workspaces/<taskId>, task branch, git exclude)──▶ Task workspace on the host
7. TaskRunner ──(docker compose up -d --build, workspace mounted at /workspace)──▶ Docker (app + sidecar + proxy)
8. TaskRunner ──(docker compose exec <cli>)──▶ Agent container (one exec per stage)
9. Agent ──(MCP tools via HTTP)──▶ MCP Sidecar ──(unrestricted direct internet)──▶ External APIs
10. Agent ──(MCP: push branch, create PR)──▶ MCP Sidecar ──(git push, ADO REST)──▶ ADO
11. Agent ──(MCP: comment, attach handoff)──▶ MCP Sidecar ──▶ JIRA
12. TaskResultWriter ──(exec cat / compose logs / compose cp)──▶ Collect logs from all containers
13. TaskResultWriter ──(attach transcript + save summary)──▶ JIRA Cloud + output/logs/<key>-<startTs>/
14. TaskRunner ──(docker compose down --volumes --remove-orphans)──▶ Containers destroyed
15. TaskRunner ──(post-task hooks, local stages)──▶ Orchestrator host
16. TaskWorkspaceManager ──(delete on success, keep and log on error)──▶ Task workspace
17. Orchestrator ──(ledger completed | error, afterAgent transition on success)──▶ resume polling (back to step 1)
```

## Component Details

### AppStartup (`src/app-startup.ts`)

Pre-orchestrator startup pipeline. Runs before the main loop:

1. Validates prerequisites (env vars, config, Docker, profiles, security)
2. Loads `IAppConfig` (`loadConfig()`)
3. Loads the built-in data source connector modules (JIRA), whose factories self-register
4. Starts the Ralphchives compose stack when `ralphchives.enabled` is true
5. Builds custom MCP servers (`npm run build`) and the MCP sidecar gateway
6. Generates per-profile files in `.build/` (`mcp-config.json`, `gateway.json`, compose overlay, `squid.conf`, `copilot-settings.json`)

Agent templates are **not** resolved at startup — they are rendered JIT before each task by the `AgentTemplateRenderer` (see TaskRunner below). After startup, `src/index.tsx` builds the cradle (`createCradle()`), constructs the `Orchestrator`, and starts the dashboard server and Ink UI.

### JIRA Poller (`JiraWorkItemPoller`, `src/datasource/connectors/jira/jira-poller.ts`)

- One poller per JIRA data source, created by the connector factory (`src/datasource/connectors/jira/factory.ts`)
- Runs on the data source's `pollIntervalMs` (default: 60s)
- Executes JQL queries auto-generated from the match rules of profiles that use the data source
- Buffers results as `WorkItem`s, deduplicated by work item ID within and across poll cycles
- Fires immediately on start, then on interval

### Operation Ledger (`src/services/operation-ledger.ts`)

- Persistent per-issue JSON files (`<output.logDir>/history/<dataSource>/<issueKey>.json`; `output.logDir` defaults to `./output/logs`)
- Tracks every agent invocation through its lifecycle: `pending → active | rejected | error`, `active → completed | error`
- Comment-trigger dedup: each trigger comment is consumed exactly once per variant
- Crash recovery: on startup, `active` operations from previous sessions are marked as `error`
- Pending operations survive restarts — persisted on disk and resumed after recovery

### JIRA Client (`src/datasource/connectors/jira/jira-client.ts`)

- Native `fetch` against JIRA REST API v3 (cloud endpoint)
- Basic auth: `base64(email:apiToken)`
- API base: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`
- Endpoints: `search/jql`, `issue/{key}`, `issue/{key}/comment`, `issue/{key}/transitions`
- `searchIssues()` auto-paginates using `nextPageToken` (100 per page) to fetch all matching issues
- No SDK dependency

### Container Manager (`src/container/manager.ts`)

Orchestrates the full container lifecycle for a single task: build → setup → execute agent stages → collect logs → teardown. Uses **constructor-injected collaborators** (all `I`-prefixed interfaces) for compose operations, CLI execution, log collection, and workspace cleanup. Each manager is bound to one task's workspace: before compose up, `start()` creates `.ralph/`, each CLI home and every directory a container CLI mounts into on the host, so Docker never creates them as root and the workspace stays deletable.

- **ComposeClient** — Low-level `docker compose` wrapper. Turns the file list from `ComposeFileResolver` into `-f` flags and passes the process environment plus computed paths (`TARGET_REPO_PATH` — the task's workspace, `SQUID_CONF_PATH`, `SHARED_HOOKS_PATH`) for compose interpolation.
- **Stage-based execution** — `createExecutorForStage(stage, workspace)` returns the appropriate CLI executor based on the stage's workspace `mode`: `StageMode.Container` → standard `CopilotExecutor`/`ClaudeCodeExecutor` (inside Docker), `StageMode.Local` → `LocalClaudeCodeExecutor`/`LocalCopilotExecutor` (on the host, in the stage's own workspace). `executeWithExecutor(executor, workItem, issueContext)` delegates to the `AgentSessionRunner` (`src/container/agent-session-runner.ts`) for prompt building, injection audit, and CLI invocation; the `ContinuationRunner` (`src/container/continuation-runner.ts`) handles the continuation loop (Copilot `--continue`, Claude Code `--resume <session id>`).
- **CopilotExecutor / ClaudeCodeExecutor** — CLI-specific command builders, sharing a common `executeCliCommand()` helper for stream capture and error handling. Each executor reads its container layout (absolute binary path, CLI home, debug log, transcript) from its `ICliRuntime`.
- **LocalClaudeCodeExecutor / LocalCopilotExecutor** — Host-side CLI executors for `mode: "local"` stages. Each runs the pinned CLI from `node_modules/.bin` via `execa()` on the orchestrator host, bypassing Docker, in the stage's own workspace under the task's output directory (`StageWorkspaceResolver`): its cwd, a private CLI home holding (Claude Code) or beside (Copilot, `work/.github/`) the rendered agents and skills, and its logs. The environment holds only `PATH`, `HOME`, `LANG` and the CLI's credential. Claude Code runs headless with Ralph's host settings file (audit hooks, `dontAsk` permission rules), no MCP server and no web tools; Copilot keeps `--allow-all-tools --allow-all-paths`.
- **ContainerLogCollector** — Per-task log collection from `app` and sidecar containers via streaming (`tail -f`), batch (`exec cat`), or compose logs (for stdout-based services like the MCP gateway).
- **StreamCapture** — Line-buffered streaming for child processes, piped to the logger with tag prefixes.

**Prompt construction:** Before CLI execution, the prompt is built via the `PromptBuilder`, which normalizes untrusted content (stripping invisible characters, hidden HTML comments, non-standard whitespace) and places it after a `JIRA Issue:` / `Title:` header. There are no delimiters around the untrusted data; the agent template's `prompt-security` include tells the agent to treat it as task information. The labelled untrusted sections are passed through the prompt injection auditor.

**CLI selection:** Based on the profile's `cli` preference (`"copilot"` or `"claude"`). Falls back to the other CLI if the preferred one's credential is missing.

### Orchestrator (`src/orchestrator.ts`)

Main loop: poll → scan triggers → execute pending operations → repeat.

**Dependency injection:** The `createCradle()` factory in `src/awilix-cradle.ts` registers all service classes with **awilix** (`InjectionMode.PROXY`, `strict: true`) and returns the resolved cradle (typed by `OrchestratorCradle` in `src/awilix-cradle-types.ts`). `src/index.tsx` passes the cradle to `new Orchestrator(cradle)`, which destructures the services it needs — services can be replaced with mocks in tests. Configuration is injected as individual **config slices** (`dataSources`, `outputConfig`, `dashboardConfig`, `secrets`, `profiles`, `promptAuditConfig`, `ralphchivesConfig`, `enableContinuation`) rather than a monolithic config object. Per-data-source connectors and pollers are registered as `connectors` / `pollers` maps. See [docs/dev-doc/dependency-injection.md](docs/dev-doc/dependency-injection.md).

**Trigger scanning:** The `TriggerScanner` service scans polled issues for `commentTrigger` matches. For each issue, it fetches comments once (shared across profiles), checks each matching variant's trigger string, and plans unconsumed triggers as pending operations in the ledger. Triggers from users outside the data source's `allowedUsers` are recorded as rejected. An ack comment is posted for each new trigger. If the trigger comment includes parenthesized parameters (e.g. `@RalphDf(codesamples, verbose)`), they are extracted and stored in the operation as `triggerParams`.

The scanner caches each issue's `updated` timestamp between cycles in `cache/trigger-cache.json`. If an issue hasn't been updated since the last scan, comment fetching is skipped entirely — reducing API calls from N (all matching issues) to only those with new activity.

**Processing a single operation:** Resolve profile → re-fetch issue → validate status match → preflight checks → delegate to `TaskRunner`. A missing profile or unreachable work item moves the operation from `pending` to `error`; a status mismatch or failed preflight moves it to `rejected`. Preflight can resolve existing pull-request metadata through `VcsSourceClient`, including source/target branches keyed by the profile's `vcsProvider`, and threads that into task context before the workspace is created and MCP macros are resolved. The orchestrator records the result in the ledger and transitions JIRA (afterAgent) on success. Fatal errors (container start/setup) abort immediately. Non-critical failures (log collection, JIRA attachment) are logged but don't block the pipeline.

**Task callbacks:** The `DashboardServer` needs tool-output events from the `TaskRunner`, but depends on the orchestrator (which in turn depends on the task runner) — creating a circular init-order dependency. This is resolved via `setTaskCallbacks(callbacks: TaskCallbacks)` on the orchestrator, which copies the callbacks into each `TaskContext` built by `buildTaskContext()`. `TaskCallbacks` is an immutable interface with optional `onToolOutput` and `onPreToolUse` hooks, defined in `src/services/task-context.ts`.

**State observation:** The `OrchestratorObserver` builds state snapshots and heartbeat payloads from live orchestrator data. The Ink dashboard subscribes to it directly (`orchestrator.observer`). This separation keeps state aggregation out of the main orchestration loop.

### TaskRunner (`src/services/task-runner.ts`)

Stateless, single-issue execution pipeline. All per-task state is scoped to the `run(ctx)` call (`ctx` is a `TaskContext`). Dependencies are injected from the cradle: `logger`, `containerFactory`, `resources`, `resultWriter`, `issueManager`, `profileSetup`, `pipelineExecutor`, `workspaceManager`.

The `run()` pipeline has four phases, then a workspace cleanup:

1. **`prepareProfile`** — `ProfileSetupService.prepareForTask()` renders Liquid agent and skill templates (JIT), regenerates the compose overlay, `mcp-config.json` and `gateway.json` for the matched variant, and resolves task-scoped MCP macro params into `gateway.json`.
2. **`transitionIssue`** — Transition JIRA to the `beforeAgent` status and post a start comment.
3. **`prepareContainer`** — Create the task's workspace (`TaskWorkspaceManager.prepare`, below), `docker compose up -d --build` with it mounted at `/workspace`, check prerequisites, prepare the CLI config directory, delete `cleanPaths`, register log sources, run `setup.sh`.
4. **`executeAgent`** — Fetch comments (and the previous handoff for revisions), then hand off to `AgentPipelineExecutor` (`src/services/agent-pipeline-executor.ts`). It loops over `ctx.profile.stages`, re-rendering templates per stage and creating the appropriate executor for each stage (container or local) via `ContainerManager.createExecutorForStage()`. For each stage, it builds the prompt, audits it for injection, and runs the CLI. If any stage fails, the pipeline aborts immediately. The last stage's `RalphResult` is authoritative; total `durationMs` is always computed as the sum of all stage durations.

After the agent finishes (success or error), `TaskRunner` delegates result collection to the `TaskResultWriter`, then tears down the containers. Once the post-task hooks are done, `TaskWorkspaceManager.cleanup` deletes the workspace when the task succeeded (completed or partial) and keeps it, logging its path, otherwise.

### TaskWorkspaceManager (`src/services/task-workspace-manager.ts`)

Gives each task its own checkout of the profile's `repoUrl`, so no two tasks share a working tree. The path, `cache/workspaces/<taskId>` (`<itemKey>-<startTs>`, the name of the task's output directory), is computed by `buildTaskContext()` and carried as `TaskContext.workspacePath`: the compose env, `ContainerManager` (host-side `.ralph/`, audit log) and the `repo` / `targetRepoPath` template variables read it.

- **Source clone** — a bare clone per profile in `cache/repos/<profileId>`, cloned from `repoUrl` on the first task (into a `.partial` sibling renamed into place) and fetched before every later one (`+refs/heads/*:refs/heads/*`, `--prune`). The orchestrator runs one operation at a time, so the clone needs no lock.
- **Workspace** — `git clone --local --branch <base>` of the source clone (hard-linked objects, no network), with `origin` then set to `repoUrl` so the agent and the sidecar push to the real remote. The task branch is checked out from `origin/<branch>` when the remote has it — required for a revision — else created from the base branch. `.ralph/` and the container CLIs' mount targets go into `.git/info/exclude`, and `.ralph/tasks/<key>/` is created.
- **Credentials** — the `repoPat` PAT reaches git only as a per-command `-c http.extraHeader` (format by `vcsProvider`), with `GIT_TERMINAL_PROMPT=0`; errors carry `***` in its place, and no clone's config stores it.

**Post-task hooks:** After result collection and container teardown, `TaskRunner` runs `postTaskHooks` — local-only agent pipelines for analysis, reporting, or improvement tasks. Each hook gets an output directory at `<taskOutputDir>/hooks/<hook-name>` (`hook.outputDir` in templates). Hook failures are warnings only; they never affect the task result or JIRA transitions. The `skip_hooks` trigger parameter (`@Ralph(skip_hooks)`) bypasses hook execution and writes a `hook-manifest.json` to the output directory, enabling manual replay via `scripts/run-hooks.ts`.

### TaskResultWriter (`src/services/task-result-writer.ts`)

Extracted service responsible for all post-execution artifacts:

- **`collectLogs(container, result)`** — Calls `container.logs.collectAll()`, records collected log paths on the result object. Swallows errors so log collection failures don't abort the pipeline.
- **`collectResults(ctx, container, result)`** — Calls `collectLogs`, attaches the session transcript to the JIRA issue, and saves the execution summary via `ILogCollector`.

### Log Collection

**Container Log Collector** (`src/container/log-collector.ts`) manages per-task log collection from `app` and sidecar containers. `LogSourceRegistry` (`src/container/log-source-registry.ts`) registers the sources, each with a capture mode (stream for real-time, collect for post-execution), plus folders exported with `docker compose cp` (session state, session store, subagent artifacts). Each task gets its own timestamped directory (`output/logs/<key>-<startTs>/`), with files named `<key>-<startTs>-<collectTs>-<sourceId>.<ext>` (the stage role is inserted before the source ID for per-stage collections).

Sidecar logs (gateway startup, MCP server output) are collected via `docker compose logs` since the gateway writes to stdout rather than a file. The collector's `useComposeLogs` flag routes collection through the compose logs command instead of `exec cat`.

**Log Collector** (`src/logs/collector.ts`) saves execution metadata as `<key>-<startTs>-<ts>-summary.json` inside the task's timestamped directory.

Per-task outputs: audit trail (`.jsonl`), session transcript (`.md`), pre-tool and tool output logs (`.log`), CLI debug log (`.log`), proxy access log (`.log`), sidecar log (`.log`), agent `state.md`, exported session state and artifacts, execution summary (`.json`), streaming log (`.log`). Proxy and sidecar logs are collected even on error for debugging. A persistent daily activity log (`activity-YYYY-MM-DD.log`) and container output log (`container-YYYY-MM-DD.log`) are also maintained.

### Status Dashboard (`ralph-dashboard/`)

Separate Next.js app deployed to Vercel. See [ralph-dashboard/README.md](ralph-dashboard/README.md) for full details.

- Receives heartbeats from one or more orchestrator instances
- Stores per-agent state in Upstash Redis (via Vercel Marketplace integration) with 24h TTL
- Dashboard UI auto-refreshes every 15s, rendering one card per connected agent
- Authentication: shared-secret bearer token (`DASHBOARD_SECRET`)

### Local Log Dashboard (`dashboard-local/`)

Vite + React app for browsing collected run logs (`npm run dashboard`). It reads the output directory directly; it is not part of the orchestrator process.

### Ink Dashboard (`src/cli-dashboard/*.tsx`)

| Panel          | Purpose                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `StatusPanel`  | Current status (IDLE/WORKING/STOPPING) with animated spinner, current issue, elapsed time |
| `QueuePanel`   | Issues waiting to be processed                                                            |
| `HistoryPanel` | Completed tasks with status icons and duration                                            |
| `LogPanel`     | Scrolling activity log (15 lines) with timestamps and color-coded levels                  |

## Profile Infrastructure

All Docker, agent, and hook infrastructure is centralized in the orchestrator repo. Target repos contain no Ralph-specific files.

```
<orchestrator-repo>/
├── profiles/
│   ├── ralph-docs/
│   │   ├── profile.json                 # Profile config: repoUrl, dataSource, cli, variants, MCP servers, allowlistDomains
│   │   ├── Dockerfile                   # Container image (ubuntu:22.04 with Ruby, Node, .NET, etc.)
│   │   ├── docker-compose.yml           # Base compose: services, volumes, env vars
│   │   ├── setup.sh                     # Post-create setup (CLI installs, git config)
│   │   ├── .build/                      # Generated (gitignored): <cli>/agents/ and skills/ per stage,
│   │   │                                #   mcp-config.json, gateway.json, docker-compose.overlay.yml,
│   │   │                                #   squid.conf, copilot-settings.json, pre-init.sh, attachments/
│   │   └── agents/                      # Liquid agent templates (*.agent.md), e.g.
│   │       ├── ralph.ralph.agent.md     # Documentation orchestrator (researcher, planner, writer,
│   │       │                            #   validator, coder, reviewer-technical/style/ia, scribe subagents)
│   │       ├── ralph.malph.agent.md     # PR review orchestrator (malph-scout, malph-verdict, reviewers)
│   │       ├── ralph.stacky.agent.md    # Code orchestrator (stacky-analyst, -coder, -test-writer,
│   │       │                            #   -reviewer, -bug-auditor, -e2e-playwright)
│   │       └── ralph.scientist.agent.md # Post-task hook (subagent-mapper, run-analyzer, agent-improver,
│   │                                    #   run-synthesizer)
│   └── ralph-vscode/                    # Same layout; node:24-bookworm-slim image
│       └── agents/
│           ├── ralph.ralph.agent.md     # Orchestrator (ralph-analyst → robinson/vasco-explorer,
│           │                            #   ralph-planner, ralph-coder, ralph-reviewer, ralph-scribe)
│           ├── ralph.malph.agent.md     # PR review (malph-scout, malph-reviewer-opus/gpt/gemini)
│           └── ralph.scientist.agent.md # Post-task hook (scientist-run-analyzer, scientist-agent-improver)
├── shared/
│   ├── security/                        # Container security infrastructure
│   │   ├── docker-compose.security.yml  # Squid sidecar, network isolation, resource limits, hook mounts
│   │   └── squid.conf                   # Baseline domain allowlist for egress proxy
│   ├── hooks/                           # Copilot CLI audit hooks (shared)
│   │   ├── log-*.sh                     # Hook scripts for session logging
│   │   └── ralph-audit.json             # Hook configuration
│   ├── agent-includes/                  # Shared Liquid partials for agent templates
│   │   ├── ado-api.md               # ADO MCP tool reference (PR creation, threads, replies)
│   │   ├── ado-pr-format.md         # PR description template
│   │   ├── agent-as-function-contract.md  # Subagent artifact contract (status.json, manifest.json)
│   │   ├── prompt-security.md       # Context-aware prompt injection defense (uses {{ taskId }}, {{ taskProject }})
│   │   ├── ralphchives.md           # Ralphchives knowledge base usage
│   │   ├── rules.md                 # Shared agent rules
│   │   ├── source-references.md     # Xperience source browser URL format
│   │   ├── personality/             # Agent personality partials (ralph, malph)
│   │   ├── post-hooks/              # Scientist subagent bodies (subagent-mapper, run-analyzer,
│   │   │                            #   agent-improver, run-synthesizer)
│   │   ├── ralph-docs/              # ralph-docs workflow partials (standard, revision, codesamples,
│   │   │                            #   devralph, malph review, reviewer bodies)
│   │   └── ralph-vscode/            # ralph-vscode workflow partials and Malph review checklist
│   └── mcp-servers/                     # MCP server manifests + custom server code
│       ├── ado/                         # Azure DevOps MCP server (custom)
│       ├── jira-kentico/                # JIRA Cloud MCP server (custom, Kentico instance)
│       ├── discord-hitl/                # Discord HITL server (custom)
│       ├── playwright/                  # Playwright MCP server (npm)
│       ├── web-fetch/                   # Fetch any URL and return as text (custom, direct access)
│       ├── microsoft-docs/              # Search Microsoft Learn documentation (custom, direct access)
│       ├── ralphchives-read/            # Ralphchives knowledge base read path (custom, NodeBB)
│       ├── ralphchives-write/           # Ralphchives knowledge base write path (custom, NodeBB)
│       └── codegraphcontext/            # Code graph queries (npm, with init.sh indexing)
├── shared/mcp-sidecar/                  # MCP sidecar container (gateway process manager)
│   ├── Dockerfile                       # Sidecar image (node:24-bookworm-slim, Playwright MCP, git, python, gateway deps)
│   ├── entrypoint.sh                    # Sources pre-init.sh (if mounted), then exec gateway
│   ├── src/gateway.ts                   # Gateway: spawns MCP servers, /health endpoint
│   └── package.json
├── shared/skills/                       # Skill folders grouped by category (<category>/<name>/SKILL.md);
│                                        #   rendered per stage into profiles/<id>/.build/skills/<name>/ and
│                                        #   mounted at /workspace/.github/skills/<name>/ (excluded from
│                                        #   the workspace's git via .git/info/exclude)
```

Profiles can also have a `resources/` directory (files mounted read-only at `/workspace/<resources.mountBase>/`); neither bundled profile has one.

Agent template files (`.agent.md`) use Liquid syntax (`{% render 'name' %}`, `{% if isRevision %}`) with partials in `shared/agent-includes/*.md`. Includes support subdirectories (e.g. `{% render 'personality/ralph' %}`, `{% render 'ralph-docs/ralph-standard-workflow' %}`). Templates are rendered JIT before each task (and again before each stage) by `AgentTemplateRenderer`, which receives a pre-built `TemplateContext` (`src/container/setup/agent-includes.ts`) containing profile metadata (id, `repo` / `targetRepoPath` — the task's workspace, cli, model, agent name, MCP servers), task data (id, title, description, status, type, priority, labels, components, project, created, updated), trigger metadata (`commentTrigger`, `triggerParams`), runtime flags (`isRevision`, `ralphchivesEnabled`, `prUrl`), `skills`, `artifactDir`, stage context (`stageRole`, `stageMode`, `stageIndex`, `stageCount`, `isFirstStage`, `isLastStage`, `previousStageRoles`), and post-task hook context (`hook.*`). The `triggerParams` is a `Record<string, string>` built by `buildTriggerParams()` — bare params map to `"true"`, key-value params (e.g. `branch_name=xyz`) map to the value. See [docs/dev-doc/agent-templates.md](docs/dev-doc/agent-templates.md) for template authoring details. Output goes to `profiles/<id>/.build/`. Compose files mount from `.build/` — the `.agent.md` templates are the source of truth.

**Three-file compose merge:** `ComposeClient` merges up to three compose files for every command: base (`profiles/<id>/docker-compose.yml`), security overlay (`shared/security/docker-compose.security.yml`), and optionally the resources overlay (`profiles/<id>/.build/docker-compose.overlay.yml`). The security overlay adds the Squid egress proxy sidecar, network isolation, proxy env vars, and resource limits. The resources overlay adds the agent's base env vars, the MCP sidecar service (with server code, gateway config, and secrets isolated from the agent), URL-only MCP config and Copilot CLI config for the agent, agent and skill folder mounts, and resource file mounts. It is generated for every profile at startup; `ComposeFileResolver` only leaves it out when the file is missing.

Currently configured target repos:

- `kentico-docs-jekyll` — Documentation portal (profile: `ralph-docs`)
- `kentico-docs-autocomplete-vscode` — VS Code extension (profile: `ralph-vscode`)

### Agent Phases (inside container)

Before the agent starts, `TaskWorkspaceManager` has already cloned the task's workspace on the host from the latest remote state (base branch from `source_branch`, the inferred PR target, or `main`) and checked out the task branch. The `ralph-docs` `ralph.ralph` standard workflow (`shared/agent-includes/ralph-docs/ralph-standard-workflow.md`, phase details in the `ralph-workflow` skill) then runs:

1. **Setup** — Read the task, set up `state.md` and the scratchpad, search Ralphchives
2. **Research** — Dispatch `ralph-researcher`, then `ralph-planner` to produce task files
3. **Write** — Dispatch `ralph-writer` for the next planned task; the writer uses `ralph-validator`
4. **Review** — Review the current task with the reviewer subagents, revise if needed, advance to the next task (phases 4–5)
5. **Commit** — Pre-commit checks, commit, push (via the `ado` MCP tools)
6. **PR** — Create the ADO pull request (`ado_create_pull_request`)
7. **Handoff & Exit** — Dispatch `ralph-scribe`, deliver the handoff to JIRA, print the structured result block for the orchestrator to parse

Revision runs (`isRevision`) use `ralph-docs/ralph-revision-workflow.md` instead. Other orchestrators (`malph`, `stacky`, `ralph-vscode`) define their own phases in their templates.

### JIRA Communication (inside container)

Ralph communicates with JIRA via MCP tools (`jira_add_comment`, `jira_add_attachment`) provided by the `jira-kentico` MCP server:

- Posts completion comment with status, branch, PR URL, summary
- Attaches `handoff.md` to the JIRA issue
- The MCP server handles authentication in the sidecar (Basic auth from `JIRA_PAT_KENTICO_JIRA` / `JIRA_EMAIL_KENTICO_JIRA` in `gateway.json`)

## Configuration

See [CONFIGURATION.md](CONFIGURATION.md) and [docs/user-guide/](docs/user-guide/README.md) for the full reference.

- **`config.json`** — Global settings: data sources (JIRA connection, polling interval, `allowedUsers`, `excludeFields`), output paths, dashboard toggle, prompt audit mode, Ralphchives, `enableContinuation`.
- **`profiles/<id>/profile.json`** — Per-profile config: target repo URL (`repoUrl`), data source, CLI preference, model, timeout, JIRA transitions, MCP servers, `allowlistDomains`, resources, and variants (match rules, stages, post-task hooks).
- **`.env`** — Secrets: `JIRA_PAT_<KEY>` / `JIRA_EMAIL_<KEY>` per JIRA data source, GitHub PAT, Anthropic API key, ADO PATs, Discord and NodeBB tokens, dashboard URL/secret.

**Variant matching:** Each variant declares `match.projects`, `match.statuses`, `match.commentTrigger`, and optionally `match.revisionStatuses`. Variants are evaluated across all profiles; all matching triggers are planned. Each variant contains a `stages` array — one or more stage definitions with `agent`, `role`, `mode` (`container` or `local`), and optional overrides. Stage agent names must match `.agent.md` files in the profile's `agents/` directory. Trigger comments can include parenthesized parameters (e.g. `@RalphDf(verbose)`) — these are parsed into `triggerParams` and available in `TemplateContext`.

## Security

### Threat Model

Prompt injection causes the agent to execute arbitrary commands. Everything inside the container (workspace, local files) is considered expendable and recoverable. External interactions (network exfiltration, lateral API access, host compromise) must be prevented.

### Network Isolation

The agent container and MCP sidecar have separate, intentionally different network access:

```
Agent container   → ralph-internal (internal: true) → Squid proxy → AI providers + profile allowlistDomains
MCP Sidecar       → ralph-internal + ralph-sidecar-external → direct internet (unrestricted)
```

**Agent:** Runs on `ralph-internal` only. All HTTP/HTTPS traffic routes through Squid, which enforces a domain allowlist: the backends of the agent CLIs the task's container stages run (Anthropic for Claude Code; GitHub Copilot and GitHub for Copilot CLI) plus the profile's `allowlistDomains` (for the bundled profiles: package registries, Azure DevOps hosts and feeds). Even if the agent unsets `HTTPS_PROXY` env vars, direct egress fails — there's no route from the internal network to the internet. The proxy is the only bridge.

**MCP Sidecar:** Connected to both `ralph-internal` (to accept tool calls from the agent) and `ralph-sidecar-external` (a bridge network with direct internet access). The sidecar has no proxy configured — it reaches external APIs directly. JIRA, ADO REST, git push, documentation sites and web fetches are designed to go through MCP tools rather than the agent's own requests.

Outside the AI providers and the profile's `allowlistDomains`, agent internet access is gated through MCP tool calls, which the pre-tool hook logs. The allowlisted domains themselves are reachable directly, with whatever credentials the agent can read (see [SECURITY.md](SECURITY.md#credentials-in-the-agent-container)).

Squid access logs are collected per task for allowlist tuning — both allowed and denied requests are logged.

### Container Hardening

| Control              | Implementation                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| No Docker socket     | Removed from all compose files                                                                                                       |
| No Docker CLI        | Removed from Dockerfiles                                                                                                             |
| No sudo              | Profile images (`ubuntu:22.04`, `node:24-bookworm-slim`) don't install sudo; the CLI runs as the unprivileged `vscode` user          |
| Capability drop      | `cap_drop: ALL` — all Linux capabilities dropped. `cap_add: DAC_OVERRIDE, CHOWN` re-added for Docker volume cleanup (to be revised). |
| Privilege escalation | `no-new-privileges: true` — prevents setuid/setgid                                                                                   |
| Resource limits      | Memory: 8G, CPU: 4, PIDs: 500                                                                                                        |
| npm without root     | User-writable npm prefix (`~/.npm-global`) — no sudo needed for `npm install -g`                                                     |

### Compose Security Overlay

The security overlay (`shared/security/docker-compose.security.yml`) is merged with each profile's base compose file. It adds the `egress-proxy` sidecar (Squid), `ralph-internal` network (`internal: true`), `ralph-external` network, `ralph-sidecar-external` network (bridge network for MCP sidecar direct internet access), proxy env vars, read-only audit hook mounts, `cap_drop: ALL` (plus `cap_add: DAC_OVERRIDE, CHOWN`), `no-new-privileges`, and resource limits. See [SECURITY.md](SECURITY.md) for details.

### MCP Config System (`src/container/setup/`)

Each profile declares MCP servers in `profile.json` (`mcpServers` array). Variants can declare additional servers — the effective set per variant is the union of profile-level and variant-level servers. At startup, `resolveAllProfileSetup()` resolves the union of all servers across all variants to manifests in `shared/mcp-servers/<name>/mcp-server.json` and generates several files per profile in `.build/`:

1. **`mcp-config.json`** — URL-based config shared by both CLIs. Contains `{ type, url }` entries plus each manifest's `tools` allowlist — no secrets. Copilot reads it via `--additional-mcp-config @<path>`; Claude Code via `--mcp-config --strict-mcp-config`. The sidecar enforces the same allowlist: for each server with `tools`, the gateway's tool-filter proxy serves `sidecarPort`, drops other tools from `tools/list` and refuses calls to them (JSON-RPC `-32602`), while the server listens on `127.0.0.1:<sidecarPort + 10000>`.
2. **`gateway.json`** — Per-profile sidecar config with server commands, args, ports, and embedded secrets. The sidecar only starts servers the profile declares — a profile with `["jira-kentico", "ado"]` never spawns `discord-hitl`.
3. **`docker-compose.overlay.yml`** — Injects base env vars into the agent container (`GH_TOKEN`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_DISABLE_*`). Defines the `mcp-sidecar` service (when MCP servers are declared), mounts `mcp-config.json`, the Copilot CLI settings, rendered agents, skills and resource files.
4. **`squid.conf`** — The shared baseline (`shared/security/squid.conf`) with the profile's `allowlistDomains` inserted. MCP servers need no entries; the sidecar has direct internet access.
5. **`copilot-settings.json`** — Copilot CLI settings with `allowedUrls` derived from the domains in `squid.conf` and its host loopback ports. Domain-level only.

Startup files cover the union of all variants. Before each task, `ComposeOverlayWriter` (`compose-overlay-writer.ts`) regenerates `mcp-config.json`, `gateway.json` and the overlay for the matched variant's servers and skills, and `JitMcpConfigWriter` merges task-scoped env values into `gateway.json`.

The setup modules are split by responsibility: `mcp-manifest.ts` (types/loading), `mcp-config.ts` (CLI config), `compose-overlay.ts` (overlay generation), `compose-overlay-writer.ts` (per-task regeneration), `squid-config.ts` (proxy config), `url-restrictions.ts` (Copilot URL allowlist), `jit-mcp-params.ts` (per-task macro resolution), `profile-setup.ts` (orchestrator).

Server types: `npm` (pre-installed stdio packages, bridged in the gateway process behind the tool-filter proxy) and `custom` (locally built, esbuild-bundled to `dist/`, launched with `--transport http --port <port> --host <address>`). See [MCP.md](MCP.md) for the full MCP reference.

### Runtime URL Enforcement

Squid's domain filtering is backed by two CLI-side mechanisms in the container:

1. **Copilot CLI URL allowlist** (`copilot-settings.json`, `src/cli/copilot/copilot-settings.ts`) — the same domains as the profile's `squid.conf`, as `https://*.domain` / `https://domain` patterns, plus host loopback ports. It does not restrict paths, so it does not prevent cross-org use of an allowlisted API.
2. **Pre-tool hook audit logging** (`shared/hooks/log-pre-tool.sh`) — logs every tool invocation to `pre-tool.log` (JSONL, streamed to host in real-time) for observability. It never blocks a call.

Local-mode stages get neither. See [SECURITY.md](SECURITY.md) for the full threat model and defense layering.

## Design Decisions

1. **One task at a time** — Sequential processing avoids container conflicts and simplifies state management.
2. **Fresh container per task** — Clean state prevents leakage between tasks. Trade-off: ~2-5 min container startup.
3. **Profile variants** — Each profile can have multiple variants with different match rules, sharing the same Docker infrastructure. Variants are "exploded" into flat `IAgentProfile[]` at load time (one entry per variant, keyed by `variantKey`).
4. **Sequential stage pipeline** — Each variant defines a `stages` array. Stages execute sequentially within a single container lifecycle (one startup, one teardown). Each stage can use a different agent, model, skills, timeout, and execution mode (`container` or `local`). Local-mode stages run on the host without Docker. The pipeline aborts on the first stage failure.
5. **Centralized infrastructure** — All Docker, agent, and hook files live in the orchestrator repo under `profiles/` and `shared/`. Target repos contain no Ralph-specific files. Compose files use overlay file mounts to inject agent definitions into containers without modifying the host repo.
6. **Session transcripts** — Copilot CLI's `--share` flag exports a full session transcript (conversation, tool calls, reasoning). For Claude Code, `RunArtifactsDeriver` renders one from the exported session logs (main thread and subagents) and writes run telemetry beside it. Every transcript is scrubbed of credentials with the audit hooks' redactor before it is attached to the JIRA issue for auditability.
7. **Per-task streaming logs** — Each task gets its own log file written in real-time (container output only). If the agent crashes mid-run, partial output is immediately available without parsing the daily aggregate.
8. **Network-level isolation over env var trust** — The `internal: true` Docker network prevents direct egress even if the agent unsets proxy env vars. This is enforcement, not convention.
9. **Security overlay separation** — The Squid proxy, network isolation, and resource limits are in a separate compose file merged at runtime. This keeps security concerns out of the base compose and allows easy toggling for debugging.
10. **Shared MCP config** — Both Copilot CLI and Claude Code CLI use the same `mcp-config.json` format. One generated file serves both, avoiding format divergence.
11. **MCP least-privilege** — MCP servers are declared at profile level (shared) and optionally at variant level (scoped). The effective set per variant is the union. The agent only sees tools from its effective servers — a variant without `codegraphcontext` has no graph query tools. Per-profile `gateway.json` ensures the sidecar only starts declared servers, and MCP credentials stay in the sidecar. The agent's Squid allowlist is limited to AI providers plus the profile's `allowlistDomains`; other outbound calls (JIRA, ADO REST API, documentation sites, web fetch) go through MCP tools in the sidecar. Per-server `tools` allowlists are enforced by the sidecar's tool-filter proxy as well as passed to the CLI. `GH_TOKEN` and `ANTHROPIC_API_KEY` are still present in every agent container (see [SECURITY.md](SECURITY.md#credentials-in-the-agent-container)).
