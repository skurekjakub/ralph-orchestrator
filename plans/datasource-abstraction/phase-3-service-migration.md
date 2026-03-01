# Phase 3: Migrate Core Services to `WorkItem`

> **Status:** COMPLETE
> **Effort:** High (4-5 days)
> **Depends on:** Phase 2
> **Prerequisite for:** Phase 4, Phase 5
>
> Phase 3 cascaded into Phase 4 — all code-level prompt/container/template changes
> were required by type compatibility and completed here. Phase 4 reduces to naming-only tasks.

## Goal

Replace `JiraIssue` / `JiraComment` with `WorkItem` / `WorkItemComment` in all service-layer interfaces and implementations. Services that previously depended on `IJiraClient` now depend on `IDataSourceConnector` (base) and use type guards (`supportsTransitions`, `supportsAttachments`) for optional capabilities.

This is the highest-risk phase — it touches the most files and changes real signatures.

## Tasks

### 3.1 Issue Manager

**Current:** `src/services/jira-issue-manager.ts` → **Rename to:** `src/services/issue-manager.ts`

| Before | After |
|--------|-------|
| `IIssueManager` | `IIssueManager` (same name, widened contract) |
| Accepts `IJiraClient` | Accepts `IDataSourceConnector`, uses `supportsTransitions()` guard |
| `refreshIssue(issueKey)` returns `JiraIssue` | `refreshWorkItem(itemId)` returns `WorkItem` |
| `getComments(issueKey)` returns `JiraComment[]` | `getComments(itemId)` returns `WorkItemComment[]` |
| `transitionIssue()` calls `jiraClient.findTransitionId()` + `jiraClient.transitionIssue()` | `transitionWorkItem()` — checks `supportsTransitions()` guard, then delegates (throws if not found) |
| `postStartComment()`, `postErrorComment()`, etc. call `jiraClient.addComment()` | Same methods call `connector.addComment()` |

### 3.2 Resource Manager

**File:** `src/services/task-resource-manager.ts`

| Before | After |
|--------|-------|
| Accepts `IJiraClient` | Accepts `IDataSourceConnector`, uses `supportsAttachments()` guard |
| `fetchComments()` calls `jiraClient.getComments()` + `extractAdfText()` | `fetchComments()` calls `connector.getComments()` — body is already plain text |
| `fetchHandoff()` calls `jiraClient.getAttachments()` / `downloadAttachment()` | `fetchHandoff()` — checks `supportsAttachments()` guard, then delegates |
| `attachTranscript()` calls `jiraClient.addAttachment()` | `attachTranscript()` — checks `supportsAttachments()` guard, then delegates |

Remove `extractAdfText` import — the connector already did the conversion.

### 3.3 Trigger Scanner

**File:** `src/services/trigger-scanner.ts`

| Before | After |
|--------|-------|
| `scan(issues: JiraIssue[], ...)` | `scan(items: WorkItem[], ...)` |
| `JiraComment` for comment bodies | `WorkItemComment` — `.body` is already plain text |
| `extractAdfText(comment.body)` for text extraction | Direct `comment.body` access (no ADF) |
| `comment.author.accountId` for allowlist | `comment.authorId` |
| `comment.author.displayName` for logging | `comment.authorName` |
| `issue.fields.updated` for cache | `workItem.updated` |
| `issue.key` for logging/ledger | `workItem.id` |

### 3.4 Profile Router

**File:** `src/services/profile-router.ts`

| Before | After |
|--------|-------|
| `match(issue: JiraIssue)` | `match(item: WorkItem)` |
| `matchesProjectAndStatus(issue: JiraIssue, ...)` | `matchesProjectAndStatus(item: WorkItem, ...)` |
| `issue.key.split("-")[0]` for project extraction | `item.project` (connector already split it) |
| `issue.fields.status?.name` | `item.status` |

### 3.5 Preflight

**File:** `src/services/preflight.ts`

| Before | After |
|--------|-------|
| `PreflightContext.comments: JiraComment[]` | `PreflightContext.comments: WorkItemComment[]` |
| `runPreflight(name, issue: JiraIssue, ...)` | `runPreflight(name, item: WorkItem, ...)` |
| `extractAdfText(comment.body)` for PR URL scanning | `comment.body` directly (already plain text) |

### 3.6 Task Context

**File:** `src/services/task-context.ts`

| Before | After |
|--------|-------|
| `TaskContext.issue: JiraIssue` | `TaskContext.workItem: WorkItem` |
| `issue.fields.status?.name` for revision detection | `workItem.status` |
| `buildTaskContext(issue: JiraIssue, ...)` | `buildTaskContext(workItem: WorkItem, ...)` |

### 3.7 Orchestrator Types

**File:** `src/orchestrator-types.ts`

| Before | After |
|--------|-------|
| `ActiveTask.issue: JiraIssue` | `ActiveTask.workItem: WorkItem` |
| Import `JiraIssue` from `./jira/types.js` | Import `WorkItem` from `./datasource/types.js` |

## Validation

- `npm run lint` passes
- `npm test` passes — tests need updating for new method names and types
- All service interfaces use `WorkItem` / `WorkItemComment`, not JIRA types
- No `src/jira/` imports remain outside of `src/datasource/connectors/jira/`
