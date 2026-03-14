# Dual-Family Architecture: Manual vs Orchestrator-Deployed Docwriter

**Context**: The current docwriter family (22 agents + 3 new) is designed for manual deployment — a human runs `@docwriter` in VS Code Copilot Chat. The Ralph orchestrator can eventually deploy these agents autonomously via Docker containers. This document describes how to support both deployment modes.

---

## Two Deployment Families

### Family 1: Manual (current focus, Phases 1-7)

- **Invocation**: Human types `@docwriter` in VS Code chat
- **Agent format**: `.agent.md` files with VS Code frontmatter
- **Bootstrap**: Human runs `bash docwriter-bootstrap.sh` before first invocation
- **Artifact persistence**: `.docwriter/meta/` directory in the target repo (committed or gitignored per user preference)
- **MCP tools**: Whatever the user's VS Code instance has configured
- **Internet access**: Direct (user's network), `fetch` tool available in Copilot
- **Skill access**: `.github/skills/docwriter-meta/` must exist in the repo (created by bootstrap)
- **Re-entry**: Orchestrator agent handles re-entry within a single VS Code session. If session breaks, human re-invokes `@docwriter` and it resumes from progress.json state
- **Knowledge persistence**: `.docwriter/meta/` survives between manual runs (committed to repo or left on disk)

### Family 2: Orchestrator-Deployed (future)

- **Invocation**: Ralph orchestrator creates a Docker container, mounts the agent files, runs Copilot/Claude CLI
- **Agent format**: Liquid templates in `profiles/<id>/agents/` → rendered to `.agent.md` at runtime
- **Bootstrap**: Orchestrator runs `docwriter-bootstrap.sh` as part of container setup (automated)
- **Artifact persistence**: `.docwriter/meta/` must survive across container runs. Options:
  - Mounted volume from host
  - Committed to a `.ralph-meta` branch in the target repo
  - Stored in Ralph's output directory and re-mounted
- **MCP tools**: Configured via `profile.json` mcpServers declarations + sidecar
- **Internet access**: Proxied through Squid (ralph-internal network). Research-scout fetches go through proxy.
- **Skill access**: Mounted via bind-mount from orchestrator's `shared/skills/` directory
- **Re-entry**: Orchestrator's continuation loop handles CLI session re-invocations automatically
- **Knowledge persistence**: Orchestrator manages meta-knowledge persistence between runs

---

## What Differs Between Families

| Aspect | Manual | Orchestrator |
|---|---|---|
| Agent file format | Static `.agent.md` | Liquid templates → rendered `.agent.md` |
| Bootstrap | Human runs script | Automated by profile setup |
| Meta persistence | Repo-local (user manages) | Volume-mounted (orchestrator manages) |
| MCP config | User's VS Code config | Generated `mcp-config.json` per profile |
| Fetch/internet | Direct network | Squid-proxied network |
| Skill mounting | Local `.github/skills/` | Bind-mounted from orchestrator |
| Re-entry handling | Single session or manual resume | Continuation loop with `--continue` |
| Trigger | Human | JIRA comment trigger |
| Context.json | Human fills `<FILL:>` placeholders | Orchestrator auto-populates from JIRA/ADO data |

## Task Graphs

Both families have structured task graphs for dependency tracking:

| Family | File | Tasks | Phases |
|---|---|---|---|
| Manual | `task-graph-manual.json` | 30 | 7 (augment existing 22 agents) |
| Orchestrator | `task-graph-orchestrator.json` | 37 | 4 (from-scratch profile + all 29 agents) |
| _(unified, superseded)_ | `task-graph.json` | 30 | 7 (original pre-split) |

Cross-references between manual and orchestrator tasks are in `task-graph-orchestrator.json § crossReferences`.

---

## Implementation Strategy

### Manual Family (task-graph-manual.json)

All 30 tasks from Phases 1-7 implement the manual family — static `.agent.md` files deployed to a target repo. The agent files, bootstrap, meta-knowledge system, and skill are designed to work in a plain VS Code environment with no orchestrator dependency. Tracked in `task-graph-manual.json`.

**This is the right order** because:
1. Manual deployment is simpler to test (no Docker/proxy/container orchestration)
2. The knowledge system design is identical — only the persistence mechanism differs
3. Agent behavior is the same in both families — only deployment wrapper changes

The orchestrator family can also be built independently (from scratch) using `task-graph-orchestrator.json` — it doesn't require the manual family to exist first. The two plans are parallel-safe.

### Orchestrator Family (task-graph-orchestrator.json)

The orchestrator family is fully planned in `task-graph-orchestrator.json` — 37 tasks across 4 phases:

- **Phase A: Profile Infrastructure** — Dockerfile, docker-compose.yml, profile.json, setup.sh, meta-knowledge volume persistence, Squid allowlist, shared Liquid partials, shared skills
- **Phase B: Agent Templates** — All 29 agents as Liquid templates using `{{ taskId }}`, `{{ triggerParams.* }}`, `{% render 'prompt-security' %}`, trigger param conditionals, JIRA context auto-population
- **Phase C: Orchestrator Wiring** — Data source registration, MCP server declarations (`$task.*` macros), skill mounting, variant match rules, continuation loop tuning, RepoSyncHook for `.docwriter/` exclusion
- **Phase D: Integration Testing** — Docker build, bootstrap verification, MCP tool availability, meta-knowledge persistence across container restarts, template rendering validation, end-to-end JIRA trigger test

Key orchestrator-specific concerns with no manual equivalent:
1. **Liquid template JIT rendering** — `AgentTemplateRenderer` with full `TemplateContext`
2. **JIRA task context** — `{{ taskId }}`, `{{ taskTitle }}`, `{{ taskDescription }}` instead of human-filled `<FILL:>` placeholders
3. **MCP sidecar + Squid proxy** — research-scout fetches via `web-fetch` MCP tool → sidecar → proxy
4. **Meta-knowledge volume persistence** — `.docwriter/meta/` survives container teardown
5. **Trigger param parsing** — `@Docwriter(verbose, skip_research)` → conditional template sections
6. **Continuation loop** — 9-pass pipeline may need multiple CLI sessions
7. **RepoSyncHook** — `.docwriter/` in `.git/info/exclude`

---

## Key Principle: Agent Logic is Identical

The agents themselves (curator, synthesizer, scout, all specialists) have **identical behavior** in both families. The only differences are in the deployment wrapper:
- How they're invoked (VS Code chat vs. CLI)
- How artifacts are persisted (local disk vs. mounted volume)
- How internet access works (direct vs. proxied)
- How context is populated (human vs. automated)

This means Phases 1-7 produce agents that work in BOTH families with minimal adaptation. The orchestrator adaptation (Phase 8) is a wrapping exercise, not a rewrite.
