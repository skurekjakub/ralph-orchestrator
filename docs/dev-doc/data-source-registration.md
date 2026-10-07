# Data Source Registration

Data source connectors are built into the orchestrator. Each data source type (JIRA today; GitHub Issues, ADO Work Items, etc.) is a module under `src/datasource/connectors/<name>/` whose factory registers itself with the data source registry when it is imported. The orchestrator core never imports connector-specific code: it reaches connectors only through the registry and the `IDataSourceConnector` / `IWorkItemPoller` interfaces.

## How It Works

```
DATA_SOURCE_CONNECTORS → literal import() → factory self-registers → createCradle() builds connectors
```

1. **Connector loading** — After `loadConfig()`, `AppStartup` imports each module listed in `DATA_SOURCE_CONNECTORS` (`src/app-startup.ts`), in order. Each entry names its module in a literal `import()`, so esbuild includes it in the `dist/index.js` bundle.
2. **Self-registration** — Each factory module calls `registerDataSourceFactory(type, factory)` at top level, as a side effect of its import.
3. **Connector creation** — When the DI container is built, `buildDataSourceMaps()` (`src/datasource/registry.ts`) iterates `config.dataSources`, looks up the registered factory for each entry's `type`, and calls it to create a connector + poller pair.

## Adding a New Data Source

Create `src/datasource/connectors/<name>/` beside `jira/`. The samples below build a `my-source` connector in `src/datasource/connectors/my-source/`.

### 1. Implement the Connector

Create a class that implements `IDataSourceConnector` (from `src/datasource/connector.ts`). This is the composition of two mandatory interfaces, both extending `IDataSourceIdentity` (`name`, `sourceKey`, `getAllowedUsers()`):

- **`IWorkItemSource`** — Work item discovery: `buildQueries()`, `searchWorkItems()`, `refreshWorkItem()`, `isValidItemId()`
- **`IWorkItemComments`** — Comment operations: `getComments()`, `addComment()`

Optionally implement additional capability interfaces:

- **`ISupportsTransitions`** — Workflow transitions: `getTransitions()`, `transitionWorkItem()`
- **`ISupportsAttachments`** — File attachments: `getAttachments()`, `downloadAttachment()`, `addAttachment()`

The orchestrator checks capabilities at runtime via type guards (`supportsTransitions()`, `supportsAttachments()`).

```ts
// src/datasource/connectors/my-source/my-connector.ts
import type { IDataSourceConnector, ISupportsTransitions } from "../../connector";
import type { WorkItem, WorkItemComment } from "../../types";

export class MyConnector implements IDataSourceConnector, ISupportsTransitions {
  readonly name = "My Source";
  readonly sourceKey: string;

  constructor(
    sourceKey: string,
    private config: MyConnectionConfig,
  ) {
    this.sourceKey = sourceKey;
  }

  // IDataSourceIdentity
  getAllowedUsers() {
    return [];
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

Put external API calls behind a client interface (as `IJiraClient` does for `JiraConnector`) so tests can mock it and calls can go through `withRetry` (`src/retry.ts`).

### 2. Implement a Poller

Create a class that implements `IWorkItemPoller` (from `src/datasource/poller.ts`):

```ts
// src/datasource/connectors/my-source/my-poller.ts
import type { IWorkItemPoller } from "../../poller";
import type { MyConnector } from "./my-connector";

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

The factory module validates the connection config, creates the connector + poller, and registers itself. Define the connection schema in `src/config/schemas.ts` beside `jiraConnectionSchema`, so the connection is validated the same way the rest of `config.json` is.

```ts
// src/datasource/connectors/my-source/factory.ts
import type { IAgentProfile, IDataSourceConfig } from "../../../config/types";
import { myConnectionSchema } from "../../../config/schemas";
import type { IDataSourceConnector } from "../../connector";
import type { IWorkItemPoller } from "../../poller";
import { registerDataSourceFactory } from "../../registry";
import { MyConnector } from "./my-connector";
import { MyPoller } from "./my-poller";

function createMyDataSource(
  sourceKey: string,
  dsConfig: IDataSourceConfig,
  _profiles: readonly IAgentProfile[],
  logger?: { info: (msg: string) => void },
): { connector: IDataSourceConnector; poller: IWorkItemPoller } {
  const conn = myConnectionSchema.parse(dsConfig.connection);
  const connector = new MyConnector(sourceKey, conn);
  const poller = new MyPoller(connector, dsConfig.pollIntervalMs);
  logger?.info(`Data source "${sourceKey}" (My Source): poll ${dsConfig.pollIntervalMs / 1000}s`);
  return { connector, poller };
}

registerDataSourceFactory("my-source", createMyDataSource);
```

The type string (`"my-source"`) must match the `type` field in `config.json` data source entries.

### 4. Load the Module at Startup

Add the factory module to `DATA_SOURCE_CONNECTORS` in `src/app-startup.ts`:

```ts
const DATA_SOURCE_CONNECTORS: readonly DataSourceConnectorModule[] = [
  { name: "jira", load: () => import("./datasource/connectors/jira/factory") },
  { name: "my-source", load: () => import("./datasource/connectors/my-source/factory") },
];
```

Keep the specifier a string literal. The orchestrator runs from the single esbuild bundle `dist/index.js`, and esbuild only bundles modules it can resolve at build time.

### 5. Configure

Add a data source entry to `config.json`:

```json
{
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
  "repoUrl": "https://github.com/my-org/my-repo",
  "vcsProvider": "github",
  "variants": [{ "..." }]
}
```

### 6. Test

Put the connector's tests in `tests/datasource/connectors/<name>/`, mirroring `tests/datasource/connectors/jira/`. Run the connector through `runConnectorComplianceTests` in `tests/datasource/connector-compliance.test.ts`, which checks the `IDataSourceConnector` contract and the capability guards.

## Loading Order

Connector modules load in `DATA_SOURCE_CONNECTORS` order, all before the DI container is created. Each must register synchronously during module evaluation (a top-level `registerDataSourceFactory()` call).

A module whose import throws stops startup with `Failed to load data-source connector "<name>"`. Duplicate type registrations throw immediately — two connectors cannot claim the same type string.

## Built-in JIRA Connector

The JIRA connector in `src/datasource/connectors/jira/` is the reference implementation. Its factory (`factory.ts`) parses the connection with `jiraConnectionSchema`, injects credentials from `.env`, builds `JiraClient`, `JiraConnector` and `JiraWorkItemPoller`, and registers the `"jira"` type.

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
| `pollIntervalMs` | `number` | Polling interval in milliseconds (default `60000`)                                     |

The `type` field is a plain string — not a closed enum. Any value is accepted as long as a matching factory is registered before startup.

## Credential Injection

Data source credentials come from environment variables, not `config.json`. The loader passes `connection` through untouched; each factory resolves its own credentials. The JIRA factory (`resolveJiraCredentials` in `src/datasource/connectors/jira/factory.ts`) reads `JIRA_PAT_<KEY>` and `JIRA_EMAIL_<KEY>`, where `<KEY>` is the data source key uppercased with dashes replaced by underscores, and throws if either is missing. It merges them into the connection as `apiToken` and `email` when the connector is created at startup. Other connectors follow the same pattern, reading `process.env` in their factory function.
