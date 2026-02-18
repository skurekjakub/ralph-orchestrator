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

## Source Directory Map

| Directory | Purpose |
|---|---|
| `src/` | Orchestrator entry point (`index.tsx`), main loop (`orchestrator.ts`), config loading, logger, retry utility |
| `src/jira/` | JIRA REST API v3 client, JQL poller, JQL builder from profile match rules, field extraction |
| `src/container/` | Container lifecycle (`manager.ts`), docker compose wrapper (`compose-client.ts`), CLI executors (Copilot + Claude Code), result parser, log collector, streaming capture |
| `src/prompt/` | Prompt builder (`prompt.ts`), content normalizer (`normalizer.ts`), prompt injection auditor (`prompt-auditor.ts`) |
| `src/services/` | Orchestration services — trigger scanner, profile router, task runner, operation ledger, preflight checks, activity log, heartbeat, JIRA comment templates |
| `src/validate/` | Startup validation — env vars, config, profiles, Docker, security infrastructure |
| `src/logs/` | Execution summary writer |
| `src/dashboard/` | Ink (React for terminal) dashboard components — status, queue, history, log panels |
| `profiles/` | Per-profile Docker infrastructure — Dockerfile, compose file, setup script, agent `.md` templates |
| `shared/security/` | Security overlay — Squid proxy config, compose security overlay (network isolation, resource limits) |
| `shared/hooks/` | Copilot CLI audit hooks (session logging) |
| `shared/agent-includes/` | Shared include files for agent templates (JIRA API, ADO API references, prompt security) |
| `ralph-dashboard/` | Next.js status dashboard (Vercel + Upstash Redis) — multi-agent, auto-refreshing |
| `dashboard-local/` | Local development dashboard (Vite + React) |
| `tests/` | Vitest test suite |
| `scripts/` | Utility scripts (reset test env, validate config) |

## Commands

- `npm run dev` — Run in development mode (tsx)
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled output
- `npm test` — Run tests (vitest)
- `npm run lint` — Type-check without emitting

## Docker & Security

Containers are managed via `docker compose` with a **two-file merge** pattern:
1. **Base compose** — `profiles/<id>/docker-compose.yml` (services, volumes, build config)
2. **Security overlay** — `shared/security/docker-compose.security.yml` (proxy sidecar, network isolation, resource limits)

`ComposeClient` automatically injects both files: `docker compose -f base.yml -f security.yml <command>`

### Network Isolation

Agent containers run on an **internal-only Docker network** (`internal: true`) with no direct internet access. All HTTP/HTTPS traffic is routed through a **Squid forward proxy sidecar** that enforces a domain allowlist (`shared/security/squid.conf`).

```
Agent container (internal network only) → Squid proxy → allowlisted domains only
```

Even if the agent unsets `HTTPS_PROXY` env vars, direct egress fails — there's no route from the internal network to the internet. The proxy is the only bridge.

### Container Hardening

- **No Docker socket** — removed from all compose files (was vestigial from devcontainer migration)
- **No Docker CLI** — removed from Dockerfiles
- **No sudo** — disabled for vscode user (`/etc/sudoers.d/vscode` removed)
- **`cap_drop: ALL`** — all Linux capabilities dropped
- **`no-new-privileges: true`** — prevents privilege escalation via setuid
- **Resource limits** — memory (8G), CPU (4), PIDs (500)
- **User-writable npm prefix** — `~/.npm-global` allows `npm install -g` without root
- **Proxy log collection** — Squid access logs collected per task for allowlist tuning

The allowlist (`shared/security/squid.conf`) is tuned to the specific domains the agent needs (LLM backends, JIRA, ADO, npm, rubygems, etc.).

### Compose Commands

```bash
# ComposeClient handles the two-file merge automatically. Manual equivalent:
docker compose -f profiles/ralph-docs/docker-compose.yml \
  -f shared/security/docker-compose.security.yml up -d --build

# Exec inside container
docker compose -f ... exec --user vscode app <command>

# Teardown
docker compose -f ... down --volumes --remove-orphans
```

No piping to `head` or `tail` — always show full output.

## Configuration

- `config.json` — Global settings (JIRA connection, polling interval, output paths, dashboard toggle)
- `profiles/*/profile.json` — Per-profile config with agent variants, repo path, CLI preference, and match rules
- `.env` — Secrets (JIRA token/email, GitHub PAT, Anthropic API key, ADO PATs, dashboard URL/secret)
- See `CONFIGURATION.md` for the full configuration reference

### Agent Profiles

Each profile directory under `profiles/` contains a `profile.json` that maps JIRA issues to a repo and agent configuration. Profiles are auto-discovered at startup.

**Profile-level fields** (shared by all variants):
- `repo` — path to the target repository
- `cli` — `"copilot"` (default) or `"claude"` — which CLI to use. Falls back to the other CLI if the preferred one's credential is missing.
- `model` — optional model override (Copilot defaults to `claude-opus-4.6`; Claude Code uses its own default). Can be overridden per-variant.
- `timeoutMs` — execution timeout
- `beforeAgent.transitionId` / `afterAgent.transitionId` — JIRA transitions applied before/after agent execution

**Variant-level fields** (each variant expands into a separate routing entry):
- `agent` — Copilot CLI agent name (must match `<name>.agent.md` file in the profile's `agents/` directory)
- `model` — optional model override (overrides profile-level)
- `match.projects` — JIRA project keys to match
- `match.statuses` — only match issues in these JIRA statuses (empty = any status)
- `match.commentTrigger` — JIRA comment must contain this string (case-insensitive) to trigger the variant
- `match.revisionStatuses` — statuses that indicate a revision task. Agent receives `Mode: REVISION` with the previous handoff.

The `agentName` field on `AgentProfile` stores the raw CLI name (e.g. `ralph.ralph`). The `displayName` field strips the `ralph.` prefix for use in JIRA comments and logs.

## Profile Infrastructure

All Docker and agent infrastructure is centralized in the orchestrator repo. Target repos contain no Ralph-specific files.

```
profiles/
  <profile-id>/
    profile.json        — Profile config: repo, cli, variants, transitions
    Dockerfile          — Container image definition
    docker-compose.yml  — Base compose (services, env vars, volume mounts)
    setup.sh            — Post-create setup (AI CLI installs, git config, deps)
    agents/             — Agent template files (.agent.md with include markers)
      .build/           — Resolved agent files (generated at startup, gitignored)
shared/
  security/             — Container security infrastructure
    docker-compose.security.yml — Squid sidecar, network isolation, resource limits
    squid.conf          — Domain allowlist for egress proxy
  hooks/                — Copilot CLI audit hooks (shared across all profiles)
  agent-includes/       — Shared include files for agent templates
```

Agent templates use `<!-- include: name.md -->` markers resolved from `shared/agent-includes/` at startup. Resolved files go to `agents/.build/` and are mounted read-only into containers.

Compose files use `TARGET_REPO_PATH`, `SHARED_HOOKS_PATH`, and `SQUID_CONF_PATH` (injected by ComposeClient) for volume mounts.

## JIRA Integration

- Projects: **DF**, **DOC**
- JQL filter: auto-generated from profile match rules, results deduplicated by issue key, auto-paginated
- **Comment-triggered:** The poller discovers issues via JQL, then scans comments for `commentTrigger` matches. Unconsumed triggers are planned in the operation ledger.
- On trigger discovery: posts an ack comment ("🤖 Got it! Queueing [agent]...")
- On pickup: applies `beforeAgent` transition + runs the agent
- On completion: applies `afterAgent` transition; Ralph posts a completion comment + attaches the handoff file
- On error: orchestrator posts an error comment; records error in the ledger
- Auth: Basic (`email:apiToken`)
- API base: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`

### Operation Ledger

Persistent per-issue operation history (`output/logs/history/<issueKey>.json`):

```
pending → active → completed | error
              ↗
rejected (invalid state, conflict, preflight fail)
```

- Comment-trigger dedup — each trigger comment consumed exactly once per variant
- Crash recovery — `active` operations from previous sessions marked as `error` on startup
- Pending operations survive restart

## Log Collection

The `ContainerLogCollector` (`src/container/log-collector.ts`) manages per-task log collection from both the `app` and sidecar containers. Log sources are registered with a capture mode (stream or collect) and flushed to disk after execution.

After each task, the orchestrator collects:
- `<key>-<ts>-audit.jsonl` — Audit trail from hooks
- `<key>-<ts>-transcript.md` — Copilot CLI session transcript (via `--share`)
- `<key>-<ts>-tool-output.log` — Untruncated tool output from hooks
- `<key>-<ts>-proxy.log` — Squid access log (allowed/denied domains)
- `<key>-<ts>-summary.json` — Execution metadata
- `<key>-<ts>.log` — Per-task streaming log (real-time container output)
- `activity-YYYY-MM-DD.log` — Persistent daily activity log
- `history/<issueKey>.json` — Operation ledger

Session transcripts are also attached to the JIRA issue. Proxy logs are collected even on error (for allowlist debugging).

## Conventions

- ESM-only (`"type": "module"` in package.json)
- All imports use `.js` extensions (NodeNext module resolution)
- No JIRA SDK — native `fetch` against REST API v3
- `execa` v9 for all subprocess management
- Tests use `vitest` in `tests/` directory
- All components accept a `Logger` interface for centralized log routing
- Copilot CLI defaults to `--model claude-opus-4.6` (configurable via profile `model`)
- Claude Code CLI uses `--dangerously-skip-permissions`
- NEVER REEXPORT, update original imports instead

### Comments

- Only add comments that explain **why** something works a certain way, or document non-obvious behavior and edge cases.
- Never add comments that restate what the code already says.
- Never add comments about previous behavior or changelog-style notes.
- Section-separator comments are unnecessary when the code structure is self-evident.
- JSDoc on public interfaces, types, classes, and methods is encouraged.

## Agent Workflow Rules

**After completing any task, always use `ask_questions` to prompt for the next task.** See `.github/copilot-agent-instructions.md` for details. This is mandatory — never end a turn without it.
