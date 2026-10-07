# Data Source Registration

Data source connectors are built into the orchestrator. Each data source type (JIRA today; GitHub Issues, ADO Work Items, etc.) is a module under `src/datasource/connectors/<name>/` whose factory registers itself with the data source registry when it is imported. The orchestrator core never imports connector-specific code: it reaches connectors only through the registry and the `IDataSourceConnector` / `IWorkItemPoller` interfaces.

## How It Works

```
DATA_SOURCE_CONNECTORS → literal import() → factory self-registers → createCradle() builds connectors
```

1. **Connector loading** — After `loadConfig()`, `AppStartup` imports each module listed in `DATA_SOURCE_CONNECTORS` (`src/app-startup.ts`), in order. Each entry names its module in a literal `import()`, so esbuild includes it in the `dist/index.js` bundle.
2. **Self-registration** — Each factory module calls `registerDataSourceFactory(type, factory)` at top level, as a side effect of its import.
3. **Connector creation** — `createCradle()` registers the root services, then calls `buildDataSourceMaps()` (`src/datasource/registry.ts`). It iterates `config.dataSources`, opens one awilix scope per entry holding the entry's `sourceKey` and `dataSourceConfig`, and calls the factory registered for the entry's `type` with that scope to build a connector + poller pair. This runs outside any resolution of the root container, because awilix refuses a scope's scoped registrations while a root singleton resolves.

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
  private readonly connection: MyConnectionConfig;

  constructor({ sourceKey, myConnection }: { sourceKey: string; myConnection: MyConnectionConfig }) {
    this.sourceKey = sourceKey;
    this.connection = myConnection;
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

The constructor takes one deps object whose keys are tokens of the data source's scope (see step 3). Put external API calls behind a client interface (as `IJiraClient` does for `JiraConnector`) so tests can mock it and calls can go through `withRetry` (`src/retry.ts`).

### 2. Implement a Poller

Create a class that implements `IWorkItemPoller` (from `src/datasource/poller.ts`):

```ts
// src/datasource/connectors/my-source/my-poller.ts
import type { IWorkItemSource } from "../../connector";
import type { IWorkItemPoller } from "../../poller";

export class MyPoller implements IWorkItemPoller {
  readonly sourceKey: string;
  private readonly connector: IWorkItemSource;
  private readonly pollIntervalMs: number;

  constructor({ connector, pollIntervalMs }: { connector: IWorkItemSource; pollIntervalMs: number }) {
    this.sourceKey = connector.sourceKey;
    this.connector = connector;
    this.pollIntervalMs = pollIntervalMs;
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

The factory receives the data source's awilix scope, typed `AwilixContainer<DataSourceCradle>` (`src/awilix-cradle-types.ts`): the root cradle (`profiles`, `logger`, …) plus the entry's `sourceKey` and `dataSourceConfig`. It declares its own cradle type on top of that, registers the values and classes it needs in the scope, and resolves the connector and poller there.

- Register classes with `wiring<YourCradle>().service(...)` and derived values with `.factory(...)` (`src/di/registration.ts`). `tsc` then rejects a constructor whose deps the cradle doesn't provide, and a `Registrations<…>` object missing a token.
- Make every registration `.scoped()`. A `.singleton()` on a scope throws, and `asFunction` defaults to transient, which awilix's strict mode refuses as the dependency of a scoped service.
- A test-only constructor override (such as `JiraClient`'s `retryOptions`) stays an optional second positional parameter: the awilix proxy throws when a constructor reads a deps key the cradle lacks.

Define the connection schema in `src/config/schemas.ts` beside `jiraConnectionSchema`, so the connection is validated the same way the rest of `config.json` is.

```ts
// src/datasource/connectors/my-source/factory.ts
import type { AwilixContainer } from "awilix";
import type { DataSourceCradle } from "../../../awilix-cradle-types";
import { myConnectionSchema } from "../../../config/schemas";
import { wiring, type Registrations } from "../../../di/registration";
import type { IDataSourceConnector } from "../../connector";
import type { IWorkItemPoller } from "../../poller";
import { registerDataSourceFactory } from "../../registry";
import { MyConnector, type MyConnectionConfig } from "./my-connector";
import { MyPoller } from "./my-poller";

type MySourceCradle = DataSourceCradle & {
  myConnection: MyConnectionConfig;
  pollIntervalMs: number;
  connector: IDataSourceConnector;
  poller: IWorkItemPoller;
};

function createMyDataSource(scope: AwilixContainer<DataSourceCradle>): {
  connector: IDataSourceConnector;
  poller: IWorkItemPoller;
} {
  const w = wiring<MySourceCradle>();
  const registrations: Registrations<Omit<MySourceCradle, keyof DataSourceCradle>> = {
    myConnection: w.factory(({ dataSourceConfig }) => myConnectionSchema.parse(dataSourceConfig.connection)).scoped(),
    pollIntervalMs: w.factory(({ dataSourceConfig }) => dataSourceConfig.pollIntervalMs).scoped(),
    connector: w.service(MyConnector).scoped(),
    poller: w.service(MyPoller).scoped(),
  };
  const { connector, poller } = scope.register(registrations).cradle;
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

The JIRA connector in `src/datasource/connectors/jira/` is the reference implementation. Its factory (`factory.ts`) declares `JiraSourceCradle` and registers in the data source's scope:

- `jiraConnection`: the connection parsed with `jiraConnectionSchema`, plus the credentials from `.env`;
- `excludeFields` and `allowedUsers` from that connection, `pollIntervalMs` from the entry, and `queries` built from the profiles bound to the source;
- `JiraClient`, `JiraConnector` and `JiraWorkItemPoller`.

It resolves the connector and poller, and the module registers the `"jira"` type.

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
| `DataSourceCradle`     | `src/awilix-cradle-types.ts`  | Cradle of a data source's scope       |
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

Data source credentials come from environment variables, not `config.json`. The loader passes `connection` through untouched; each factory resolves its own credentials. The JIRA factory (`resolveJiraCredentials` in `src/datasource/connectors/jira/factory.ts`) reads `JIRA_PAT_<KEY>` and `JIRA_EMAIL_<KEY>`, where `<KEY>` is the data source key uppercased with dashes replaced by underscores, and throws if either is missing. Its `jiraConnection` registration merges them into the connection as `apiToken` and `email` when `createCradle()` builds the connector at startup. Other connectors follow the same pattern, reading `process.env` in their factory function.
