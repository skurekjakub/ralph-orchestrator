# MCP Tool Names per CLI

An MCP server's manifest names its tools (`jira_add_comment`). Each agent CLI shows the agent those tools under a name of its own, built from the server key in `mcp-config.json` and the tool name. Audit records, debug logs and transcripts carry the CLI's name, not the manifest's.

## Claude Code

Claude Code, the default CLI, names an MCP tool `mcp__<server-key>__<tool_name>`:

```
mcp__jira-kentico__jira_add_comment
```

- Built-in tools (`Read`, `Write`, `Edit`, `Bash`, `Skill`, `Agent`, `TaskCreate`, `WebFetch`, …) keep their bare names.
- The audit hooks split an `mcp__` name into `mcpServer` and `mcpTool` and record `toolKind: "mcp"` (`shared/hooks/lib/record.jq`).
- `claudeMcpToolName` (`src/cli/claude/claude-tools.ts`) builds these names; `mcp__<server-key>` alone stands for every tool of the server.

## Copilot CLI

Copilot CLI prefixes each MCP tool with the server key and a dash, as the tool call events in its `pre-tool.log` show:

```
<server-key>-<tool_name>
jira-kentico-jira_add_comment
```

- Built-in tools (`bash`, `edit`, `create`, `view`, `grep`, `glob`, `task`, `skill`, …) keep their bare names.
- Tools of Copilot's bundled GitHub MCP server, enabled only by `githubMcpTools` (`--add-github-mcp-tool`), also keep their bare names (`get_file_contents`).
- The audit hooks record a Copilot MCP call with `toolKind: "other"` and `mcpServer` and `mcpTool` set to `null`.

## Which tools an agent gets

The sidecar's tool-filter proxy enforces each manifest's `tools` allowlist for every CLI ([MCP.md](../../MCP.md)). On top of it:

- **Claude Code.** The canonical agent frontmatter's `tools` lists built-in tools only. The Claude Code agent writer (`src/cli/claude/claude-agent-writer.ts`) appends the MCP tools of the variant's servers to every agent's `tools` line: `mcp__<server>__<tool>` for each tool in the manifest's `tools`, or `mcp__<server>` for a server whose manifest lists none. Every agent of the variant gets the same MCP tools; the agent's own `tools` narrows only the built-in ones.
- **Copilot CLI.** Copilot agent files carry no `tools` key, so an agent sees every tool of its session. Copilot applies the `tools` list of each `mcp-config.json` entry itself.

## Naming tools in templates

Agent templates and skills render for whichever CLI a stage runs. Name an MCP tool by its manifest name and server ("the `ado_push_progress` tool of the ado MCP server"), never by one CLI's prefixed name. Built-in tools have per-CLI names in the template variable `cliTools` (`{{ cliTools.subagent }}` is `Agent` on Claude Code and `task` on Copilot); see [template variables](../user-guide/template-variables.md).

## Tool reference for the `ralph-vscode` profile

The profile runs four MCP servers and no GitHub MCP tools.

### `jira-kentico`

| Manifest tool name    | Claude Code name                         | Copilot CLI name                   |
| --------------------- | ---------------------------------------- | ---------------------------------- |
| `jira_add_comment`    | `mcp__jira-kentico__jira_add_comment`    | `jira-kentico-jira_add_comment`    |
| `jira_add_attachment` | `mcp__jira-kentico__jira_add_attachment` | `jira-kentico-jira_add_attachment` |

### `ado`

| Manifest tool name               | Claude Code name                           | Copilot CLI name                     |
| -------------------------------- | ------------------------------------------ | ------------------------------------ |
| `ado_create_pull_request`        | `mcp__ado__ado_create_pull_request`        | `ado-ado_create_pull_request`        |
| `ado_list_pull_requests`         | `mcp__ado__ado_list_pull_requests`         | `ado-ado_list_pull_requests`         |
| `ado_list_pull_request_threads`  | `mcp__ado__ado_list_pull_request_threads`  | `ado-ado_list_pull_request_threads`  |
| `ado_create_pull_request_thread` | `mcp__ado__ado_create_pull_request_thread` | `ado-ado_create_pull_request_thread` |
| `ado_reply_to_comment`           | `mcp__ado__ado_reply_to_comment`           | `ado-ado_reply_to_comment`           |
| `ado_push_progress`              | `mcp__ado__ado_push_progress`              | `ado-ado_push_progress`              |

### `ralphchives-write`

| Manifest tool name | Claude Code name                           | Copilot CLI name                     |
| ------------------ | ------------------------------------------ | ------------------------------------ |
| `post_task_report` | `mcp__ralphchives-write__post_task_report` | `ralphchives-write-post_task_report` |
| `post_observation` | `mcp__ralphchives-write__post_observation` | `ralphchives-write-post_observation` |
| `reply_to_thread`  | `mcp__ralphchives-write__reply_to_thread`  | `ralphchives-write-reply_to_thread`  |

### `ralphchives-read`

| Manifest tool name   | Claude Code name                            | Copilot CLI name                      |
| -------------------- | ------------------------------------------- | ------------------------------------- |
| `search_ralphchives` | `mcp__ralphchives-read__search_ralphchives` | `ralphchives-read-search_ralphchives` |
| `get_topic`          | `mcp__ralphchives-read__get_topic`          | `ralphchives-read-get_topic`          |
| `list_recent_topics` | `mcp__ralphchives-read__list_recent_topics` | `ralphchives-read-list_recent_topics` |
