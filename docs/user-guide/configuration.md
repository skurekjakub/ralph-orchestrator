# Configuration — config.json

Global orchestrator settings. Located at `config.json` in the project root.

## Data Sources

```json
{
  "dataSources": {
    "kentico-jira": {
      "type": "jira",
      "connection": {
        "baseUrl": "https://api.atlassian.com/ex/jira",
        "cloudId": "your-cloud-id",
        "excludeFields": [],
        "allowedUsers": []
      },
      "pollIntervalMs": 60000,
      "maxResults": 100
    }
  }
}
```

Each key (e.g. `kentico-jira`) is referenced by profiles via `dataSource`. Credentials are injected from `.env` — see [Environment Variables](environment-variables.md).

### Data Source Fields

| Field            | Type     | Default | Description                                                                           |
| ---------------- | -------- | ------- | ------------------------------------------------------------------------------------- |
| `type`           | `string` | —       | Registered data source type. Built-in: `"jira"`                                       |
| `connection`     | `object` | —       | Type-specific connection config (see below)                                           |
| `pollIntervalMs` | `number` | `60000` | Poll interval in milliseconds                                                         |
| `maxResults`     | `number` | `100`   | Accepted but unused: the JIRA connector fetches every matching issue, 100 per request |

Data source connectors are built into the orchestrator. Adding a new type is a code change: see [Data Source Registration](../dev-doc/data-source-registration.md).

### JIRA Connection Fields

| Field           | Type       | Required | Description                                                                   |
| --------------- | ---------- | -------- | ----------------------------------------------------------------------------- |
| `baseUrl`       | `string`   | Yes      | JIRA REST API base URL                                                        |
| `cloudId`       | `string`   | Yes      | Atlassian Cloud ID (find at `https://<site>.atlassian.net/_edge/tenant_info`) |
| `excludeFields` | `string[]` | No       | Custom field IDs to exclude from agent prompts                                |
| `allowedUsers`  | `string[]` | No       | Atlassian account IDs allowed to trigger invocations. Empty = unrestricted    |

## Output

```json
{
  "output": {
    "logDir": "./output/logs",
    "handoffDir": "./output/handoffs"
  }
}
```

| Field        | Type     | Default               | Description                                                                                        |
| ------------ | -------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `logDir`     | `string` | `"./output/logs"`     | Per-task log directories, the activity logs and the operation ledger (`history/`)                  |
| `handoffDir` | `string` | `"./output/handoffs"` | Created at startup, but nothing is written to it: the agent attaches its handoff to the JIRA issue |

The repository clones are not configured here: the orchestrator keeps its clone of each profile's `repoUrl` in `cache/repos/<profileId>` and each task's workspace in `cache/workspaces/<key>-<startTs>`, both under the orchestrator checkout. See [Task Workspaces](profiles.md#task-workspaces).

## Dashboard

```json
{
  "dashboard": {
    "enabled": true,
    "intervalMs": 30000
  }
}
```

| Field        | Type      | Default | Description                                                                                |
| ------------ | --------- | ------- | ------------------------------------------------------------------------------------------ |
| `enabled`    | `boolean` | `true`  | Enable dashboard heartbeat. Also requires `DASHBOARD_URL` and `DASHBOARD_SECRET` in `.env` |
| `intervalMs` | `number`  | `30000` | Heartbeat interval in milliseconds                                                         |

## Prompt Audit

```json
{
  "promptAudit": {
    "mode": "warn"
  }
}
```

| Field  | Type                                     | Default  | Description                                                                                         |
| ------ | ---------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `mode` | `"block"` &#124; `"warn"` &#124; `"off"` | `"warn"` | `"block"` rejects critical prompt injection findings, `"warn"` logs only, `"off"` disables auditing |

## Ralphchives

```json
{
  "ralphchives": {
    "enabled": false,
    "nodebbApiUrl": "http://localhost:4567",
    "neo4jUri": "bolt://localhost:7687",
    "neo4jUser": "neo4j"
  }
}
```

| Field          | Type      | Default                   | Description                       |
| -------------- | --------- | ------------------------- | --------------------------------- |
| `enabled`      | `boolean` | `false`                   | Enable Ralphchives knowledge base |
| `nodebbApiUrl` | `string`  | `"http://localhost:4567"` | NodeBB API endpoint               |
| `neo4jUri`     | `string`  | `"bolt://localhost:7687"` | Neo4j Bolt URI                    |
| `neo4jUser`    | `string`  | `"neo4j"`                 | Neo4j username                    |

## Global Options

| Field                | Type                           | Default         | Description                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enableContinuation` | `boolean`                      | `false`         | Global toggle for continuation retries. When `true`, a stage of a profile with `maxContinuations > 0` that requires a result block (`requireResultBlock`, the default for variant stages) and ends without one is resumed. Copilot resumes with `--continue`, Claude Code with `--resume <session id>`. Both this flag and the profile's `maxContinuations` must be set for retries to occur |
| `claudeAuth`         | `"oauth-token"` \| `"api-key"` | `"oauth-token"` | Credential every Claude Code stage authenticates with: `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY`. Only that one variable is required, and only it is passed to Claude Code: into an agent container whose container stages run Claude Code, and into a host stage that runs it                                                                            |

An organisation can deliver server-managed settings with either credential. They outrank the settings file Ralph passes every Claude Code session with `--settings`, so they can switch Ralph's audit hooks off; a container session that ran without them is logged and listed in the task summary's `hooklessSessions`.
