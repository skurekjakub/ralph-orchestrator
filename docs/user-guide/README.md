# Ralph Orchestrator — User Guide

Ralph Orchestrator autonomously processes work items by polling data sources (JIRA), routing matched issues to agent profiles, running an agent CLI (Claude Code by default, or GitHub Copilot CLI) inside isolated Docker containers, and collecting results.

```
JIRA poll → comment trigger match → operation ledger → profile variant match
                                                              ↓
                                            task runner → container lifecycle → agent CLI
                                                              ↓
                                                  result collection → JIRA transition + comment
```

## How It Works

1. The orchestrator polls JIRA for issues matching profile variant rules
2. When a JIRA comment matches a `commentTrigger` (e.g. `@Ralph`), the orchestrator plans an operation
3. The operation ledger deduplicates and tracks state (`pending → active | rejected | error`, `active → completed | error`) in `<output.logDir>/history/<dataSource>/<issueKey>.json`
4. The task runner transitions the JIRA issue, creates the task's own clone of the target repo, spins up the containers, and runs each stage's agent CLI: in the agent container, or on the host for a `mode: "local"` stage
5. After execution, results are collected, logs archived, post-task hooks run on the host, and the JIRA issue transitioned

One operation runs at a time. The main loop is event-driven (no busy polling).

## Reference Pages

| Page                                              | What It Covers                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Configuration](configuration.md)                 | `config.json` — data sources, output paths, dashboard, prompt audit, Ralphchives, continuation, Claude Code auth   |
| [Environment Variables](environment-variables.md) | `.env` — CLI credentials, per-datasource keys, per-variant secrets                                                 |
| [Profiles](profiles.md)                           | `profile.json` — full schema, variants, stages and their CLIs, match rules, hooks, creating a profile from scratch |
| [Trigger Parameters](trigger-parameters.md)       | JIRA comment syntax, recognized parameters per agent                                                               |
| [Template Variables](template-variables.md)       | Liquid variables available in `.agent.md` templates                                                                |
| [Skills](skills.md)                               | All available skills by category, workflow phase tables, variant assignments                                       |
| [MCP Servers](mcp-servers.md)                     | Declaring MCP servers in profiles + available server reference                                                     |
| [Runtime Macros](runtime-macros.md)               | `$task.*`, `$trigger.*`, `$variantEnv.*` — dynamic value resolution in MCP config                                  |

## Commands

```bash
npm run dev          # Development mode (tsx, no build)
npm run build        # Bundle src/index.tsx into dist/index.js (esbuild)
npm start            # Validate + build + run the bundle
npm test             # Lint + build + vitest
npm run validate     # Pre-start env/config/Docker/profile checks
```
