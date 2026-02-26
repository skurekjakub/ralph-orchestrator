# Phase 1: Define the Abstraction Layer

> **Effort:** Medium (2-3 days)
> **Depends on:** Phase 0
> **Prerequisite for:** Phase 2, Phase 3

## Goal

Define the generic types and interfaces that all data source connectors must implement. These are the contracts the orchestrator depends on — concrete JIRA/GitHub/etc. implementations come in Phase 2.

## Tasks

### 1.1 Define `WorkItem` and related types

**File:** `src/datasource/types.ts`

```typescript
export interface WorkItem {
  readonly id: string;
  readonly project: string;
  readonly summary: string;
  readonly description: string;         // Already Markdown
  readonly status: string;
  readonly type: string;
  readonly priority: string;
  readonly labels: readonly string[];
  readonly components: readonly string[];
  readonly created: string;             // ISO-8601
  readonly updated: string;             // ISO-8601 or empty
  readonly customFields: ReadonlyMap<string, string>;
  readonly _raw: unknown;               // Opaque source data
}

export interface WorkItemComment {
  readonly id: string;
  readonly authorName: string;
  readonly authorId: string;
  readonly body: string;                // Plain text
  readonly created: string;             // ISO-8601
}

export interface WorkItemAttachment {
  readonly id: string;
  readonly filename: string;
  readonly created: string;
}

export interface WorkItemTransition {
  readonly id: string;
  readonly name: string;
  readonly targetStatus: string;
}
```

### 1.2 Define `IDataSourceConnector`

**File:** `src/datasource/connector.ts`

```typescript
export interface IDataSourceConnector {
  readonly name: string;
  readonly sourceKey: string;

  searchWorkItems(query: string): Promise<WorkItem[]>;
  refreshWorkItem(id: string): Promise<WorkItem | null>;

  getComments(workItemId: string): Promise<WorkItemComment[]>;
  addComment(workItemId: string, body: string): Promise<void>;

  transitionWorkItem(workItemId: string, targetStatus: string): Promise<void>;

  getAttachments(workItemId: string): Promise<WorkItemAttachment[]>;
  downloadAttachment(workItemId: string, attachmentId: string): Promise<string>;
  addAttachment(workItemId: string, filename: string, content: string): Promise<void>;

  buildQueries(profiles: readonly IAgentProfile[]): string[];
  isValidItemId(id: string): boolean;
}
```

### 1.3 Define `IWorkItemPoller`

**File:** `src/datasource/poller.ts`

```typescript
export interface IWorkItemPoller {
  readonly sourceKey: string;
  start(): void;
  stop(): void;
  onItems(callback: () => void): void;
  drain(): WorkItem[];
}
```

### 1.4 Update test helpers

**File:** `tests/helpers/factories.ts`

Add `makeWorkItem()` and `makeWorkItemComment()` factory functions that produce the new generic types. Keep existing `makeIssue()` etc. — they'll be used in Phase 2 connector tests.

## Validation

- `npm run lint` passes (new files compile)
- No existing code depends on new types yet — this is purely additive
