## Project Overview

Ralph Orchestrator is a standalone Node.js + TypeScript application that autonomously processes documentation tasks. It polls JIRA for issues, starts Docker containers, runs an AI meta-agent inside them, and collects results.

## Architecture

```
JIRA poller → comment discovery → operation ledger → task runner → task result writer
                                       ↓
                              docker compose exec <cli>
                                  (copilot | claude)
                                       ↓
                              ralph meta-agent (subagents: researcher, reviewer)
                                       ↓
                              git push + ADO PR via REST API
```

**Comment-driven.** All agent invocations are triggered by JIRA comments matching a `commentTrigger` string (e.g. `@RalphDf`). Comments can include parenthesized parameters (`@RalphDf(codesamples, verbose)`) which are parsed into `triggerParams` and passed to agent templates. The orchestrator polls JIRA for issues, scans their comments for triggers, plans operations in a persistent ledger, and executes them one at a time.

**One task at a time.** The orchestrator processes a single operation before moving to the next.

## Source Directory Map

| Directory | Purpose |
|---|---|
| `src/` | Orchestrator entry point (`index.tsx`), main loop (`orchestrator.ts`), logger, retry utility |
| `src/config/` | Configuration types (`types.ts`), Zod validation schemas (`schemas.ts`), config + profile loader (`loader.ts`), constants (`constants.ts`) |
| `src/datasource/` | Data source abstraction layer — `WorkItem` types, `IDataSourceConnector` interface, `IWorkItemPoller`, plugin registry (`registry.ts`) |
| `src/datasource/connectors/jira/` | JIRA connector — REST API v3 client, JQL builder, field extraction, `JiraIssue` → `WorkItem` mapper, self-registers via `registerDataSourceFactory("jira", ...)` |
| `src/container/` | Container lifecycle (`manager.ts`), lifecycle hooks (`lifecycle.ts`), docker compose wrapper (`compose-client.ts`), CLI path types and `deriveStageProfile()` (`types.ts`), result parser, log collector, streaming capture |
| `src/container/cli-executors/` | CLI executors — Copilot (`copilot-executor.ts`), Claude Code (`claude-code-executor.ts`), local host-side (`local-copilot-executor.ts`), shared execution helper (`shared-exec.ts`), executor factory (`cli-executor-factory.ts`) |
| `src/container/setup/` | Agent template renderer (`agent-includes.ts`), MCP manifest loading (`mcp-manifest.ts`), CLI MCP config (`mcp-config.ts`), JIT task-scoped MCP params (`jit-mcp-params.ts`), compose overlay generation (`compose-overlay.ts`), squid proxy config (`squid-config.ts`), profile setup orchestrator (`profile-setup.ts`), compose file resolution (`compose-files.ts`), resource volume mounts (`resource-mounts.ts`) |
| `src/prompt/` | Prompt builder (`prompt.ts`), content normalizer (`normalizer.ts`), prompt injection auditor (`prompt-auditor.ts`) |
| `src/services/` | Orchestration services — trigger scanner, profile router, task runner, task result writer, operation ledger, preflight checks, VCS PR metadata lookup, activity log, heartbeat, JIRA comment templates |
| `src/validate/` | Startup validation — env vars, config, profiles, Docker, security infrastructure |
| `src/util/` | Utility functions — branch name slugification |
| `src/logs/` | Execution summary writer |
| `src/dashboard/` | Ink (React for terminal) dashboard components — status, queue, history, log panels |
| `profiles/` | Per-profile Docker infrastructure — Dockerfile, compose file, setup script, agent `.md` templates |
| `shared/security/` | Security overlay — Squid proxy config, compose security overlay (network isolation, resource limits) |
| `shared/hooks/` | Copilot CLI audit hooks (session logging) |
| `shared/agent-includes/` | Shared Liquid partials for agent templates (`*.md` — ADO API, prompt security, personality, source references, workflow includes). Supports subdirectories (e.g. `personality/`, `ralph-docs/`). |
| `shared/mcp-servers/` | MCP server manifests and custom server code (one subdirectory per server) |
| `shared/skills/` | Shared agent skill folders, mounted per-profile into `.github/skills/` inside containers (excluded from git via `.git/info/exclude` managed by `RepoSyncHook`) |
| `ralph-dashboard/` | Next.js status dashboard (Vercel + Upstash Redis) — multi-agent, auto-refreshing |
| `dashboard-local/` | Local development dashboard (Vite + React) |
| `tests/` | Vitest test suite |
| `scripts/` | Utility scripts (reset test env, validate config, replay hooks) |

## Commands

- `npm run dev` — Run in development mode (tsx)
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled output
- `npm test` — Run tests (vitest)
- `npm run lint` — Type-check without emitting (src + tests)

## Docker & Security

Containers use a **three-file compose merge**: base (`profiles/<id>/docker-compose.yml`) + security overlay (`shared/security/docker-compose.security.yml`) + resources overlay (`profiles/<id>/.build/docker-compose.overlay.yml`). `ComposeClient` injects all files automatically. The overlay is skipped if absent.

**Network isolation:** Agent runs on `ralph-internal` (internal, Squid-proxied). MCP sidecar bridges `ralph-internal` + `ralph-sidecar-external` (direct internet). Agent can only reach AI providers + package registries; all other outbound calls go through MCP tools.

**Container hardening:** `cap_drop: ALL`, `no-new-privileges: true`, no Docker socket/CLI/sudo, resource limits (8G/4CPU/500 PIDs).

See [ARCHITECTURE.md](ARCHITECTURE.md) § Security and [SECURITY.md](SECURITY.md) for the full threat model, network diagrams, and hardening details. See [docs/compose-layering.md](docs/compose-layering.md) for the compose merge pattern.

## Configuration

- `config.json` — Global settings (data sources, plugins, output paths, dashboard toggle)
- `profiles/*/profile.json` — Per-profile config with agent variants, repo path, CLI preference, and match rules
- `.env` — Secrets (JIRA token/email, GitHub PAT, Anthropic API key, ADO PATs, dashboard URL/secret)

See [CONFIGURATION.md](CONFIGURATION.md) for the full configuration reference (env vars, data sources, profile fields, variant matching, stage pipeline, MCP server config, runtime macros). See [docs/data-source-registration.md](docs/data-source-registration.md) for the plugin integration guide.

### Agent Profiles

Each profile directory under `profiles/` contains a `profile.json` that maps JIRA issues to a repo and agent configuration. Profiles are auto-discovered at startup. Each variant has a `stages` array defining a sequential agent pipeline — stages can run inside Docker (`mode: "container"`) or on the host (`mode: "local"`).

**Bind-mount artifact exclusion.** Docker bind mounts for skills, agent templates, and `.ralph/` create host-side files inside the target repo checkout. The `RepoSyncHook` writes patterns (`.ralph/`, `.github/skills/`, `.github/agents/`) to `.git/info/exclude` before any git operation, preventing these artifacts from blocking checkout, appearing in status, or being staged.

## Profile Infrastructure

All Docker and agent infrastructure is centralized in the orchestrator repo. Target repos contain no Ralph-specific files. See [ARCHITECTURE.md](ARCHITECTURE.md) § Profile Infrastructure for the full directory tree with file descriptions.

Key locations:
- `profiles/<id>/` — Dockerfile, compose, setup script, agent templates (`.agent.md` with Liquid), resources, `.build/` (generated)
- `shared/security/` — Squid proxy compose overlay + domain allowlist
- `shared/agent-includes/` — Shared Liquid partials for agent templates (supports subdirectories)
- `shared/mcp-servers/<name>/` — MCP server manifests + custom server code
- `shared/mcp-sidecar/` — Gateway container (supergateway process manager)
- `shared/skills/` — Shared agent skill folders (mounted per-profile, excluded via `.git/info/exclude`)

Agent templates use Liquid syntax (`{% render 'name' %}`, `{% if isRevision %}`, `{% section "name" %}`) and are rendered JIT before each task by `AgentTemplateRenderer`. See [docs/agent-templates.md](docs/agent-templates.md) for template authoring and the full `TemplateContext` variable reference.

**MCP least-privilege:** Each profile declares which MCP servers it needs via `mcpServers` in `profile.json` (profile-level and/or variant-level). Variants can declare additional servers — the effective set is the union. This enforces least-privilege at tool, network, process, and credential levels. See [MCP.md](MCP.md) for the full MCP reference.

**Task-scoped parameters:** MCP server `env` blocks support `$task.*`, `$trigger.*`, and `$variantEnv.*` runtime macros resolved per-task by `JitMcpConfigWriter`. Server entries also support `sidecarEnv` for container-level env vars (e.g. `CGC_INDEX_PATH`). See [CONFIGURATION.md](CONFIGURATION.md) § MCP Servers for macro reference.

MCP server manifests can also declare `initScript` — a relative path to a shell script in the server directory that runs at sidecar startup before the gateway. At profile setup, `generatePreInitScript()` collects all init scripts and writes a `pre-init.sh` to `.build/`, mounted into the sidecar at `/opt/mcp/pre-init.sh:ro`. Scripts run sequentially; failures are logged but non-fatal.

## Data Source Integration

The orchestrator polls external work item sources via `IDataSourceConnector` implementations. Each profile references a data source by key. The built-in JIRA connector is the reference implementation. See [ARCHITECTURE.md](ARCHITECTURE.md) § Component Details for detailed component descriptions.

**Comment-triggered:** The poller discovers issues via JQL, scans comments for `commentTrigger` matches, parses parenthesized parameters into `triggerParams`, and plans unconsumed triggers in the operation ledger. See [docs/data-source-registration.md](docs/data-source-registration.md) for the plugin integration guide.

**Operation ledger:** Persistent per-issue state machine (`pending → active → completed | error | rejected`). Enables crash recovery and comment-trigger deduplication.

**Continuation loop:** When `maxContinuations > 0`, the container manager retries via CLI `--continue` flag with exponential backoff if the agent session ends without a result block.

## Log Collection

Per-task log collection managed by `ContainerLogCollector` and `TaskResultWriter`. Each task gets a timestamped directory under `output/logs/<key>-<startTs>/` with audit trail, session transcript, proxy/sidecar logs, and execution summary. See [README.md](README.md) § Output for the full file layout.

## Conventions

- ESM-only (`"type": "module"` in package.json)
- All imports use `.js` extensions (NodeNext module resolution)
- No JIRA SDK — native `fetch` against REST API v3
- `execa` v9 for all subprocess management
- Tests use `vitest` in `tests/` directory
- All components accept a `Logger` interface for centralized log routing
- Copilot CLI: `--config-dir /workspace/.ralph`, `--additional-mcp-config @<path>`, `--allow-all-tools`, `--allow-all-paths`, `--share <transcript>`, `--model claude-opus-4.6` (configurable)
- Claude Code CLI: `-p <prompt>`, `--dangerously-skip-permissions`, `--mcp-config /workspace/.ralph/mcp-config.json`, `--strict-mcp-config`
- Both CLIs share the same `mcp-config.json` (generated at startup from profile + variant `mcpServers` declarations, regenerated per-task with the matched variant's effective server list)
- NEVER REEXPORT, update original imports instead

### Dependency Interfaces

Every service class registered in the awilix cradle has a corresponding `I`-prefixed interface defined in the same file (e.g., `IJiraClient` alongside `JiraClient` in `src/datasource/connectors/jira/jira-client.ts`). The class `implements` the interface, and all consumers depend on the interface — never the class.

Only the **cradle factory** (`awilix-cradle.ts`) imports concrete classes for instantiation. This ensures `Mocked<Interface>` is structurally compatible without `as any` casts. See `DEPENDENCY-INJECTION.md` for rationale.

### Comments

- Only add comments that explain **why** something works a certain way, or document non-obvious behavior and edge cases.
- Never add comments that restate what the code already says.
- Never add comments about previous behavior or changelog-style notes.
- Section-separator comments are unnecessary when the code structure is self-evident.
- JSDoc on public interfaces, types, classes, and methods is encouraged.

## Agent Workflow Rules

**After completing any task, output the result and corresponding response fully and then use `ask_questions`.**