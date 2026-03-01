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

### 1.2 Define `IDataSourceConnector` (segregated interfaces)

**File:** `src/datasource/connector.ts`

```typescript
// Shared identity
interface IDataSourceIdentity {
  readonly name: string;
  readonly sourceKey: string;
}

// Discovery — consumed by poller, profile router
interface IWorkItemSource extends IDataSourceIdentity {
  buildQueries(profiles: readonly { match: { projects: string[]; statuses?: string[] } }[]): SourceQuery[];
  searchWorkItems(query: SourceQuery, pageSize?: number): Promise<WorkItem[]>;
  refreshWorkItem(workItemId: string): Promise<WorkItem>;
  isValidItemId(id: string): boolean;
}

// Comments — consumed by trigger scanner, issue manager, resource manager
interface IWorkItemComments extends IDataSourceIdentity {
  getComments(workItemId: string): Promise<WorkItemComment[]>;
  addComment(workItemId: string, bodyText: string): Promise<void>;
}

// Transitions — consumed by issue manager
interface IWorkItemTransitions extends IDataSourceIdentity {
  getTransitions(workItemId: string): Promise<WorkItemTransition[]>;
  transitionWorkItem(workItemId: string, targetStatus: string): Promise<void>;  // throws if not found (CQS)
}

// Attachments — consumed by resource manager
interface IWorkItemAttachments extends IDataSourceIdentity {
  getAttachments(workItemId: string): Promise<WorkItemAttachment[]>;
  downloadAttachment(workItemId: string, attachmentId: string): Promise<string>;
  addAttachment(workItemId: string, filename: string, content: string | Buffer): Promise<void>;
}

// Full connector — convenience intersection for implementations and DI
type IDataSourceConnector = IWorkItemSource & IWorkItemComments & IWorkItemTransitions & IWorkItemAttachments;
```

**Design notes:**
- **ISP (Interface Segregation):** Each interface covers one capability area. Consumers depend on the slice they need — e.g. `TriggerScanner` depends on `IWorkItemComments`, not the full connector.
- **CQS (Command-Query Separation):** `transitionWorkItem` returns `void` and throws on missing transition. Callers use `getTransitions()` to query available transitions.
- **`buildQueries`** takes a loose profile match shape (not `IAgentProfile`) for loose coupling.

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
