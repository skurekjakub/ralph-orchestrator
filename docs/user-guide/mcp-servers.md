# MCP Servers

MCP (Model Context Protocol) servers give agents access to external services through tool calls. Each profile declares exactly which servers it needs — enforcing least-privilege at tool, network, process, and credential levels.

## Declaring Servers in profile.json

Servers are declared in the `mcpServers` array. Entries can be simple strings or objects with per-server environment variables:

```json
{
  "mcpServers": [
    "playwright",
    "web-fetch",
    {
      "name": "ado",
      "env": {
        "ADO_PROJECT": "CustomerEducation",
        "ADO_REPO": "my-repo",
        "TASK_BRANCH": "$task.branch"
      }
    },
    {
      "name": "jira-kentico",
      "env": {
        "JIRA_ISSUE_KEY": "$task.id"
      }
    }
  ]
}
```

### Simple Entry

```json
"mcpServers": ["playwright"]
```

Deploys the server with no additional env vars. The server uses its defaults and any `requiredEnv` values from `.env`.

### Object Entry with env

```json
{
  "name": "ado",
  "env": {
    "ADO_PROJECT": "CustomerEducation",
    "TASK_BRANCH": "$task.branch"
  }
}
```

Values starting with `$` are runtime macros resolved per-task. See [Runtime Macros](runtime-macros.md).

## Architecture

```
Agent container (ralph-internal network, Squid-proxied)
     │
     │  HTTP (StreamableHTTP)
     ▼
MCP Sidecar (ralph-internal + ralph-sidecar-external)
     │
     │  stdio → supergateway → HTTP bridge
     ▼
MCP Server processes (direct internet access)
```

- **Agent** runs on `ralph-internal` (internal Docker network, proxied through Squid)
- **MCP sidecar** bridges both networks — receives tool calls from agent, runs server processes with direct internet
- Agent sees tools via `mcp-config.json` (URL-only). Credentials live in `gateway.json` inside the sidecar
- `supergateway` bridges each server's stdio to Streamable HTTP on a fixed port

## Server Manifests

Each server has a `mcp-server.json` manifest in `shared/mcp-servers/<name>/`.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Server identifier (must match directory name) |
| `description` | `string` | No | Human-readable description |
| `type` | `"npm"` &#124; `"custom"` | Yes | `"npm"` = pre-installed package, `"custom"` = locally built with source in `src/` |
| `command` | `string` | Yes | Executable to run |
| `args` | `string[]` | Yes | Command arguments |
| `containerPath` | `string` | No | Mount path inside sidecar (for `"custom"` type) |
| `sidecarPort` | `number` | Yes | Fixed port (1–65535), must be unique across servers |
| `requiredEnv` | `string[]` | No | Env vars that must be in `.env` for the server to work |
| `tools` | `string[]` | No | Tool names this server provides |
| `requiredConfig` | `string[]` | No | Env var names that profiles must provide via `mcpServers.env`. Validated at startup |

## Available Servers

| Name | Description | Type | Port | Tools |
|---|---|---|---|---|
| `ado` | Azure DevOps — PR creation & review threads | custom | 9101 | `ado_create_pull_request`, `ado_list_pull_requests`, `ado_list_pull_request_threads`, `ado_create_pull_request_thread`, `ado_reply_to_comment`, `ado_push_progress` |
| `jira-kentico` | JIRA Cloud — comments & attachments | custom | 9100 | `jira_add_comment`, `jira_add_attachment` |
| `discord-hitl` | Discord human-in-the-loop threads | custom | 9102 | `discord_ask` |
| `playwright` | Browser automation | npm | 9103 | `browser_navigate`, `browser_navigate_back`, `browser_take_screenshot`, `browser_network_requests`, `browser_click`, `browser_fill_form`, `browser_evaluate`, `browser_press_key` |
| `web-fetch` | Fetch URL content as text | custom | 9104 | `web_fetch` |
| `microsoft-docs` | Search Microsoft Learn | custom | 9105 | `microsoft_docs_search` |
| `ralphchives-write` | Post task reports & observations to knowledge base | custom | 9106 | `post_task_report`, `post_observation`, `reply_to_thread` |
| `ralphchives-read` | Search/retrieve knowledge from archive | custom | 9107 | `search_ralphchives`, `get_topic`, `list_recent_topics` |
| `codegraphcontext` | Code graph intelligence — structural queries, call chains, dead code, complexity | npm | 9108 | `find_code`, `analyze_code_relationships`, `find_dead_code`, `execute_cypher_query`, ... |

### Server Requirements

| Server | Required Config (profile must provide) | Required Env (must be in .env) |
|---|---|---|
| `ado` | `ADO_PROJECT`, `ADO_REPO` | `ADO_PAT` |
| `jira-kentico` | `JIRA_ISSUE_KEY` | `JIRA_PAT_KENTICO_JIRA`, `JIRA_EMAIL_KENTICO_JIRA` |
| `discord-hitl` | — | `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID` |
| `playwright` | — | — |
| `web-fetch` | — | — |
| `microsoft-docs` | — | — |
| `ralphchives-write` | `NODEBB_CATEGORY_NAME`, `NODEBB_API_TOKEN` | `NODEBB_API_URL` |
| `ralphchives-read` | `NODEBB_CATEGORY_NAME`, `NODEBB_API_TOKEN` | `NODEBB_API_URL` |
| `codegraphcontext` | — | — |

## Copilot Built-In GitHub MCP

Copilot CLI ships with a built-in GitHub MCP server. The `githubMcpTools` profile field controls it:

| Value | Effect |
|---|---|
| `false` (default) | Server disabled (`--disable-builtin-mcps` flag) |
| `["get_file_contents", "search_code"]` | Only listed tools enabled (`--add-github-mcp-tool` per tool) |

No effect on `cli: "claude"` profiles. Empty array is invalid.
