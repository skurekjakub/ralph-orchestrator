# Phase 2: Build the JIRA Connector

> **Effort:** Medium (3-4 days)
> **Depends on:** Phase 1
> **Prerequisite for:** Phase 3

## Goal

Wrap the existing `src/jira/` code in a connector that implements `IDataSourceConnector`. This phase adds new files only — no existing code is modified. The JIRA connector must produce `WorkItem` / `WorkItemComment` objects that are structurally identical to what the orchestrator currently gets from `JiraIssue` / `JiraComment`.

## Directory Structure

```
src/datasource/connectors/jira/
  jira-connector.ts         — IDataSourceConnector implementation
  jira-data-mapper.ts       — JiraIssue → WorkItem, JiraComment → WorkItemComment
  jira-content-extractor.ts — ADF converter + field extractor (wraps existing)
  jira-poller.ts            — IWorkItemPoller wrapping existing JiraPoller
```

## Tasks

### 2.1 Data Mapper

**File:** `src/datasource/connectors/jira/jira-data-mapper.ts`

Converts raw JIRA API types to generic `WorkItem`:

- `JiraIssue.key` → `WorkItem.id`
- `JiraIssue.key.split("-")[0]` → `WorkItem.project`
- `JiraIssue.fields.summary` → `WorkItem.summary`
- ADF description → Markdown via `extractAdfText()` → `WorkItem.description`
- `JiraIssue.fields.status.name` → `WorkItem.status`
- Known custom fields → `WorkItem.customFields` (via `JiraFieldExtractor`)
- `JiraIssue` stored as `WorkItem._raw` for connector-internal use

Similarly for `JiraComment` → `WorkItemComment`:
- `JiraComment.id` → `WorkItemComment.id`
- `JiraComment.author.displayName` → `WorkItemComment.authorName`
- `JiraComment.author.accountId` → `WorkItemComment.authorId`
- ADF body → plain text via `extractAdfText()` → `WorkItemComment.body`

### 2.2 Content Extractor

**File:** `src/datasource/connectors/jira/jira-content-extractor.ts`

Wraps:
- `src/jira/adf-converter.ts` — ADF → Markdown
- `src/jira/field-extractor.ts` — Custom field extraction with label mapping
- `src/jira/issue-parser.ts` — Boilerplate field removal

Called by the data mapper to populate `WorkItem.description` and `WorkItem.customFields`.

### 2.3 JIRA Connector

**File:** `src/datasource/connectors/jira/jira-connector.ts`

Implements `IDataSourceConnector`:

```typescript
class JiraConnector implements IDataSourceConnector {
  constructor(sourceKey: string, jiraClient: IJiraClient, mapper: JiraDataMapper) { ... }

  async searchWorkItems(jql: string): Promise<WorkItem[]> {
    const issues = await this.jiraClient.searchIssues(jql);
    return issues.map(i => this.mapper.toWorkItem(i));
  }

  async refreshWorkItem(id: string): Promise<WorkItem | null> {
    const results = await this.jiraClient.searchIssues(`key = ${id}`, 1);
    return results[0] ? this.mapper.toWorkItem(results[0]) : null;
  }

  async getComments(workItemId: string): Promise<WorkItemComment[]> {
    const comments = await this.jiraClient.getComments(workItemId);
    return comments.map(c => this.mapper.toWorkItemComment(c));
  }

  async transitionWorkItem(workItemId: string, targetStatus: string): Promise<void> {
    const transitionId = await this.jiraClient.findTransitionId(workItemId, targetStatus);
    if (!transitionId) throw new Error(`No transition to "${targetStatus}" for ${workItemId}`);
    await this.jiraClient.transitionIssue(workItemId, transitionId);
  }

  buildQueries(profiles: readonly IAgentProfile[]): string[] {
    return buildJqlFromProfiles(profiles);
  }

  isValidItemId(id: string): boolean {
    return /^[A-Z][A-Z0-9]*-\d+$/.test(id);
  }

  // ... attachments delegate to jiraClient
}
```

### 2.4 JIRA Poller

**File:** `src/datasource/connectors/jira/jira-poller.ts`

Wraps existing `JiraPoller` but maps drained results to `WorkItem[]`:

```typescript
class JiraWorkItemPoller implements IWorkItemPoller {
  readonly sourceKey: string;
  private readonly poller: JiraPoller;
  private readonly mapper: JiraDataMapper;

  drain(): WorkItem[] {
    return this.poller.drain().map(i => this.mapper.toWorkItem(i));
  }
  // start(), stop(), onItems() delegate directly
}
```

### 2.5 Tests

**New file:** `tests/datasource/connectors/jira/jira-data-mapper.test.ts`
- Verify `JiraIssue` → `WorkItem` mapping produces expected field values
- Verify ADF description → Markdown conversion
- Verify custom field extraction produces correct `customFields` map
- Verify `JiraComment` → `WorkItemComment` mapping

**New file:** `tests/datasource/connectors/jira/jira-connector.test.ts`
- Verify `searchWorkItems` delegates to `IJiraClient.searchIssues` and maps results
- Verify `transitionWorkItem` resolves transition ID and delegates
- Verify `buildQueries` produces valid JQL

## Validation

- All new tests pass
- All existing tests still pass (no existing code modified)
- The JIRA connector is a standalone addition — not wired into the production code path yet
