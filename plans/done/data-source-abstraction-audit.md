# Data Source Abstraction Audit

> **Goal:** Evaluate the cost and impact of supporting multiple task data sources (beyond JIRA) and propose an abstraction layer ("connector") that provides a uniform integration interface.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architectural Decisions](#architectural-decisions)
3. [Current Architecture: How JIRA Is Wired In](#current-architecture)
4. [Coupling Inventory](#coupling-inventory)
5. [Abstraction Cost Analysis](#abstraction-cost-analysis)
6. [Proposed Connector Architecture](#proposed-connector-architecture)
7. [Implementation Plan](#implementation-plan)
8. [Risk Assessment](#risk-assessment)

---

## 1. Executive Summary <a name="executive-summary"></a>

The orchestrator's JIRA dependency is **deep but well-layered**. JIRA is not scattered randomly — it flows through a clear set of interfaces:

```
IJiraClient → IIssueManager → Orchestrator
            → IResourceManager → TaskRunner/TaskResultWriter
IJiraPoller → Orchestrator
```

The existing DI architecture (awilix, interface-first design) means the mechanical refactor is straightforward. The hard part is **defining the right abstraction** because JIRA's concepts (issues with transitions, comments as triggers, ADF rich text, custom fields, attachments) don't have universal equivalents.

**Headline cost estimate:**

| Layer | Files touched | Effort |
|-------|--------------|--------|
| Core abstraction (new types + interfaces) | ~5 new files | Medium |
| JIRA adapter (rewrap existing code) | ~8 files | Low |
| Config & schema changes (multi-source) | ~5 files | Medium-High |
| Service layer adaptation | ~8 files | Medium-High |
| Prompt layer adaptation | ~3 files | Medium |
| Container/template layer | ~4 files | Low |
| Tests (new + updated) | ~15 files | High |
| **Total** | **~48 files** | **Large** |

Multi-source support (named `dataSources` map in config, per-profile data source binding, one poller per source) adds moderate complexity to the config/startup layer but has minimal impact on the service and container layers, which work with the abstract `WorkItem` type regardless of origin.

---

## 2. Architectural Decisions <a name="architectural-decisions"></a>

Three key design decisions were made during the review:

### Decision 1: Content extraction is the connector's responsibility

The orchestrator defines the shape it needs (`WorkItem` with Markdown description, pre-extracted custom fields). Each connector is responsible for converting source-specific formats (JIRA ADF, GitHub Markdown, etc.) into that shape. The ADF converter, field extractor, and issue parser stay inside the JIRA connector — the prompt builder and other consumers never see source-specific formats.

This means the orchestrator's `WorkItem.description` is always Markdown, `WorkItem.customFields` is always a flat `Map<string, string>`, and the prompt builder has zero connector-specific imports.

### Decision 2: Polling only (no webhooks)

All connectors implement the same polling model: periodically query the source API, return matching work items, drain buffer. This keeps the architecture simple and consistent.

GitHub's REST API supports listing issues with label/milestone/assignee filters — polling is straightforward. If webhook support is needed later, it can be added as an optional extension to the connector interface without redesigning the core loop.

### Decision 3: Named data sources (multi-source support)

The config supports multiple connected data sources via a named map, not a single discriminated union. Each profile declares which data source it uses. The orchestrator queues work from all active sources and processes operations sequentially regardless of origin.

```jsonc
// config.json
{
  "dataSources": {
    "jira-main": {
      "type": "jira",
      "pollIntervalMs": 60000,
      "baseUrl": "https://api.atlassian.com/ex/jira",
      "cloudId": "abc123"
    },
    "github-docs": {
      "type": "github",
      "pollIntervalMs": 120000,
      "owner": "kentico",
      "repo": "kontent-docs"
    }
  }
}
```

Profiles reference their data source by name:
```jsonc
// profiles/ralph-docs/profile.json
{
  "dataSource": "jira-main",   // ← references config.dataSources key
  "repo": "~/repos/kontent-docs",
  "variants": [...]
}
```

This means:
- The app doesn't dictate which integrations exist — config defines them
- Multiple profiles can share a data source, or each can have its own
- The poller runs one polling loop per data source, all feeding into a shared work queue
- The operation ledger stays unified (item IDs are globally unique since they include source-specific prefixes like `DF-123` or `owner/repo#456`)

---

## 3. Current Architecture: How JIRA Is Wired In <a name="current-architecture"></a>

### 2.1 The `JiraIssue` Type — The Central Data Structure

`JiraIssue` (defined in `src/jira/types.ts`) is the core data structure that flows through the entire pipeline:

```
JiraPoller.drain()
    → JiraIssue[]
        → TriggerScanner.scan(issues)
        → ProfileRouter.match(issue)
        → Orchestrator.executeOperation(issueKey, operation)
            → IssueManager.refreshIssue(key) → JiraIssue
            → buildTaskContext(issue, profile, ...) → TaskContext { issue: JiraIssue }
                → TaskRunner.run(ctx)
                    → PromptBuilder.build(issue, context)
                    → ContainerManager.execute(issue, context)
                    → AgentTemplateRenderer.render(context) → TemplateContext { issueKey, issueSummary, ... }
                    → JitMcpConfigWriter.write(profile, issue, ...) → resolved $jira.* macros
```

**20+ files** import `JiraIssue` directly. It appears in:
- Orchestrator main loop
- Task runner pipeline
- Profile router
- Trigger scanner
- Prompt builder
- Container manager
- Template renderer
- JIT MCP config writer
- Continuation runner
- Preflight checks
- Operation ledger (indirectly via issue key format)
- Orchestrator types (`ActiveTask`)

### 2.2 Key Interfaces (Existing Boundaries)

| Interface | File | What It Abstracts |
|-----------|------|-------------------|
| `IJiraClient` | `src/jira/client.ts` | REST API calls (search, comment, transition, attachment) |
| `IJiraPoller` | `src/jira/poller.ts` | Interval-based issue discovery |
| `IIssueManager` | `src/services/jira-issue-manager.ts` | Issue lifecycle (transitions, comments, refresh) |
| `IResourceManager` | `src/services/task-resource-manager.ts` | Resource I/O (comments, attachments, transcripts) |
| `IProfileRouter` | `src/services/profile-router.ts` | Issue → profile matching |
| `ITriggerScanner` | `src/services/trigger-scanner.ts` | Comment trigger detection & operation planning |

### 2.3 JIRA-Specific Concepts in the System

| Concept | Where Used | Abstractable? |
|---------|-----------|---------------|
| **Issue** (key, summary, description, status, type, priority, labels, components, created, updated) | Everywhere | Yes → `WorkItem` |
| **Comments** (as trigger mechanism + context) | TriggerScanner, Preflight, PromptBuilder, ResourceManager | Yes, but comment-based triggering is JIRA-specific UX |
| **Transitions** (named status changes via workflow) | IssueManager, TaskRunner, Orchestrator | Partially → some systems don't have transitions |
| **Attachments** (handoff.md upload/download) | ResourceManager, Preflight | Yes → generic file attachment |
| **ADF** (Atlassian Document Format) | AdfConverter, FieldExtractor, PromptBuilder | No → JIRA-only format, stays in adapter |
| **Custom fields** (customfield_*) | FieldExtractor | No → JIRA-only concept, stays in adapter |
| **JQL** (JIRA Query Language) | JqlBuilder, ConfigLoader, Poller | No → JIRA-only query language, stays in adapter |
| **Issue key format** (`XX-123`) | `assertValidIssueKey`, branch utility, ledger | Partially → each source has its own ID format |

---

## 4. Coupling Inventory <a name="coupling-inventory"></a>

### Tier 1: Pure JIRA (stays inside adapter)

These files contain JIRA REST API details and would become the "JIRA connector" implementation. **No changes needed** — they just move under the connector namespace.

| File | JIRA Concept |
|------|-------------|
| `src/jira/client.ts` | REST API v3 calls, Basic auth, URL construction |
| `src/jira/types.ts` | `JiraIssue`, `JiraComment`, `JiraTransition`, `JiraAttachment` |
| `src/jira/adf-converter.ts` | Atlassian Document Format → Markdown |
| `src/jira/field-extractor.ts` | Custom field ID mappings, `{value: "..."}` unwrapping |
| `src/jira/issue-parser.ts` | Custom field boilerplate removal |
| `src/jira/jql-builder.ts` | JQL query generation from profile rules |
| `src/jira/poller.ts` | JQL-based polling with pagination |

### Tier 2: Domain Bridge (needs abstraction)

These files use JIRA types in their interface but perform domain-level operations that could apply to any task source.

| File | Current Import | What Needs Abstracting |
|------|---------------|----------------------|
| `src/services/jira-issue-manager.ts` | `IJiraClient`, `JiraIssue`, `JiraComment` | → `IIssueLifecycleManager` (transitions, comments) |
| `src/services/task-resource-manager.ts` | `IJiraClient`, ADF converter | → `IResourceManager` already exists, but impl is JIRA-specific |
| `src/services/trigger-scanner.ts` | `JiraIssue`, `JiraComment`, `IIssueManager` | → Must work with generic `WorkItem` + `Comment` |
| `src/services/profile-router.ts` | `JiraIssue` | → Must work with generic `WorkItem` |
| `src/services/preflight.ts` | `JiraComment`, `JiraIssue`, ADF converter | → Must work with generic `Comment` |

### Tier 3: Generic Consumers (type change only)

These files use `JiraIssue` as a data carrier. Switching to a generic `WorkItem` type is a mechanical find-and-replace.

| File | Usage Pattern |
|------|--------------|
| `src/orchestrator.ts` | `JiraIssue` in `executeOperation()`, passes to runner |
| `src/orchestrator-types.ts` | `ActiveTask.issue: JiraIssue` |
| `src/services/task-context.ts` | `TaskContext.issue: JiraIssue`, status comparison |
| `src/services/task-runner.ts` | Receives `TaskContext`, delegates |
| `src/container/manager.ts` | `execute(issue: JiraIssue)` signature |
| `src/container/continuation-runner.ts` | `issue: JiraIssue` parameter |
| `src/container/setup/agent-includes.ts` | Extracts fields for `TemplateContext` |
| `src/container/setup/jit-mcp-params.ts` | `$jira.key`, `$jira.project` macros |
| `src/prompt/prompt.ts` | Extracts fields for prompt construction |
| `src/prompt/prompt-builder.ts` | Delegates to `prompt.ts` |
| `src/util/jira.ts` | `assertValidIssueKey()` — key format validation |
| `src/util/branch.ts` | Branch name from issue key |

### Tier 4: Configuration

| File | JIRA Config |
|------|-------------|
| `src/config/types.ts` | `IJiraConfig`, `ISecretsConfig` (jiraPat, jiraEmail), `IProfileMatch` (commentTrigger, revisionStatuses) |
| `src/config/schemas.ts` | Zod schemas for JIRA config fields |
| `src/config/loader.ts` | `JIRA_PAT`, `JIRA_EMAIL` env vars, `buildJqlFromProfiles()` |
| `config.json` | `jira: { baseUrl, cloudId, pollIntervalMs }` |

---

## 5. Abstraction Cost Analysis <a name="abstraction-cost-analysis"></a>

### 4.1 What's Cheap (Low Risk)

**Defining the generic `WorkItem` type** — The current `JiraIssue` type is already fairly generic:
```typescript
interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: unknown;
    status: { name: string };
    issuetype?: { name: string };
    priority?: { name: string };
    labels?: string[];
    components?: Array<{ name: string }>;
    created: string;
    updated?: string;
    [key: string]: unknown;  // catch-all for custom fields
  };
}
```
A generic `WorkItem` would look nearly identical — the field names just become more neutral.

**Rewrapping the JIRA client** — The existing `IJiraClient` interface is already behind DI. Making a JIRA adapter that implements a generic `IDataSourceClient` is mechanical.

**TemplateContext** — Already uses source-neutral names (`issueKey`, `issueSummary`, `issueStatus`). Renaming to `workItemKey` etc. is cosmetic.

### 4.2 What's Moderately Expensive

**The trigger system** — The comment-trigger mechanism is the most JIRA-specific part of the architecture:
- Comments are fetched via JIRA REST API
- A specific comment body must match `commentTrigger` regex
- Parameters are parsed from parenthesized suffixes
- Trigger comment IDs are deduplication keys in the operation ledger

Other data sources (GitHub Issues, Azure Boards, Linear) have comments too, so the concept translates. But each system's comment API, text format, and event model differ. A webhook-based system (GitHub) would bypass polling entirely.

**The prompt builder** — Currently tightly coupled to JIRA field extraction:
- ADF → Markdown conversion
- Custom field extraction with hardcoded field IDs
- Comment formatting with author + timestamp

This needs to move behind a `IWorkItemContentExtractor` interface that each connector implements.

**Configuration schema** — The current `config.json` has a top-level `jira` block. Supporting multiple sources requires either:
- A `dataSources` array with typed entries
- Separate config blocks per connector type

### 4.3 What's Expensive

**Test coverage migration** — ~15 test files reference `JiraIssue`, `makeIssue()`, `makeComment()`, `makeJiraConfig()`. The test factory in `tests/helpers/factories.ts` is heavily JIRA-typed. Tests need updating for the new generic types, and new tests are needed for:
- The generic connector interface
- Each new connector implementation
- The adapter/bridge layer

**JIT MCP macro system** — The macro resolver in `jit-mcp-params.ts` has hardcoded `$jira.*` macro names:
```typescript
const MACROS = {
  "$jira.key": (issue) => issue.key,
  "$jira.project": (issue) => issue.key.split("-")[0],
  "$jira.branch": (issue) => slugifyBranchName(issue.key, issue.fields.summary),
  "$jira.summary": (issue) => issue.fields.summary,
};
```
These need renaming or aliasing to source-neutral equivalents (`$task.key`, `$task.project`) while maintaining backward compatibility for existing profile configs.

---

## 6. Proposed Connector Architecture <a name="proposed-connector-architecture"></a>

### 5.1 Core Abstraction: `WorkItem` and `IDataSourceConnector`

```
src/
  datasource/
    types.ts            — WorkItem, Comment, Attachment, WorkItemTransition
    connector.ts        — IDataSourceConnector interface
    poller.ts           — IWorkItemPoller interface (generic polling)
    content-extractor.ts — IContentExtractor (description → Markdown)
  datasource/connectors/
    jira/               — JIRA connector (wraps existing src/jira/)
      jira-connector.ts
      jira-data-mapper.ts  (JiraIssue → WorkItem)
      jira-content-extractor.ts (ADF, custom fields)
    github/             — Future: GitHub Issues connector
    ado/                — Future: Azure Boards connector
```

### 5.2 Generic Types (`src/datasource/types.ts`)

```typescript
/** Source-neutral work item — the common denominator across all task data sources. */
export interface WorkItem {
  /** Unique identifier within the source system (e.g. JIRA key "DF-123", GitHub issue "#456"). */
  readonly id: string;
  /** Project/repository identifier (e.g. "DF", "owner/repo"). */
  readonly project: string;
  /** Human-readable title. */
  readonly summary: string;
  /** Description content, already converted to Markdown by the connector's content extractor. */
  readonly description: string;
  /** Current workflow status name. */
  readonly status: string;
  /** Work item type (e.g. "Task", "Bug", "Issue"). Empty if not applicable. */
  readonly type: string;
  /** Priority name. Empty if not applicable. */
  readonly priority: string;
  /** Labels / tags. */
  readonly labels: readonly string[];
  /** Component / area names. */
  readonly components: readonly string[];
  /** ISO-8601 creation timestamp. */
  readonly created: string;
  /** ISO-8601 last-updated timestamp. Empty if unavailable. */
  readonly updated: string;
  /** Additional source-specific fields (JIRA custom fields, GitHub metadata, etc.). */
  readonly customFields: ReadonlyMap<string, string>;
  /** Raw source data for connector-specific operations. Opaque to the orchestrator. */
  readonly _raw: unknown;
}

/** A comment on a work item. */
export interface WorkItemComment {
  /** Comment ID (unique within the work item). */
  readonly id: string;
  /** Author display name. */
  readonly authorName: string;
  /** Author ID (for allowlist matching). */
  readonly authorId: string;
  /** Plain-text comment body (already extracted from source-specific format). */
  readonly body: string;
  /** ISO-8601 creation timestamp. */
  readonly created: string;
}

/** An attachment on a work item. */
export interface WorkItemAttachment {
  readonly id: string;
  readonly filename: string;
  readonly created: string;
}

/** A work item status transition. */
export interface WorkItemTransition {
  readonly id: string;
  readonly name: string;
  readonly targetStatus: string;
}
```

### 6.3 Connector Interface (`src/datasource/connector.ts`)

```typescript
/** Unified interface for all task data source integrations. */
export interface IDataSourceConnector {
  /** Human-readable connector name (e.g. "JIRA", "GitHub Issues"). */
  readonly name: string;
  /** The data source key from config.dataSources (e.g. "jira-main"). */
  readonly sourceKey: string;

  // ── Discovery ──
  /** Search for work items matching the given query string (format is connector-specific). */
  searchWorkItems(query: string): Promise<WorkItem[]>;
  /** Re-fetch a single work item by ID. */
  refreshWorkItem(id: string): Promise<WorkItem | null>;

  // ── Comments ──
  /** Fetch all comments on a work item. */
  getComments(workItemId: string): Promise<WorkItemComment[]>;
  /** Post a comment on a work item. */
  addComment(workItemId: string, body: string): Promise<void>;

  // ── Transitions ──
  /** Move a work item to a target status. No-op if transitions are not supported. */
  transitionWorkItem(workItemId: string, targetStatus: string): Promise<void>;

  // ── Attachments ──
  /** List attachments on a work item. */
  getAttachments(workItemId: string): Promise<WorkItemAttachment[]>;
  /** Download an attachment's content. */
  downloadAttachment(workItemId: string, attachmentId: string): Promise<string>;
  /** Upload an attachment to a work item. */
  addAttachment(workItemId: string, filename: string, content: string): Promise<void>;

  // ── Query building ──
  /** Build data-source-specific queries from profile match rules. */
  buildQueries(profiles: readonly IAgentProfile[]): string[];

  // ── Validation ──
  /** Validate an item ID format (e.g. JIRA key `XX-123`, GitHub `#456`). */
  isValidItemId(id: string): boolean;
}
```

### 6.4 Multi-Source Poller Design

With named data sources, the orchestrator runs one poller per data source. All pollers feed into a unified work queue.

```typescript
/** Generic poller that wraps a connector's search capability. */
export interface IWorkItemPoller {
  readonly sourceKey: string;
  start(): void;
  stop(): void;
  onItems(callback: () => void): void;
  drain(): WorkItem[];
}
```

The orchestrator creates pollers from the connector registry:
```
// In awilix-cradle.ts or orchestrator constructor:
for (const [key, connector] of connectors) {
  pollers.push(new WorkItemPoller({ connector, config: dataSources[key] }));
}
```

Each poller independently polls its source on its own interval. The orchestrator's main loop drains all pollers:
```
while (running) {
  for (const poller of pollers) {
    const discovered = poller.drain();
    if (discovered.length > 0) {
      await triggerScanner.scan(discovered, profilesForSource(poller.sourceKey));
    }
  }
  // ... pick next pending operation from unified ledger
}
```

### 6.5 How the Existing Services Adapt

The existing service interfaces (`IIssueManager`, `IResourceManager`, `IProfileRouter`, `ITriggerScanner`) remain **mostly unchanged** in their contracts. The key change is swapping `JiraIssue` → `WorkItem` and `JiraComment` → `WorkItemComment` in their signatures.

```
Before:
  IIssueManager.refreshIssue(issueKey: string): Promise<JiraIssue | null>
  IProfileRouter.match(issue: JiraIssue): Promise<ProfileMatchResult | null>
  ITriggerScanner.scan(issues: JiraIssue[], ...): Promise<number>

After:
  IIssueManager.refreshWorkItem(itemId: string): Promise<WorkItem | null>
  IProfileRouter.match(item: WorkItem): Promise<ProfileMatchResult | null>
  ITriggerScanner.scan(items: WorkItem[], ...): Promise<number>
```

Services that previously accepted `IJiraClient` now accept `IDataSourceConnector`:

```
Before:
  constructor({ jiraClient, logger }: { jiraClient: IJiraClient; logger: Logger })

After:
  constructor({ connector, logger }: { connector: IDataSourceConnector; logger: Logger })
```

With multi-source support, the orchestrator resolves the correct connector per profile:
- Each profile has a `dataSource` field referencing a named source from `config.dataSources`
- The cradle holds a `Map<string, IDataSourceConnector>` keyed by data source name
- When a profile's task is picked up, the orchestrator looks up `connectors.get(profile.dataSource)`
- Services that call the connector (IssueManager, ResourceManager) receive the resolved connector per-task

### 6.6 Prompt Layer Adaptation

The prompt builder works with `WorkItem` directly — no source-specific imports needed:

1. `WorkItem.description` is already Markdown (the connector did the conversion)
2. `WorkItem.customFields` is already a `Map<string, string>` (the connector extracted and labelled them)
3. Comments arrive as `WorkItemComment[]` with plain-text `body` fields

The `IssueContext` interface becomes `WorkItemContext`:
```typescript
export interface WorkItemContext {
  comments: string[];
  isRevision: boolean;
  handoffContent?: string | null;
}
```

### 6.7 Config Changes

```jsonc
// config.json — before
{
  "jira": {
    "baseUrl": "https://api.atlassian.com/ex/jira",
    "cloudId": "abc123",
    "pollIntervalMs": 60000
  }
}

// config.json — after
{
  "dataSources": {
    "jira-main": {
      "type": "jira",
      "pollIntervalMs": 60000,
      "baseUrl": "https://api.atlassian.com/ex/jira",
      "cloudId": "abc123"
    }
  }
}
```

Profile `profile.json` gains a `dataSource` field:
```jsonc
{
  "dataSource": "jira-main",
  "repo": "~/repos/kontent-docs",
  "cli": "copilot",
  "variants": [...]
}
```

Profile match rules stay the same structure (`projects`, `statuses`, `commentTrigger`) — different connectors interpret them according to their system's semantics.

Secrets use source-type-scoped naming:
```bash
JIRA_PAT=...           # Used by any "jira" type data source
JIRA_EMAIL=...
# Future: GITHUB_TOKEN=... for "github" type sources
```

### 6.8 JIT MCP Macro Renaming

```typescript
// Before:
"$jira.key", "$jira.project", "$jira.branch", "$jira.summary"

// After:
"$task.key", "$task.project", "$task.branch", "$task.summary"
```

All profiles and documentation switch to `$task.*` macros. The old `$jira.*` macros are removed.

---

## 7. Implementation Plan <a name="implementation-plan"></a>

### Phase 0: Preparation (prerequisite)
> Effort: Small (1-2 days)

1. **Rename JIRA variable names in generic consumers** — Before introducing any new types, rename variables like `issue` → `workItem`, `issueKey` → `itemId` in files that are truly generic consumers (Tier 3). This makes the subsequent type swap less noisy.
2. **Create `src/datasource/` directory** — Establish the new module boundary.

### Phase 1: Define the Abstraction Layer
> Effort: Medium (2-3 days)

1. **Define `WorkItem`, `WorkItemComment`, `WorkItemAttachment`, `WorkItemTransition`** in `src/datasource/types.ts`.
2. **Define `IDataSourceConnector`** in `src/datasource/connector.ts`.
3. **Define `IWorkItemPoller`** in `src/datasource/poller.ts` — generic version of `IJiraPoller`.
4. **Define `IContentExtractor`** — interface for source-specific content → Markdown conversion.
5. **Update test helpers** — Add `makeWorkItem()`, `makeWorkItemComment()` factory functions alongside (not replacing) existing JIRA factories.

### Phase 2: Build the JIRA Connector
> Effort: Medium (3-4 days)

1. **Create `src/datasource/connectors/jira/jira-connector.ts`** — Implements `IDataSourceConnector` by wrapping existing `IJiraClient`.
2. **Create `src/datasource/connectors/jira/jira-data-mapper.ts`** — Converts `JiraIssue` → `WorkItem`, `JiraComment` → `WorkItemComment`.
3. **Create `src/datasource/connectors/jira/jira-content-extractor.ts`** — Wraps ADF converter + field extractor.
4. **Create `src/datasource/connectors/jira/jira-poller.ts`** — Wraps existing `JiraPoller` but returns `WorkItem[]`.
5. **Tests** — Ensure the JIRA connector produces identical results to the current direct JIRA integration.

### Phase 3: Migrate Core Services to `WorkItem`
> Effort: High (4-5 days)

1. **`src/services/jira-issue-manager.ts`** → Rename to `src/services/issue-manager.ts`. Change constructor to accept `IDataSourceConnector` instead of `IJiraClient`. Update method signatures to use `WorkItem`.
2. **`src/services/task-resource-manager.ts`** → Change constructor to accept `IDataSourceConnector`. The `fetchComments()`, `fetchHandoff()`, `attachTranscript()` methods work through the connector.
3. **`src/services/trigger-scanner.ts`** → Replace `JiraIssue` with `WorkItem`, `JiraComment` with `WorkItemComment`.
4. **`src/services/profile-router.ts`** → Replace `JiraIssue` with `WorkItem`. The `matchesProjectAndStatus()` logic stays the same (project from ID prefix, status name comparison).
5. **`src/services/preflight.ts`** → Replace `JiraComment` + `JiraIssue` with generic types.
6. **`src/services/task-context.ts`** → Replace `TaskContext.issue: JiraIssue` with `TaskContext.item: WorkItem`.
7. **`src/orchestrator-types.ts`** → Replace `ActiveTask.issue: JiraIssue` with `ActiveTask.item: WorkItem`.

### Phase 4: Migrate Prompt & Container Layers
> Effort: Medium (2-3 days)

1. **`src/prompt/prompt.ts`** → Rewrite `buildPromptWithSections()` to accept `WorkItem` instead of `JiraIssue`. Remove direct imports of ADF converter and field extractor — the `WorkItem.description` and `WorkItem.customFields` are already pre-processed.
2. **`src/prompt/prompt-builder.ts`** → Replace `JiraIssue` with `WorkItem`. Remove `JiraIssueParser` import (move parsing to connector).
3. **`src/container/manager.ts`** → Replace `JiraIssue` with `WorkItem` in `execute()` signature.
4. **`src/container/continuation-runner.ts`** → Same type swap.
5. **`src/container/setup/agent-includes.ts`** → `buildTemplateContext()` already extracts fields into neutral names; update input type from `JiraIssue` to `WorkItem`.
6. **`src/container/setup/jit-mcp-params.ts`** → Rename `$jira.*` macros to `$task.*` with backward-compatible aliases.

### Phase 5: Config, Startup & Multi-Source Wiring
> Effort: Medium-High (3-4 days)

1. **`src/config/types.ts`** → Add `IDataSourceConfig` (base with `type` and `pollIntervalMs`), `IJiraDataSourceConfig extends IDataSourceConfig`, and future connector config types. Replace `IJiraConfig` usage in `IAppConfig` with `dataSources: Record<string, IDataSourceConfig>`. Add `dataSource: string` to `IAgentProfile`.
2. **`src/config/schemas.ts`** → Add Zod schemas for `dataSources` map with type-discriminated entries. Add `dataSource` field to profile schema (required string, references a key in `config.dataSources`).
3. **`src/config/loader.ts`** → Parse `dataSources` from config, load connector-specific secrets, validate that every profile's `dataSource` references an existing key. Build queries per-connector using `connector.buildQueries(profilesForSource)`.
4. **`src/awilix-cradle.ts`** → Register `connectors: Map<string, IDataSourceConnector>` (built from config). Register `pollers: IWorkItemPoller[]` (one per data source). Remove individual `jiraClient`, `poller` registrations — they're internal to the JIRA connector.
5. **Orchestrator constructor** → Accept `connectors` map and `pollers` array. Start/stop all pollers. Drain all pollers in the main loop. Resolve the correct connector when picking up an operation (via `profile.dataSource`).
6. **`src/validate/`** → Update startup validation to check `dataSources` block and per-source credentials.
7. **`config.json.sample`** → Update with new schema.

### Phase 6: Migrate Tests
> Effort: High (3-4 days)

1. **Update `tests/helpers/factories.ts`** — Add `makeWorkItem()`, `makeWorkItemComment()`. Gradually deprecate `makeIssue()`.
2. **Update all service tests** to use generic types.
3. **Add connector-specific tests** for the JIRA adapter (data mapping, ADF conversion, field extraction).
4. **Add interface compliance tests** — verify any connector implementation satisfies `IDataSourceConnector`.

### Phase 7: Cleanup & Documentation
> Effort: Small (1-2 days)

1. **Remove `src/jira/`** — Move contents under `src/datasource/connectors/jira/` so there's no vestigial top-level JIRA directory.
2. **Remove old config fields** — Strip the top-level `jira` key from `configFileSchema`, `IAppConfig`, and all related types. Only `dataSources` exists.
3. **Update `$jira.*` macros** — Replace with `$task.*` in all profile configs and MCP server env blocks. Remove the `$jira.*` macro definitions from `jit-mcp-params.ts`.
4. **Update documentation** — `CONFIGURATION.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `MCP.md` with new architecture, config schema, and connector model.
5. **Validate multi-source** — Add integration-level test that configures two data sources and verifies both pollers run and operations from both sources are queued correctly.

---

## 8. Risk Assessment <a name="risk-assessment"></a>

### High Risk

| Risk | Mitigation |
|------|-----------|
| **Over-abstraction** — Building a generic connector that's too abstract to be useful for any specific integration. | Design the `WorkItem` type by starting from what the orchestrator actually needs, not from what all possible sources might provide. The current `JiraIssue` usage patterns are the spec. |
| **Comment-trigger model breaks for non-comment systems** — GitHub Issues uses webhooks, not polling. Linear has different event models. | Make trigger discovery a connector concern. `IDataSourceConnector` has a `getComments()` method, but the poller could also emit pre-built trigger events directly for webhook-based systems. |
| **Test regression** — 47+ files changing simultaneously risks breaking the test suite. | Migrate in phases. Phase 2 (JIRA connector) must pass all existing tests before Phase 3 begins. |

### Medium Risk

| Risk | Mitigation |
|------|-----------|
| **Multi-poller coordination** — Multiple pollers draining into one queue could cause ordering/priority issues. | Pollers are independent; the ledger already sorts pending operations by `commentTimestamp`. Add a `sourceKey` field to operations for debugging but don't give sources different priority. |
| **Config schema change** — `config.json` and `profile.json` schemas change. No backward compatibility. | Clean break: update config, schemas, and docs in one phase. Validate with Zod at startup — invalid configs fail fast with clear errors. |

### Low Risk

| Risk | Mitigation |
|------|-----------|
| **DI wiring** — Adding the connector to the awilix cradle. | The existing pattern (interface + concrete class + config slice) is well-established. |
| **Performance** — Extra mapping layer (JiraIssue → WorkItem) adds overhead. | The mapping is trivial (field copy). Negligible vs. JIRA API latency. |

---

## Appendix: Files Changed Per Phase

| Phase | New Files | Modified Files | Notes |
|-------|-----------|----------------|-------|
| 0 | 0 | ~10 | Variable renames only, no logic changes |
| 1 | 4-5 | 1 | New types + interfaces, test helper additions |
| 2 | 4-5 | 0 | JIRA connector wraps existing code |
| 3 | 0 | 7-8 | Service interfaces swap JiraIssue → WorkItem |
| 4 | 0 | 6 | Prompt/container type swaps |
| 5 | 1-2 | 6-7 | Config schemas, loader, cradle, orchestrator multi-poller |
| 6 | 2-3 | 12-15 | Test factories, service mocks, connector tests |
| 7 | 0 | 5-6 | Backward compat, docs, cleanup |

### Key Diagrams

**Before (current):**
```
config.json { jira: {...} }
    → loadConfig() → IJiraConfig
        → JiraClient → IJiraPoller → Orchestrator
                     → IIssueManager ↗
                     → IResourceManager ↗
```

**After (proposed):**
```
config.json { dataSources: { "jira-main": {...}, "github-docs": {...} } }
    → loadConfig() → Map<string, IDataSourceConfig>
        → ConnectorFactory
            → JiraConnector("jira-main")  → WorkItemPoller("jira-main") ──┐
            → GitHubConnector("github-docs") → WorkItemPoller("github-docs") ┤
                                                                              ↓
                                                              Orchestrator (unified queue)
                                                                    ↓
                                                          IssueManager(connector)
                                                          ResourceManager(connector)
                                                          TriggerScanner(workItems)
```
