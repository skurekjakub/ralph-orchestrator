# Ralph Orchestrator — User Guide

Ralph Orchestrator autonomously processes work items by polling data sources (JIRA), routing matched issues to agent profiles, running AI CLIs inside isolated Docker containers, and collecting results.

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
4. The task runner transitions the JIRA issue, syncs the repo, spins up the container, and runs the agent CLI
5. After execution, results are collected, logs archived, and the JIRA issue transitioned

One operation runs at a time. The main loop is event-driven (no busy polling).

## Reference Pages

| Page                                              | What It Covers                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Configuration](configuration.md)                 | `config.json` — data sources, output paths, dashboard, prompt audit, Ralphchives                    |
| [Environment Variables](environment-variables.md) | `.env` — credentials, per-datasource keys, per-variant secrets                                      |
| [Profiles](profiles.md)                           | `profile.json` — full schema, variants, stages, match rules, hooks, creating a profile from scratch |
| [Trigger Parameters](trigger-parameters.md)       | JIRA comment syntax, recognized parameters per agent                                                |
| [Template Variables](template-variables.md)       | Liquid variables available in `.agent.md` templates                                                 |
| [Skills](skills.md)                               | All available skills by category, workflow phase tables, variant assignments                        |
| [MCP Servers](mcp-servers.md)                     | Declaring MCP servers in profiles + available server reference                                      |
| [Runtime Macros](runtime-macros.md)               | `$task.*`, `$trigger.*`, `$variantEnv.*` — dynamic value resolution in MCP config                   |

## Commands

```bash
npm run dev          # Development mode (tsx, no build)
npm run build        # Compile TypeScript
npm start            # Validate + build + run
npm test             # Lint + build + vitest
npm run validate     # Pre-start env/config/Docker/profile checks
```
