# Data Source Abstraction — Final-State Architecture

What the codebase looks like when all phases are complete.  
No intermediate steps — this is the end result.

---

## Directory Structure

```
src/
  datasource/
    types.ts                    # WorkItem, WorkItemComment, WorkItemAttachment, WorkItemTransition
    connector.ts                # IDataSourceIdentity, IWorkItemSource, IWorkItemComments,
                                #   IWorkItemTransitions, IWorkItemAttachments, IDataSourceConnector
    poller.ts                   # IWorkItemPoller
    connectors/
      jira/
        jira-connector.ts       # JiraConnector implements IDataSourceConnector
        jira-mapper.ts          # JiraIssue → WorkItem, JiraComment → WorkItemComment, etc.
        jira-content.ts         # ADF → plain text extraction (moved from jira/field-extractor.ts)
        jira-poller.ts          # JiraWorkItemPoller implements IWorkItemPoller (wraps connector)

  jira/                         # JIRA REST API client — internal to the connector
    client.ts                   # IJiraClient (unchanged — raw HTTP calls)
    types.ts                    # JiraIssue, JiraComment, etc. (unchanged — internal types)

  config/
    types.ts                    # IAppConfig.dataSources (replaces .jira), IDataSourceConfig, IAgentProfile.dataSource
    schemas.ts                  # dataSourcesSchema (replaces rawJiraSchema)

  services/
    issue-manager.ts            # IIssueManager depends on IWorkItemSource + IWorkItemComments + IWorkItemTransitions
    resource-manager.ts         # IResourceManager depends on IWorkItemComments + IWorkItemAttachments
    trigger-scanner.ts          # ITriggerScanner.scan() takes WorkItem[] (not JiraIssue[])

  prompt/
    prompt.ts                   # buildPromptWithSections(workItem: WorkItem, ...) — no JIRA import

  container/setup/
    agent-includes.ts           # TemplateContext uses workItemKey, workItemSummary, etc.
    jit-mcp-params.ts           # MACROS keyed on $task.* (not $jira.*)
```

### What's gone

- ~~`src/jira/poller.ts`~~ → replaced by `src/datasource/connectors/jira/jira-poller.ts`
- ~~`src/jira/jql-builder.ts`~~ → folded into `JiraConnector.buildQueries()`
- ~~`src/jira/field-extractor.ts`~~ → moved to `jira-content.ts` inside the connector
- ~~`src/services/jira-issue-manager.ts`~~ → replaced by generic `issue-manager.ts`
- ~~`src/services/task-resource-manager.ts`~~ → replaced by generic `resource-manager.ts`

### What's unchanged

- `src/jira/client.ts` — still the raw REST client, only imported inside `src/datasource/connectors/jira/`
- `src/jira/types.ts` — still defines `JiraIssue`, `JiraComment`, etc. as internal types

---

## Type Definitions

### `src/datasource/types.ts` (exists today, no changes needed)

```ts
interface WorkItem {
  readonly id: string;           // "DF-2759"
  readonly source: string;       // "jira" — matches config key
  readonly project: string;      // "DF"
  readonly title: string;        // plain text
  readonly description: string;  // plain text (ADF already converted)
  readonly status: string;
  readonly type: string;
  readonly priority: string;
  readonly labels: readonly string[];
  readonly components: readonly string[];
  readonly created: string;      // ISO-8601
  readonly updated: string;
  readonly customFields: ReadonlyMap<string, string>;
  readonly sourceData: unknown;  // opaque — connector round-trip data
}

interface WorkItemComment {
  readonly id: string;
  readonly authorName: string;
  readonly authorId: string;
  readonly body: string;         // plain text (ADF already converted)
  readonly created: string;
}

interface WorkItemAttachment { readonly id: string; readonly filename: string; readonly created: string; }
interface WorkItemTransition  { readonly id: string; readonly name: string; readonly targetStatus: string; }
```

### `src/datasource/connector.ts` (exists today, no changes needed)

```ts
interface IDataSourceIdentity { readonly name: string; readonly sourceKey: string; }

// ── Mandatory (every connector) ──────────────────────────

interface IWorkItemSource extends IDataSourceIdentity {
  buildQueries(profiles: ...): SourceQuery[];
  searchWorkItems(query, pageSize?): Promise<WorkItem[]>;
  refreshWorkItem(id): Promise<WorkItem>;
  isValidItemId(id): boolean;
}

interface IWorkItemComments extends IDataSourceIdentity {
  getComments(id): Promise<WorkItemComment[]>;
  addComment(id, body): Promise<void>;
}

// Base connector — every implementation must provide discovery + comments
interface IDataSourceConnector extends IWorkItemSource, IWorkItemComments {}

// ── Optional capabilities ────────────────────────────────

interface ISupportsTransitions {
  getTransitions(id): Promise<WorkItemTransition[]>;
  transitionWorkItem(id, targetStatus): Promise<void>;   // throws if no matching transition
}

interface ISupportsAttachments {
  getAttachments(id): Promise<WorkItemAttachment[]>;
  downloadAttachment(id, attachmentId): Promise<string>;
  addAttachment(id, filename, content): Promise<void>;
}

// Full-capability connector (JIRA implements this)
type IFullDataSourceConnector = IDataSourceConnector & ISupportsTransitions & ISupportsAttachments;

// Runtime type guards
function supportsTransitions(c: IDataSourceConnector): c is IDataSourceConnector & ISupportsTransitions;
function supportsAttachments(c: IDataSourceConnector): c is IDataSourceConnector & ISupportsAttachments;
```

---

## JIRA Connector Implementation

### `src/datasource/connectors/jira/jira-connector.ts`

```ts
import type { IJiraClient } from "../../../jira/client.js";
import type { IDataSourceConnector, SourceQuery } from "../../connector.js";
import type { WorkItem, WorkItemComment, WorkItemAttachment, WorkItemTransition } from "../../types.js";
import { mapIssueToWorkItem, mapCommentToWorkItemComment, mapAttachmentToWorkItemAttachment, mapTransitionToWorkItemTransition } from "./jira-mapper.js";
import { buildJqlFromMatchRules } from "./jira-queries.js";

export class JiraConnector implements IFullDataSourceConnector {
  readonly name = "JIRA";
  readonly sourceKey: string;

  constructor(private client: IJiraClient, sourceKey: string) {
    this.sourceKey = sourceKey;
  }

  // ── IWorkItemSource ───────────────────────────────────

  buildQueries(profiles: readonly { match: { projects: string[]; statuses?: string[] } }[]): SourceQuery[] {
    return buildJqlFromMatchRules(profiles);             // extracted from current jql-builder.ts
  }

  async searchWorkItems(query: SourceQuery, pageSize?: number): Promise<WorkItem[]> {
    const issues = await this.client.searchIssues(query, pageSize);
    return issues.map(i => mapIssueToWorkItem(i, this.sourceKey));
  }

  async refreshWorkItem(id: string): Promise<WorkItem> {
    const [issue] = await this.client.searchIssues(`key = "${id}"`, 1);
    if (!issue) throw new Error(`Work item ${id} not found`);
    return mapIssueToWorkItem(issue, this.sourceKey);
  }

  isValidItemId(id: string): boolean {
    return /^[A-Z][A-Z0-9]+-\d+$/.test(id);
  }

  // ── IWorkItemComments ─────────────────────────────────

  async getComments(id: string): Promise<WorkItemComment[]> {
    const comments = await this.client.getComments(id);
    return comments.map(mapCommentToWorkItemComment);
  }

  async addComment(id: string, body: string): Promise<void> {
    await this.client.addComment(id, body);
  }

  // ── IWorkItemTransitions ──────────────────────────────

  async getTransitions(id: string): Promise<WorkItemTransition[]> {
    const transitions = await this.client.getTransitions(id);
    return transitions.map(mapTransitionToWorkItemTransition);
  }

  async transitionWorkItem(id: string, targetStatus: string): Promise<void> {
    const transitionId = await this.client.findTransitionId(id, targetStatus);
    if (!transitionId) throw new Error(`No transition to "${targetStatus}" for ${id}`);
    await this.client.transitionIssue(id, transitionId);
  }

  // ── IWorkItemAttachments ──────────────────────────────

  async getAttachments(id: string): Promise<WorkItemAttachment[]> {
    const attachments = await this.client.getAttachments(id);
    return attachments.map(mapAttachmentToWorkItemAttachment);
  }

  async downloadAttachment(id: string, attachmentId: string): Promise<string> {
    // Look up the content URL from the attachment list, then download
    const attachments = await this.client.getAttachments(id);
    const att = attachments.find(a => a.id === attachmentId);
    if (!att) throw new Error(`Attachment ${attachmentId} not found on ${id}`);
    return this.client.downloadAttachment(att.content);
  }

  async addAttachment(id: string, filename: string, content: string | Buffer): Promise<void> {
    await this.client.addAttachment(id, filename, typeof content === "string" ? content : content.toString("utf-8"));
  }
}
```

### `src/datasource/connectors/jira/jira-mapper.ts`

```ts
import type { JiraIssue, JiraComment, JiraAttachment, JiraTransition } from "../../../jira/types.js";
import type { WorkItem, WorkItemComment, WorkItemAttachment, WorkItemTransition } from "../../types.js";
import { extractAdfText } from "./jira-content.js";

export function mapIssueToWorkItem(issue: JiraIssue, source: string): WorkItem {
  return {
    id: issue.key,
    source,
    project: issue.key.split("-")[0],
    title: issue.fields.summary ?? "",
    description: extractAdfText(issue.fields.description) ?? "",
    status: issue.fields.status?.name ?? "",
    type: issue.fields.issuetype?.name ?? "",
    priority: issue.fields.priority?.name ?? "",
    labels: issue.fields.labels ?? [],
    components: (issue.fields.components ?? []).map(c => c.name),
    created: issue.fields.created,
    updated: issue.fields.updated ?? "",
    customFields: new Map(),
    sourceData: issue,                     // preserve the raw JiraIssue for round-trips
  };
}

export function mapCommentToWorkItemComment(comment: JiraComment): WorkItemComment {
  return {
    id: comment.id,
    authorName: comment.author.displayName,
    authorId: comment.author.accountId,
    body: extractAdfText(comment.body) ?? "",
    created: comment.created,
  };
}

export function mapAttachmentToWorkItemAttachment(att: JiraAttachment): WorkItemAttachment {
  return { id: att.id, filename: att.filename, created: att.created };
}

export function mapTransitionToWorkItemTransition(t: JiraTransition): WorkItemTransition {
  return { id: t.id, name: t.name, targetStatus: t.to.name };
}
```

### `src/datasource/connectors/jira/jira-poller.ts`

```ts
import type { IWorkItemPoller } from "../../poller.js";
import type { IWorkItemSource } from "../../connector.js";
import type { WorkItem } from "../../types.js";

export class JiraWorkItemPoller implements IWorkItemPoller {
  readonly sourceKey: string;

  private buffer = new Map<string, WorkItem>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private callback: (() => void) | null = null;
  private queries: string[];
  private pollIntervalMs: number;
  private connector: IWorkItemSource;

  constructor(connector: IWorkItemSource, queries: string[], pollIntervalMs: number) {
    this.sourceKey = connector.sourceKey;
    this.connector = connector;
    this.queries = queries;
    this.pollIntervalMs = pollIntervalMs;
  }

  start(): void { /* fire immediately + setInterval — same as current JiraPoller */ }
  stop(): void  { /* clearInterval */ }
  onItems(cb: () => void): void { this.callback = cb; }
  drain(): WorkItem[] {
    const items = [...this.buffer.values()];
    this.buffer.clear();
    return items;
  }

  private async poll(): Promise<void> {
    for (const query of this.queries) {
      const items = await this.connector.searchWorkItems(query);
      for (const item of items) this.buffer.set(item.id, item);
    }
    if (this.buffer.size > 0) this.callback?.();
  }
}
```

---

## Rewritten Services (all JIRA references gone)

### `src/services/issue-manager.ts`

```ts
// BEFORE: depends on IJiraClient, returns JiraIssue, calls client.findTransitionId + client.transitionIssue
// AFTER:  depends on base connector + optional ISupportsTransitions, uses type guards

import type { IDataSourceConnector, ISupportsTransitions, supportsTransitions } from "../datasource/connector.js";
import type { WorkItem } from "../datasource/types.js";

export interface IIssueManager {
  refreshWorkItem(id: string): Promise<WorkItem | null>;
  transitionWorkItem(id: string, targetStatus: string | undefined, phase: TransitionPhase): Promise<void>;
  postStartComment(id: string, displayName: string, profileId: string): Promise<void>;
  postErrorComment(id: string, error: string): Promise<void>;
  postCrashRecoveryComment(id: string, variant: string): Promise<void>;
  postStaleStatusComment(id: string, displayName: string, currentStatus: string): Promise<void>;
  postAckComment(id: string, displayName: string, triggerParams?: string[]): Promise<void>;
  postComment(id: string, body: string): Promise<void>;
}

export class IssueManager implements IIssueManager {
  constructor({
    connector,
    logger,
  }: {
    connector: IDataSourceConnector;
    logger: Logger;
  }) { ... }

  async refreshWorkItem(id: string): Promise<WorkItem | null> {
    return this.connector.refreshWorkItem(id);
  }

  async transitionWorkItem(id: string, targetStatus: string | undefined, phase: TransitionPhase): Promise<void> {
    if (!targetStatus) return;
    if (!supportsTransitions(this.connector)) {
      this.logger.warn(`Connector "${this.connector.name}" does not support transitions`);
      return;
    }
    await this.connector.transitionWorkItem(id, targetStatus);  // throws if no matching transition
  }

  async postComment(id: string, body: string): Promise<void> {
    await this.connector.addComment(id, body);
  }

  // postStartComment, postErrorComment, etc. — same as today but call this.postComment()
}
```

### `src/services/resource-manager.ts`

```ts
// BEFORE: depends on IJiraClient, calls getComments/getAttachments/downloadAttachment/addAttachment
// AFTER:  depends on IWorkItemComments + IWorkItemAttachments

export interface IResourceManager {
  fetchComments(id: string): Promise<string[]>;
  fetchHandoff(id: string): Promise<string | null>;
  attachTranscript(id: string, localPath: string, variantName: string): Promise<void>;
}

export class ResourceManager implements IResourceManager {
  constructor({
    workItemComments,
    workItemAttachments,
    logger,
  }: {
    workItemComments: IWorkItemComments;
    workItemAttachments: IWorkItemAttachments;
    logger: Logger;
  }) { ... }

  async fetchComments(id: string): Promise<string[]> {
    const comments = await this.workItemComments.getComments(id);
    return comments.map(c => c.body);                       // already plain text — connector did conversion
  }

  async fetchHandoff(id: string): Promise<string | null> {
    const attachments = await this.workItemAttachments.getAttachments(id);
    const handoff = attachments.find(a => a.filename === "handoff.md");
    if (!handoff) return null;
    return this.workItemAttachments.downloadAttachment(id, handoff.id);
  }

  async attachTranscript(id: string, localPath: string, variantName: string): Promise<void> {
    const content = await readFile(localPath, "utf-8");
    await this.workItemAttachments.addAttachment(id, `${variantName}-transcript.md`, content);
  }
}
```

### `src/services/trigger-scanner.ts`

```ts
// BEFORE: scan(issues: JiraIssue[], profiles: ...)
// AFTER:  scan(workItems: WorkItem[], profiles: ...)

export interface ITriggerScanner {
  scan(workItems: WorkItem[], profiles: readonly IAgentProfile[]): Promise<number>;
  clearCache(): void;
}
```

---

## Config Changes

### `config.json` — before and after

```jsonc
// ─── BEFORE ───────────────────────────
{
  "jira": {
    "baseUrl": "https://api.atlassian.com/ex/jira",
    "cloudId": "abc123",
    "pollIntervalMs": 60000
  },
  "output": { ... }
}

// ─── AFTER ────────────────────────────
{
  "dataSources": {
    "jira": {
      "type": "jira",
      "baseUrl": "https://api.atlassian.com/ex/jira",
      "cloudId": "abc123",
      "pollIntervalMs": 60000
    }
    // Future: "github": { "type": "github", "owner": "kontent-ai", ... }
  },
  "output": { ... }
}
```

### `profile.json` — before and after

```jsonc
// ─── BEFORE (implicit — always JIRA) ──
{
  "repoPath": "/repos/docs",
  "match": { "projects": ["DF"], "statuses": ["New"], "commentTrigger": "@RalphDf" }
}

// ─── AFTER (explicit data source) ─────
{
  "repoPath": "/repos/docs",
  "dataSource": "jira",
  "match": { "projects": ["DF"], "statuses": ["New"], "commentTrigger": "@RalphDf" }
}
```

### `src/config/types.ts`

```ts
// BEFORE
export interface IAppConfig {
  readonly jira: IJiraConfig;
  readonly profiles: readonly IAgentProfile[];
  ...
}

// AFTER
export interface IDataSourceConfig {
  readonly type: string;                         // "jira", "github", etc.
  readonly pollIntervalMs: number;
  readonly [key: string]: unknown;               // source-specific fields
}

export interface IJiraDataSourceConfig extends IDataSourceConfig {
  readonly type: "jira";
  readonly baseUrl: string;
  readonly cloudId: string;
}

export interface IAppConfig {
  readonly dataSources: ReadonlyMap<string, IDataSourceConfig>;   // keyed by source name
  readonly profiles: readonly IAgentProfile[];
  ...
}

export interface IAgentProfile {
  readonly dataSource: string;                   // key into dataSources map
  ...                                            // everything else unchanged
}
```

---

## DI Container (final state)

### `src/awlix-cradle-types.ts`

```ts
export interface OrchestratorCradle {
  // ── Config slices ───────────────────────────────
  dataSources: ReadonlyMap<string, IDataSourceConfig>;    // replaces jiraConfig
  outputConfig: IOutputConfig;
  dashboardConfig: IDashboardConfig;
  secrets: ISecretsConfig;
  profiles: readonly IAgentProfile[];
  // ... other config slices unchanged

  // ── Data source layer ───────────────────────────
  connectors: ReadonlyMap<string, IDataSourceConnector>;  // "jira" → JiraConnector
  pollers: readonly IWorkItemPoller[];                    // one per data source

  // Sub-interface aliases (same instance as the connector, narrowed type)
  workItemSource: IWorkItemSource;
  workItemComments: IWorkItemComments;
  workItemTransitions: IWorkItemTransitions;
  workItemAttachments: IWorkItemAttachments;

  // ── Services (now generic) ──────────────────────
  issueManager: IIssueManager;          // was JiraIssueManager
  resources: IResourceManager;          // was TaskJiraResourceManager
  triggerScanner: ITriggerScanner;       // scan(WorkItem[], ...) not scan(JiraIssue[], ...)

  // ── Everything else unchanged ───────────────────
  ledger: IOperationLedger;
  router: IProfileRouter;
  taskRunner: ITaskRunner;
  resultWriter: ITaskResultWriter;
  // ...
}
```

### `src/awilix-cradle.ts` — registration

```ts
import { JiraConnector } from "./datasource/connectors/jira/jira-connector.js";
import { JiraWorkItemPoller } from "./datasource/connectors/jira/jira-poller.js";
import { IssueManager } from "./services/issue-manager.js";
import { ResourceManager } from "./services/resource-manager.js";

export function createCradle(config: IAppConfig) {
  const container = createContainer({ injectionMode: InjectionMode.PROXY, strict: true });

  container.register({
    // ── JIRA plumbing (internal — not consumed directly by services) ────
    jiraClient: asClass(JiraClient).singleton(),

    // ── Connector (one per data source) ─────────────────────────────────
    jiraConnector: asFunction(({ jiraClient }) =>
      new JiraConnector(jiraClient, "jira")
    ).singleton(),

    connectors: asFunction(({ jiraConnector }) =>
      new Map([["jira", jiraConnector]])
    ).singleton(),

    // ── Sub-interface aliases ────────────────────────────────────────────
    // Same instance, narrower type. Consumers ask for the slice they need.
    workItemSource:      asFunction(({ jiraConnector }) => jiraConnector).singleton(),
    workItemComments:    asFunction(({ jiraConnector }) => jiraConnector).singleton(),
    workItemTransitions: asFunction(({ jiraConnector }) => jiraConnector).singleton(),
    workItemAttachments: asFunction(({ jiraConnector }) => jiraConnector).singleton(),

    // ── Pollers ─────────────────────────────────────────────────────────
    pollers: asFunction(({ jiraConnector, profiles, dataSources }) => {
      const jiraConfig = dataSources.get("jira")!;
      const jiraProfiles = profiles.filter(p => p.dataSource === "jira");
      const queries = jiraConnector.buildQueries(jiraProfiles);
      return [new JiraWorkItemPoller(jiraConnector, queries, jiraConfig.pollIntervalMs)];
    }).singleton(),

    // ── Services (generic — no JIRA imports) ────────────────────────────
    issueManager: asClass(IssueManager).singleton(),     // depends on workItemSource + workItemComments + workItemTransitions
    resources:    asClass(ResourceManager).singleton(),   // depends on workItemComments + workItemAttachments
    triggerScanner: asClass(TriggerScanner).singleton(),  // depends on issueManager (unchanged DI name)
    // ...
  });
}
```

---

## Prompt & Template Changes

### `src/prompt/prompt.ts`

```ts
// BEFORE
import type { JiraIssue } from "../jira/types.js";
export function buildPromptWithSections(workItem: JiraIssue, context?: IssueContext): PromptWithSections {
  const extractor = new JiraFieldExtractor(workItem);
  // ... uses extractor.summary, extractor.description (ADF extraction here)

// AFTER
import type { WorkItem } from "../datasource/types.js";
export function buildPromptWithSections(workItem: WorkItem, context?: IssueContext): PromptWithSections {
  // No extractor needed — WorkItem already has plain-text fields
  const { title, description, status, type, priority, labels, components } = workItem;
  // ... uses them directly
```

### `src/container/setup/agent-includes.ts` — TemplateContext

```ts
// BEFORE
export interface TemplateContext {
  issueKey: string;
  issueSummary: string;
  issueStatus: string;
  issueType: string;
  issuePriority: string;
  issueLabels: string[];
  issueComponents: string[];
  issueProject: string;
  issueDescription: string;
  issueCreated: string;
  issueUpdated: string;
  // ...
}

// AFTER
export interface TemplateContext {
  workItemId: string;           // was issueKey
  workItemTitle: string;        // was issueSummary
  workItemStatus: string;       // was issueStatus
  workItemType: string;         // was issueType
  workItemPriority: string;     // was issuePriority
  workItemLabels: string[];     // was issueLabels
  workItemComponents: string[]; // was issueComponents
  workItemProject: string;      // was issueProject
  workItemDescription: string;  // was issueDescription
  workItemCreated: string;      // was issueCreated
  workItemUpdated: string;      // was issueUpdated
  workItemSource: string;       // NEW — "jira", "github", etc.
  // ...
}
```

### Agent templates (`*.agent.md`)

```liquid
{%- comment -%} BEFORE {%- endcomment -%}
You are working on JIRA issue {{ issueKey }}: {{ issueSummary }}
Status: {{ issueStatus }}

{%- comment -%} AFTER {%- endcomment -%}
You are working on {{ workItemSource }} item {{ workItemId }}: {{ workItemTitle }}
Status: {{ workItemStatus }}
```

### `src/container/setup/jit-mcp-params.ts` — macros

```ts
// BEFORE
const MACROS: Record<string, (workItem: JiraIssue) => string> = {
  "$jira.key":     (i) => i.key,
  "$jira.project": (i) => i.key.split("-")[0],
  "$jira.branch":  (i) => slugifyBranchName(i.key, i.fields.summary ?? ""),
  "$jira.summary": (i) => i.fields.summary ?? "",
};

// AFTER
const MACROS: Record<string, (workItem: WorkItem) => string> = {
  "$task.id":      (w) => w.id,
  "$task.project": (w) => w.project,
  "$task.branch":  (w) => slugifyBranchName(w.id, w.title),
  "$task.title":   (w) => w.title,
  "$task.source":  (w) => w.source,
};
```

### `profile.json` macro usage

```jsonc
// BEFORE
{ "mcpServers": [{ "name": "ado", "env": { "BRANCH": "$jira.branch", "ISSUE_KEY": "$jira.key" } }] }

// AFTER
{ "mcpServers": [{ "name": "ado", "env": { "BRANCH": "$task.branch", "ISSUE_KEY": "$task.id" } }] }
```

---

## Orchestrator Main Loop

```ts
// BEFORE — src/orchestrator.ts
class Orchestrator {
  private poller: IJiraPoller;                    // single poller
  // ...

  start() {
    this.poller.onIssues(() => this.signal());    // one callback
    this.poller.start();
  }

  private async processQueue() {
    const issues = this.poller.drain();           // JiraIssue[]
    await this.triggerScanner.scan(issues, this.profiles);
  }
}

// AFTER — src/orchestrator.ts
class Orchestrator {
  private pollers: readonly IWorkItemPoller[];    // one per data source

  start() {
    for (const poller of this.pollers) {
      poller.onItems(() => this.signal());        // all feed the same signal
      poller.start();
    }
  }

  private async processQueue() {
    const workItems = this.pollers.flatMap(p => p.drain());  // WorkItem[] from all sources
    await this.triggerScanner.scan(workItems, this.profiles);
  }
}
```

---

## What a second data source looks like (future)

Adding GitHub Issues as a source requires:

1. **One new directory**: `src/datasource/connectors/github/`
   - `github-connector.ts` — `implements IDataSourceConnector`
   - `github-mapper.ts` — GitHub Issue → WorkItem
   - `github-poller.ts` — `implements IWorkItemPoller`

2. **Config addition**:
   ```jsonc
   { "dataSources": { "jira": { ... }, "github": { "type": "github", "owner": "kontent-ai", "pollIntervalMs": 30000 } } }
   ```

3. **DI additions** (3 lines):
   ```ts
   githubConnector: asFunction(({ secrets }) => new GitHubConnector(secrets.ghToken, "github")).singleton(),
   // Add to connectors map
   // Add to pollers array
   ```

4. **Profile reference**:
   ```jsonc
   { "dataSource": "github", "match": { "projects": ["kontent-ai/docs"], ... } }
   ```

**Zero changes to services, prompt, templates, or orchestrator.** They only see `WorkItem`.

---

## Dependency Graph (final state)

```
config.json (dataSources map)
    │
    ├── JiraClient (raw HTTP — internal)
    │       │
    │       └── JiraConnector (implements IDataSourceConnector)
    │               │
    │               ├── [as IWorkItemSource]      → JiraWorkItemPoller, IssueManager, ProfileRouter
    │               ├── [as IWorkItemComments]     → IssueManager, ResourceManager, TriggerScanner (via IssueManager)
    │               ├── [as IWorkItemTransitions]  → IssueManager
    │               └── [as IWorkItemAttachments]  → ResourceManager
    │
    ├── Orchestrator
    │       ├── pollers: IWorkItemPoller[]     ← drains WorkItem[] from all sources
    │       ├── triggerScanner                 ← scan(WorkItem[], profiles)
    │       └── issueManager                  ← refreshWorkItem, transition, comments
    │
    └── TaskRunner
            ├── issueManager                  ← postStartComment, transitionWorkItem
            ├── resources                     ← fetchComments, fetchHandoff, attachTranscript
            ├── promptBuilder                 ← buildPrompt(WorkItem, ...)
            └── templateRenderer              ← TemplateContext with workItem* fields
```
