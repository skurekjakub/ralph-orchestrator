# JIRA Kentico MCP Server — Configuration

JIRA Cloud integration — add comments and attachments to issues via the REST API v3.

**Sidecar port:** 9100

## Environment Variables

### Required (orchestrator `.env`)

| Variable     | Description                                      |
| ------------ | ------------------------------------------------ |
| `JIRA_PAT`   | JIRA API token (from Atlassian account settings) |
| `JIRA_EMAIL` | Email address associated with the JIRA API token |

These are set in the orchestrator's `.env` file and injected into the sidecar at startup via `requiredEnv` in the manifest.

### Required (profile `env` block)

| Variable         | Description                               | Macro support |
| ---------------- | ----------------------------------------- | ------------- |
| `JIRA_ISSUE_KEY` | JIRA issue key to scope all operations to | `$task.id`    |

When `JIRA_ISSUE_KEY` is set, the `issueKey` parameter is removed from all tool input schemas — the agent doesn't need to specify which issue to operate on.

## Profile Wiring

Add to the `mcpServers` array in `profile.json`:

```json
{
  "name": "jira-kentico",
  "env": {
    "JIRA_ISSUE_KEY": "$task.id"
  }
}
```

The `$task.id` macro resolves to the current JIRA issue key at runtime (e.g. `DF-1234`).

## Tools

### `jira_add_comment`

Add a comment to a JIRA issue. The comment body uses JIRA wiki markup (`h3.` for headings, `{{code}}` for inline code, `{code:lang}...{code}` for blocks, `bq.` for blockquotes). Use real newlines — do not use literal `\n` escape sequences.

| Parameter  | Type   | Required    | Description                                          |
| ---------- | ------ | ----------- | ---------------------------------------------------- |
| `body`     | string | yes         | Comment body in JIRA wiki markup                     |
| `issueKey` | string | conditional | JIRA issue key — hidden when `JIRA_ISSUE_KEY` is set |

### `jira_add_attachment`

Attach a file to a JIRA issue. The file must be placed in `/tmp/mcp-attachments/` inside the container.

| Parameter  | Type   | Required    | Description                                                     |
| ---------- | ------ | ----------- | --------------------------------------------------------------- |
| `fileName` | string | yes         | Name of the file in `/tmp/mcp-attachments/` (e.g. `handoff.md`) |
| `issueKey` | string | conditional | JIRA issue key — hidden when `JIRA_ISSUE_KEY` is set            |
