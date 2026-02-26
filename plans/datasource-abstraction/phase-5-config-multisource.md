# Phase 5: Config, Startup & Multi-Source Wiring

> **Effort:** Medium-High (3-4 days)
> **Depends on:** Phase 3, Phase 4
> **Prerequisite for:** Phase 6

## Goal

Replace JIRA-specific config schema with a `dataSources` map that supports multiple named data sources. Wire the multi-source poller and connector resolution into the DI container and orchestrator startup.

## Tasks

### 5.1 Config Types

**File:** `src/config/types.ts`

**Remove:**
```ts
interface IJiraConfig {
  cloudId: string;
  pollIntervalMs: number;
  maxResults: number;
}
```

**Add:**
```ts
enum DataSourceType {
  Jira = "jira",
  // Future: GitHub = "github", ADO = "ado"
}

interface IDataSourceConfig {
  type: DataSourceType;
  /** Per-type connection properties (validated by connector) */
  connection: Record<string, unknown>;
  pollIntervalMs: number;
  maxResults: number;
}

// IAppConfig changes:
interface IAppConfig {
  dataSources: Record<string, IDataSourceConfig>;
  // ... rest unchanged
}
```

**Update `IAgentProfile`:**
```ts
interface IAgentProfile {
  dataSource: string;   // Key into dataSources map
  // ... rest unchanged
}
```

**Update `ISecretsConfig`:**
- Remove `jiraEmail` and `jiraApiToken` — JIRA credentials move into the data source `connection` block or remain as env vars read by the JIRA connector directly.

### 5.2 Config Schema (Zod)

**File:** `src/config/schemas.ts`

**Remove:** `rawJiraSchema`

**Add:**
```ts
const dataSourceConfigSchema = z.object({
  type: z.nativeEnum(DataSourceType),
  connection: z.record(z.unknown()),
  pollIntervalMs: z.number().int().positive(),
  maxResults: z.number().int().positive(),
});

// In configFileSchema:
dataSources: z.record(z.string(), dataSourceConfigSchema),
```

**Update `profileFileSchema`:**
```ts
dataSource: z.string(),   // Key into dataSources map
```

### 5.3 Config Loader

**File:** `src/config/loader.ts`

- Parse `dataSources` map from `config.json`
- For JIRA sources: read `JIRA_EMAIL` + `JIRA_PAT` env vars, inject into connection block
- Remove `buildJqlFromProfiles()` call — query building moves to `JiraWorkItemPoller`
- Each data source config validated per-type (JIRA requires `cloudId`, etc.)

### 5.4 Config File Update

**File:** `config.json`

**Before:**
```json
{
  "jira": {
    "cloudId": "...",
    "pollIntervalMs": 60000,
    "maxResults": 50
  }
}
```

**After:**
```json
{
  "dataSources": {
    "df-jira": {
      "type": "jira",
      "connection": {
        "cloudId": "..."
      },
      "pollIntervalMs": 60000,
      "maxResults": 50
    }
  }
}
```

### 5.5 DI Container

**File:** `src/awilix-cradle.ts`

**Before:** Single `jiraClient`, single `jiraPoller` registration.

**After:**
```ts
// Build connectors map from dataSources config
const connectors = new Map<string, IDataSourceConnector>();
for (const [name, dsConfig] of Object.entries(dataSources)) {
  connectors.set(name, createConnector(dsConfig));
}

// Build pollers
const pollers = new Map<string, IWorkItemPoller>();
for (const [name, dsConfig] of Object.entries(dataSources)) {
  pollers.set(name, createPoller(dsConfig, connectors.get(name)!));
}

// Register as named values
container.register({
  connectors: asValue(connectors),
  pollers: asValue(pollers),
});
```

Services that need a connector receive the `connectors` map and look up their profile's `dataSource` key at call time.

### 5.6 Multi-Poller Orchestrator

**File:** `src/orchestrator.ts`

**Before:** Single `jiraPoller.poll()` → single batch of issues.

**After:**
```ts
// Poll all data sources, merge results
const allItems: WorkItem[] = [];
for (const [name, poller] of this.pollers) {
  const items = await poller.poll();
  allItems.push(...items);
}
// Deduplicate by item.id (in case multiple sources return overlapping items)
// Feed merged list into trigger scanner
```

The `workSignal` still fires once → one poll cycle across all sources → scan all items → plan operations → execute one.

### 5.7 Profile ↔ Connector Resolution

When the task runner picks up an operation:
1. Look up profile's `dataSource` key
2. Get the connector from `connectors.get(profile.dataSource)`
3. Pass to task runner pipeline (issue manager, resource manager, etc.)

This lookup happens at operation execution time, not at DI registration time. Each service method that needs the connector receives it contextually via `TaskContext` or direct injection.

### 5.8 Startup Validation

**File:** `src/validate/`

- Validate every profile's `dataSource` key exists in `dataSources` map
- Validate each data source config's `connection` block matches its `type` requirements
- JIRA: `connection.cloudId` required, env vars `JIRA_EMAIL` + `JIRA_PAT` present
- Future sources: their own validation

## Config Example (Multi-Source)

```json
{
  "dataSources": {
    "kentico-jira": {
      "type": "jira",
      "connection": { "cloudId": "abc123" },
      "pollIntervalMs": 60000,
      "maxResults": 50
    },
    "docs-github": {
      "type": "github",
      "connection": { "owner": "kontent-ai", "repo": "docs" },
      "pollIntervalMs": 120000,
      "maxResults": 25
    }
  }
}
```

```json
// profiles/ralph-docs/profile.json
{
  "dataSource": "kentico-jira",
  // ...
}

// profiles/ralph-github/profile.json
{
  "dataSource": "docs-github",
  // ...
}
```

## Validation

- `npm run lint` passes
- `npm test` passes
- `config.json` validates against new schema
- All profiles reference valid `dataSource` keys
- Multi-poller polls each source and merges results
- Single profile's task uses the correct connector
