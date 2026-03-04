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

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `string` | — | Registered data source type. Built-in: `"jira"` |
| `connection` | `object` | — | Type-specific connection config (see below) |
| `pollIntervalMs` | `number` | `60000` | Poll interval in milliseconds |
| `maxResults` | `number` | `100` | Maximum results per poll cycle |

### JIRA Connection Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `baseUrl` | `string` | Yes | JIRA REST API base URL |
| `cloudId` | `string` | Yes | Atlassian Cloud ID (find at `https://<site>.atlassian.net/_edge/tenant_info`) |
| `excludeFields` | `string[]` | No | Custom field IDs to exclude from agent prompts |
| `allowedUsers` | `string[]` | No | Atlassian account IDs allowed to trigger invocations. Empty = unrestricted |

## Plugins

```json
{
  "plugins": ["./my-datasource/factory.js"]
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `plugins` | `string[]` | `[]` | Module specifiers loaded at startup. Each must call `registerDataSourceFactory()` on import |

Built-in plugins (JIRA) are loaded automatically.

## Output

```json
{
  "output": {
    "logDir": "./output/logs",
    "handoffDir": "./output/handoffs"
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `logDir` | `string` | `"./output/logs"` | Per-task log directory |
| `handoffDir` | `string` | `"./output/handoffs"` | Handoff artifact directory |

## Dashboard

```json
{
  "dashboard": {
    "enabled": true,
    "intervalMs": 30000
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enable dashboard heartbeat. Also requires `DASHBOARD_URL` and `DASHBOARD_SECRET` in `.env` |
| `intervalMs` | `number` | `30000` | Heartbeat interval in milliseconds |

## Prompt Audit

```json
{
  "promptAudit": {
    "mode": "warn"
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
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

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable Ralphchives knowledge base |
| `nodebbApiUrl` | `string` | `"http://localhost:4567"` | NodeBB API endpoint |
| `neo4jUri` | `string` | `"bolt://localhost:7687"` | Neo4j Bolt URI |
| `neo4jUser` | `string` | `"neo4j"` | Neo4j username |

## Global Options

| Field | Type | Default | Description |
|---|---|---|---|
| `enableContinuation` | `boolean` | `false` | Global toggle for continuation retries. When `true`, profiles with `maxContinuations > 0` will auto-retry via `--continue` when the agent doesn't produce a result block. Both this flag and the profile's `maxContinuations` must be set for retries to occur |
