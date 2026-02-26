# Phase 6: Migrate Tests

> **Effort:** High (3-4 days)
> **Depends on:** Phase 3, Phase 4, Phase 5
> **Prerequisite for:** Phase 7

## Goal

Update all test files to use `WorkItem` types, add connector-specific tests, and add a compliance test suite that any future connector must pass.

## Tasks

### 6.1 Test Factories

**File:** `tests/helpers/factories.ts`

**Add:**
```ts
function createWorkItem(overrides?: Partial<WorkItem>): WorkItem {
  return {
    id: "DF-123",
    source: "kentico-jira",
    project: "DF",
    title: "Test issue",
    description: "Test description in plain text",
    status: "To Do",
    type: "Task",
    priority: "Medium",
    labels: [],
    components: [],
    created: "2024-01-01T00:00:00.000Z",
    updated: "2024-01-01T00:00:00.000Z",
    sourceData: {},
    ...overrides,
  };
}

function createWorkItemComment(overrides?: Partial<WorkItemComment>): WorkItemComment {
  return {
    id: "comment-1",
    body: "Test comment body",
    authorId: "user123",
    authorName: "Test User",
    created: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}
```

**Remove:** `createJiraIssue()` and `createJiraComment()` factories once all tests are migrated.

### 6.2 Service Test Migration

Update every test file that uses `JiraIssue` / `JiraComment`:

| Test File | Changes |
|-----------|---------|
| `tests/services/trigger-scanner.test.ts` | `createJiraIssue()` → `createWorkItem()`, `JiraComment` → `WorkItemComment` |
| `tests/services/profile-router.test.ts` | `createJiraIssue()` → `createWorkItem()`, field access patterns |
| `tests/services/operation-ledger.test.ts` | Issue key references stay as `string` (no type change) |
| `tests/services/task-runner.test.ts` | `Mocked<IJiraClient>` → `Mocked<IDataSourceConnector>`, task context update |
| `tests/services/task-result-writer.test.ts` | If using JiraIssue in test context |
| `tests/services/preflight.test.ts` | `JiraComment` → `WorkItemComment`, remove ADF extraction |
| `tests/prompt/prompt.test.ts` | `createJiraIssue()` → `createWorkItem()`, no ADF extraction |
| `tests/prompt/prompt-builder.test.ts` | Same |
| `tests/container/manager.test.ts` | Type swap |
| `tests/container/setup/agent-includes.test.ts` | Template context uses `task.*` variables |
| `tests/container/setup/jit-mcp-params.test.ts` | `$jira.*` → `$task.*` macros |
| `tests/jira/poller.test.ts` | Moves to connector test or removed |

### 6.3 Connector Tests

**New:** `tests/datasource/connectors/jira/`

| Test File | Purpose |
|-----------|---------|
| `jira-connector.test.ts` | Verify `JiraConnector` implements `IDataSourceConnector` correctly — delegates to `JiraClient`, maps responses |
| `jira-data-mapper.test.ts` | Verify `JiraIssue` → `WorkItem` mapping — all fields, edge cases, missing fields, custom fields, ADF → text |
| `jira-poller.test.ts` | Verify `JiraWorkItemPoller` polls, deduplicates, paginates |

### 6.4 Connector Compliance Test Suite

**New:** `tests/datasource/connector-compliance.test.ts`

A shared test suite that any `IDataSourceConnector` implementation must pass. Parameterized by connector instance.

```ts
function runConnectorComplianceTests(
  name: string,
  createConnector: () => IDataSourceConnector,
) {
  describe(`${name} connector compliance`, () => {
    it("getWorkItem returns a valid WorkItem", async () => { ... });
    it("getComments returns WorkItemComment[]", async () => { ... });
    it("addComment accepts string body", async () => { ... });
    it("transitionWorkItem with valid transition succeeds", async () => { ... });
    it("WorkItem.description is plain text (no ADF/HTML)", async () => { ... });
    // etc.
  });
}

// Run for each connector:
runConnectorComplianceTests("JIRA", () => new JiraConnector(...));
// Future: runConnectorComplianceTests("GitHub", () => new GitHubConnector(...));
```

### 6.5 Multi-Source Integration Test

**New:** `tests/datasource/multi-source.test.ts`

Verify that the orchestrator correctly:
- Polls multiple data sources
- Merges results
- Routes items to the correct profile via `dataSource` key
- Uses the correct connector for each profile's operations

## Validation

- `npm test` passes — all tests green
- No references to `JiraIssue` / `JiraComment` in test files (except connector-internal tests)
- Compliance suite runs for JIRA connector
- Factory functions produce valid `WorkItem` objects
