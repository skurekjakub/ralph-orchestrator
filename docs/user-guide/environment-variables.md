# Environment Variables

All secrets and credentials are stored in `.env` at the project root. Never committed to git.

## Required

At least one of `GH_TOKEN` or `ANTHROPIC_API_KEY` must be set.

| Variable | Description |
|---|---|
| `GH_TOKEN` | GitHub PAT with **Copilot Requests** permission. Required for `cli: "copilot"` profiles |
| `ADO_PAT` | Azure DevOps PAT for the target ADO org (Code: Read+Write). Default credential for `vcsProvider: "ado"` profiles |

## Optional

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key. Required for `cli: "claude"` profiles |
| `ADO_PAT_XPERIENCE` | ADO PAT for secondary org access (Code: Read). Agent skips related operations if unset |
| `DASHBOARD_URL` | Ralph Status Dashboard URL. Required if `dashboard.enabled` is `true` |
| `DASHBOARD_SECRET` | Shared secret for dashboard auth. Required alongside `DASHBOARD_URL` |
| `DISCORD_BOT_TOKEN` | Discord bot token for the `discord-hitl` MCP server |
| `DISCORD_CHANNEL_ID` | Discord channel ID for human-in-the-loop threads. Paired with `DISCORD_BOT_TOKEN` |

## Per-Data-Source Variables

For each data source key in `config.json`, JIRA connectors look for credentials following this naming convention:

```
JIRA_PAT_<KEY>
JIRA_EMAIL_<KEY>
```

Where `<KEY>` is the data source key **uppercased with dashes replaced by underscores**.

| Data Source Key | PAT Variable | Email Variable |
|---|---|---|
| `kentico-jira` | `JIRA_PAT_KENTICO_JIRA` | `JIRA_EMAIL_KENTICO_JIRA` |
| `my-jira` | `JIRA_PAT_MY_JIRA` | `JIRA_EMAIL_MY_JIRA` |

## Per-Variant Variables

MCP server configs using `$variantEnv.PREFIX` macros resolve to env vars named:

```
<PREFIX>_<PROFILEID>_<DISPLAYNAME>
```

All uppercase, dashes/dots/slashes converted to underscores.

| Macro | Profile ID | Display Name | Resolved Env Var |
|---|---|---|---|
| `$variantEnv.NODEBB_TOKEN` | `ralph-docs` | `ralph` | `NODEBB_TOKEN_RALPH_DOCS_RALPH` |
| `$variantEnv.NODEBB_TOKEN` | `ralph-docs` | `malph` | `NODEBB_TOKEN_RALPH_DOCS_MALPH` |

See [Runtime Macros](runtime-macros.md) for full macro reference.
