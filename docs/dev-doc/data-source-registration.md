# Data Source Registration

Ralph Orchestrator uses a plugin-based architecture for data source connectors. Each data source type (JIRA, GitHub Issues, ADO Work Items, etc.) is an independent module that self-registers with the orchestrator at startup. This design allows third-party integrations without modifying orchestrator internals.

## How It Works

```
config.json plugins → dynamic import() → factory self-registers → createCradle() builds connectors
```

1. **Plugin discovery** — At startup, `AppStartup` loads built-in plugins first (JIRA), then any modules listed in `config.json` `plugins`.
2. **Self-registration** — Each plugin module calls `registerDataSourceFactory(type, factory)` as a side effect on import.
3. **Connector creation** — When the DI container is built, `buildDataSourceMaps()` iterates `config.dataSources`, looks up the registered factory for each entry's `type`, and calls it to create a connector + poller pair.

## Adding a New Data Source

### 1. Implement the Connector

Create a class that implements `IDataSourceConnector` (from `src/datasource/connector.ts`). This is the composition of two mandatory interfaces:

- **`IWorkItemSource`** — Work item discovery: `buildQueries()`, `searchWorkItems()`, `refreshWorkItem()`, `isValidItemId()`
- **`IWorkItemComments`** — Comment operations: `getComments()`, `addComment()`

Optionally implement additional capability interfaces:

- **`ISupportsTransitions`** — Workflow transitions: `getTransitions()`, `transitionWorkItem()`
- **`ISupportsAttachments`** — File attachments: `getAttachments()`, `downloadAttachment()`, `addAttachment()`

The orchestrator checks capabilities at runtime via type guards (`supportsTransitions()`, `supportsAttachments()`).

```ts
import type { IDataSourceConnector, ISupportsTransitions } from "ralph-orchestrator/datasource/connector";
import type { WorkItem, WorkItemComment } from "ralph-orchestrator/datasource/types";

export class MyConnector implements IDataSourceConnector, ISupportsTransitions {
  readonly name = "My Source";
  readonly sourceKey: string;

  constructor(
    sourceKey: string,
    private config: MyConnectionConfig,
  ) {
    this.sourceKey = sourceKey;
  }

  // IWorkItemSource
  buildQueries(profiles) {
    /* ... */
  }
  async searchWorkItems(query, pageSize?) {
    /* ... */
  }
  async refreshWorkItem(id) {
    /* ... */
  }
  isValidItemId(id) {
    /* ... */
  }
  getAllowedUsers() {
    return [];
  }

  // IWorkItemComments
  async getComments(workItemId) {
    /* ... */
  }
  async addComment(workItemId, bodyText) {
    /* ... */
  }

  // ISupportsTransitions (optional)
  async getTransitions(workItemId) {
    /* ... */
  }
  async transitionWorkItem(workItemId, targetStatus) {
    /* ... */
  }
}
```

### 2. Implement a Poller

Create a class that implements `IWorkItemPoller` (from `src/datasource/poller.ts`):

```ts
import type { IWorkItemPoller } from "ralph-orchestrator/datasource/poller";

export class MyPoller implements IWorkItemPoller {
  readonly sourceKey: string;

  constructor(
    private connector: MyConnector,
    private intervalMs: number,
  ) {
    this.sourceKey = connector.sourceKey;
  }

  start() {
    /* Start polling interval */
  }
  stop() {
    /* Clear interval */
  }
  onItems(callback: () => void) {
    /* Register new-items callback */
  }
  drain() {
    /* Return and clear buffered items */
  }
}
```

### 3. Create a Factory Module

The factory module creates connector + poller from config and self-registers:

```ts
import { registerDataSourceFactory } from "ralph-orchestrator/datasource/registry";
import type { DataSourceFactory } from "ralph-orchestrator/datasource/registry";
import type { IDataSourceConfig, IAgentProfile } from "ralph-orchestrator/config/types";
import { MyConnector } from "./my-connector";
import { MyPoller } from "./my-poller";

function createMyDataSource(
  sourceKey: string,
  dsConfig: IDataSourceConfig,
  profiles: readonly IAgentProfile[],
  logger?: { info: (msg: string) => void },
) {
  const conn = dsConfig.connection as MyConnectionConfig;
  const connector = new MyConnector(sourceKey, conn);
  const poller = new MyPoller(connector, dsConfig.pollIntervalMs);
  logger?.info(`Data source "${sourceKey}" (My Source): poll ${dsConfig.pollIntervalMs / 1000}s`);
  return { connector, poller };
}

// Self-register at import time
registerDataSourceFactory("my-source", createMyDataSource);
```

The type string (`"my-source"`) must match the `type` field in `config.json` data source entries.

### 4. Configure

Add the plugin to `config.json`:

```json
{
  "plugins": ["my-datasource-package/factory.js"],
  "dataSources": {
    "my-instance": {
      "type": "my-source",
      "connection": {
        "baseUrl": "https://api.example.com"
      },
      "pollIntervalMs": 60000
    }
  }
}
```

Then reference the data source key in a profile:

```json
{
  "dataSource": "my-instance",
  "repo": "~/repositories/my-repo",
  "cli": "copilot",
  "variants": [{ "..." }]
}
```

## Plugin Loading Order

1. **Built-in plugins** — `BUILTIN_PLUGINS` array in `app-startup.ts` (currently just JIRA)
2. **User plugins** — `config.plugins` array, in declaration order

All plugins are loaded via dynamic `import()` before the DI container is created. Each plugin must self-register synchronously during module evaluation (top-level `registerDataSourceFactory()` call).

Duplicate type registrations throw immediately — two plugins cannot claim the same type string.

## Built-in JIRA Connector

The JIRA connector follows the exact same registration pattern as third-party plugins. Its factory lives at `src/datasource/connectors/jira/factory.ts` and is loaded as a built-in plugin (not via a static import).

## Key Interfaces

| Interface              | File                          | Purpose                               |
| ---------------------- | ----------------------------- | ------------------------------------- |
| `IDataSourceConnector` | `src/datasource/connector.ts` | Base connector (discovery + comments) |
| `ISupportsTransitions` | `src/datasource/connector.ts` | Optional workflow transitions         |
| `ISupportsAttachments` | `src/datasource/connector.ts` | Optional file attachments             |
| `IWorkItemPoller`      | `src/datasource/poller.ts`    | Interval-based polling                |
| `WorkItem`             | `src/datasource/types.ts`     | Normalized work item DTO              |
| `WorkItemComment`      | `src/datasource/types.ts`     | Normalized comment DTO                |
| `DataSourceFactory`    | `src/datasource/registry.ts`  | Factory function signature            |
| `IDataSourceConfig`    | `src/config/types.ts`         | Per-source config shape               |

## Config Schema

The `dataSources` block in `config.json` is a keyed map. Each entry has:

| Field            | Type     | Description                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------------- |
| `type`           | `string` | Registered factory type (e.g. `"jira"`)                                                |
| `connection`     | `object` | Type-specific connection properties (validated by the connector, not the orchestrator) |
| `pollIntervalMs` | `number` | Polling interval in milliseconds                                                       |

The `type` field is a plain string — not a closed enum. Any value is accepted as long as a matching factory is registered before startup.

## Credential Injection

Data source credentials should come from environment variables, not `config.json`. The loader passes `connection` through untouched; each factory resolves its own credentials. The JIRA factory (`resolveJiraCredentials` in `src/datasource/connectors/jira/factory.ts`) reads `JIRA_PAT_<KEY>` and `JIRA_EMAIL_<KEY>`, where `<KEY>` is the data source key uppercased with dashes replaced by underscores, and throws if either is missing. It merges them into the connection as `apiToken` and `email` when the connector is created at startup. Third-party connectors should follow the same pattern by reading from `process.env` in their factory function.
