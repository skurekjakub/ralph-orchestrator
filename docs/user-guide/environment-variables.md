# Environment Variables

All secrets and credentials are stored in `.env` at the project root. Never committed to git.

## Required

The credential of every CLI a stage runs must be set, plus each profile's `repoPat` variable. Startup validation reports what is missing. An agent container receives only the credential of each CLI its container stages run, as a `${VAR}` reference resolved at compose time. A host (`mode: "local"`) stage, post-task hooks included, gets the same one credential of its own CLI, chosen by `claudeAuth` for Claude Code, and from the rest of the orchestrator's environment only `PATH`, `HOME` and `LANG`.

| Variable                  | Description                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code OAuth token from `claude setup-token`. Required for stages on `cli: "claude"` (default `claudeAuth`)         |
| `ANTHROPIC_API_KEY`       | Anthropic API key. Required instead of `CLAUDE_CODE_OAUTH_TOKEN` when `config.json` sets `claudeAuth: "api-key"`         |
| `GH_TOKEN`                | GitHub PAT with **Copilot Requests** permission. Required for stages on `cli: "copilot"` and for `vcsProvider: "github"` |
| `ADO_PAT`                 | Azure DevOps PAT for the target ADO org (Code: Read+Write). Default credential for `vcsProvider: "ado"` profiles         |

## Optional

| Variable               | Description                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADO_PAT_XPERIENCE`    | ADO PAT for kenticoxperience org (Code: Read, Packaging: Read, Build: Read). Agent skips related operations if unset                                        |
| `DASHBOARD_URL`        | Ralph Status Dashboard URL. Required if `dashboard.enabled` is `true`                                                                                       |
| `DASHBOARD_SECRET`     | Shared secret for dashboard auth. Required alongside `DASHBOARD_URL`                                                                                        |
| `DISCORD_BOT_TOKEN`    | Discord bot token for the `discord-hitl` MCP server                                                                                                         |
| `DISCORD_CHANNEL_ID`   | Discord channel ID for human-in-the-loop threads. Paired with `DISCORD_BOT_TOKEN`                                                                           |
| `DISCORD_TASK_CONTEXT` | Label for Discord thread names (default `Agent`)                                                                                                            |
| `NODEBB_API_URL`       | NodeBB API URL as seen from the MCP sidecar (e.g. `http://host.docker.internal:4567`). Required by the `ralphchives-read` / `ralphchives-write` MCP servers |

MCP servers receive the variables named in their manifest's `requiredEnv` / `optionalEnv` from the orchestrator's environment, through `gateway.json` in the sidecar. The agent container never gets them.

## Per-Data-Source Variables

For each data source key in `config.json`, JIRA connectors look for credentials following this naming convention:

```
JIRA_PAT_<KEY>
JIRA_EMAIL_<KEY>
```

Where `<KEY>` is the data source key **uppercased with dashes replaced by underscores**. Startup fails if either variable is missing for a JIRA data source. The `jira-kentico` MCP server reads `JIRA_PAT_KENTICO_JIRA` / `JIRA_EMAIL_KENTICO_JIRA` by those exact names, whatever your data source key is.

| Data Source Key | PAT Variable            | Email Variable            |
| --------------- | ----------------------- | ------------------------- |
| `kentico-jira`  | `JIRA_PAT_KENTICO_JIRA` | `JIRA_EMAIL_KENTICO_JIRA` |
| `my-jira`       | `JIRA_PAT_MY_JIRA`      | `JIRA_EMAIL_MY_JIRA`      |

## Per-Variant Variables

MCP server configs using `$variantEnv.PREFIX` macros resolve to env vars named:

```
<PREFIX>_<PROFILEID>_<DISPLAYNAME>
```

All uppercase, dashes/dots/slashes converted to underscores.

| Macro                      | Profile ID   | Display Name | Resolved Env Var                |
| -------------------------- | ------------ | ------------ | ------------------------------- |
| `$variantEnv.NODEBB_TOKEN` | `ralph-docs` | `ralph`      | `NODEBB_TOKEN_RALPH_DOCS_RALPH` |
| `$variantEnv.NODEBB_TOKEN` | `ralph-docs` | `malph`      | `NODEBB_TOKEN_RALPH_DOCS_MALPH` |

A missing per-variant variable fails the task when its MCP config is resolved. Both bundled profiles resolve `$variantEnv.NODEBB_TOKEN` for every variant.

See [Runtime Macros](runtime-macros.md) for full macro reference.
