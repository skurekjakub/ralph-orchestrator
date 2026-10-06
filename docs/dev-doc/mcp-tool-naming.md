# MCP Tool Naming Convention in Copilot CLI

## How Copilot CLI names MCP tools

When Copilot CLI loads MCP servers from `mcp-config.json`, it **prefixes each tool name with the server key and a dash**:

```
<server-key>-<tool_name>
```

For example, a server registered as `"jira-kentico"` exposing a tool named `jira_add_comment` becomes:

```
jira-kentico-jira_add_comment
```

This was confirmed from actual execution logs (`pre-tool.log`) which show the prefixed names in tool call events.

### Built-in tools

Copilot CLI's own built-in tools (`bash`, `edit`, `create`, `view`, `grep`, `glob`, `lsp`, `agent`, `skill`, `todo`, etc.) are **not prefixed** — they use their bare name.

### GitHub MCP tools

GitHub MCP tools (controlled by `githubMcpTools` / `--add-github-mcp-tool`) also use **bare names** without a server prefix (e.g., `get_file_contents`).

## Tool reference for `ralph-vscode` profile

The profile mounts 4 MCP servers plus one GitHub MCP tool. Below is the full mapping.

### `jira-kentico`

| Manifest tool name    | Copilot CLI tool ID                |
| --------------------- | ---------------------------------- |
| `jira_add_comment`    | `jira-kentico-jira_add_comment`    |
| `jira_add_attachment` | `jira-kentico-jira_add_attachment` |

### `ado`

| Manifest tool name               | Copilot CLI tool ID                  |
| -------------------------------- | ------------------------------------ |
| `ado_create_pull_request`        | `ado-ado_create_pull_request`        |
| `ado_list_pull_requests`         | `ado-ado_list_pull_requests`         |
| `ado_list_pull_request_threads`  | `ado-ado_list_pull_request_threads`  |
| `ado_create_pull_request_thread` | `ado-ado_create_pull_request_thread` |
| `ado_reply_to_comment`           | `ado-ado_reply_to_comment`           |
| `ado_push_progress`              | `ado-ado_push_progress`              |

### `ralphchives-write`

| Manifest tool name | Copilot CLI tool ID                  |
| ------------------ | ------------------------------------ |
| `post_task_report` | `ralphchives-write-post_task_report` |
| `post_observation` | `ralphchives-write-post_observation` |
| `reply_to_thread`  | `ralphchives-write-reply_to_thread`  |

### `ralphchives-read`

| Manifest tool name   | Copilot CLI tool ID                   |
| -------------------- | ------------------------------------- |
| `search_ralphchives` | `ralphchives-read-search_ralphchives` |
| `get_topic`          | `ralphchives-read-get_topic`          |
| `list_recent_topics` | `ralphchives-read-list_recent_topics` |

### GitHub MCP (built-in, no prefix)

| Tool name           |
| ------------------- |
| `get_file_contents` |

## Per-agent tool allocation

Each agent should only have access to the tools it actually needs. The `tools` array in agent YAML frontmatter controls this.

| Tool                                  | `ralph` (orchestrator) | `ralph-analyst` | `ralph-coder` | `ralph-reviewer` | `ralph-scribe`      |
| ------------------------------------- | ---------------------- | --------------- | ------------- | ---------------- | ------------------- |
| **Built-in: filesystem**              |                        |                 |               |                  |                     |
| `bash`                                | ✅ git commit          | ✅ explore      | ✅ build/test | ✅ build/test    | ✅ read artifacts   |
| `edit`                                | ✅ handoff             | —               | ✅ implement  | —                | —                   |
| `create`                              | ✅ handoff             | ✅ artifacts    | ✅ implement  | ✅ artifacts     | ✅ artifacts        |
| `view`                                | ✅ status.json         | ✅ research     | ✅ read code  | ✅ review code   | ✅ read artifacts   |
| `grep`                                | —                      | ✅ research     | ✅ search     | ✅ search        | ✅ search artifacts |
| `glob`                                | —                      | ✅ research     | ✅ search     | ✅ search        | ✅ find artifacts   |
| **Built-in: agent**                   |                        |                 |               |                  |                     |
| `agent`                               | ✅ dispatch            | —               | —             | —                | —                   |
| `skill`                               | ✅ workflow            | ✅ research     | ✅ implement  | —                | ✅ ralphchives      |
| `todo`                                | ✅ planning            | ✅ planning     | ✅ planning   | ✅ planning      | ✅ planning         |
| `report_intent`                       | ✅                     | ✅              | ✅            | ✅               | ✅                  |
| **GitHub MCP**                        |                        |                 |               |                  |                     |
| `get_file_contents`                   | —                      | ✅ research     | —             | —                | —                   |
| **JIRA**                              |                        |                 |               |                  |                     |
| `jira-kentico-jira_add_comment`       | ✅ greeting/status     | —               | —             | —                | —                   |
| `jira-kentico-jira_add_attachment`    | ✅ handoff attach      | —               | —             | —                | —                   |
| **ADO**                               |                        |                 |               |                  |                     |
| `ado-ado_push_progress`               | ✅ push                | —               | —             | —                | —                   |
| `ado-ado_create_pull_request`         | ✅ PR                  | —               | —             | —                | —                   |
| `ado-ado_list_pull_requests`          | ✅ PR check            | —               | —             | —                | —                   |
| `ado-ado_list_pull_request_threads`   | —                      | ✅ revision     | —             | —                | —                   |
| `ado-ado_create_pull_request_thread`  | —                      | —               | —             | —                | —                   |
| `ado-ado_reply_to_comment`            | —                      | —               | —             | —                | —                   |
| **Ralphchives write**                 |                        |                 |               |                  |                     |
| `ralphchives-write-post_task_report`  | —                      | —               | —             | —                | ✅ task report      |
| `ralphchives-write-post_observation`  | —                      | —               | —             | —                | ✅ observations     |
| `ralphchives-write-reply_to_thread`   | —                      | —               | —             | —                | ✅ general obs      |
| **Ralphchives read**                  |                        |                 |               |                  |                     |
| `ralphchives-read-search_ralphchives` | —                      | ✅ prior work   | —             | —                | ✅ find threads     |
| `ralphchives-read-get_topic`          | —                      | ✅ prior work   | —             | —                | ✅ read threads     |
| `ralphchives-read-list_recent_topics` | —                      | —               | —             | —                | ✅ recent context   |
