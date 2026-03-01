/**
 * Generic work item types used across all data source connectors.
 *
 * These types represent the orchestrator's view of an external issue/ticket/work item.
 * Source-specific connectors map from their native formats (JIRA, GitHub, etc.)
 * into these generic types. The orchestrator never sees source-specific data shapes
 * outside the connector implementation.
 */

/** A normalized work item from any data source (JIRA issue, GitHub issue, ADO work item, etc.). */
export interface WorkItem {
  /** Unique identifier in the source system (e.g. `DF-2759` for JIRA, `#42` for GitHub). */
  readonly id: string;
  /** Key of the data source this item came from (matches a key in `dataSources` config). */
  readonly source: string;
  /** Project or repository identifier (e.g. `DF` for JIRA, `kontent-ai/docs` for GitHub). */
  readonly project: string;
  /** Title / summary. */
  readonly title: string;
  /** Plain-text or Markdown description. Connectors handle format conversion (e.g. ADF → text). */
  readonly description: string;
  /** Current workflow status (e.g. `To Do`, `In Progress`). */
  readonly status: string;
  /** Item type (e.g. `Task`, `Bug`, `Story`). */
  readonly type: string;
  /** Priority name (e.g. `High`, `Medium`), or empty string if unavailable. */
  readonly priority: string;
  /** Labels / tags attached to the item. */
  readonly labels: readonly string[];
  /** Component or area path names. */
  readonly components: readonly string[];
  /** ISO-8601 creation timestamp. */
  readonly created: string;
  /** ISO-8601 last-updated timestamp, or empty string if unavailable. */
  readonly updated: string;
  /** Named custom fields extracted by the connector (`label → value`). */
  readonly customFields: ReadonlyMap<string, string>;
  /**
   * Opaque source-specific data preserved for connector-internal use.
   * The orchestrator must not access this directly — it exists so the connector
   * can round-trip source data without re-fetching.
   */
  readonly sourceData: unknown;
}

/** A comment on a work item, normalized to plain text. */
export interface WorkItemComment {
  /** Comment ID in the source system. */
  readonly id: string;
  /** Display name of the comment author. */
  readonly authorName: string;
  /** Stable author identifier (e.g. Atlassian account ID). */
  readonly authorId: string;
  /** Plain-text comment body. Connectors handle format conversion (e.g. ADF → text). */
  readonly body: string;
  /** ISO-8601 creation timestamp. */
  readonly created: string;
}

/** An attachment on a work item. */
export interface WorkItemAttachment {
  /** Attachment ID in the source system. */
  readonly id: string;
  /** Original filename. */
  readonly filename: string;
  /** ISO-8601 creation timestamp. */
  readonly created: string;
}

/** A workflow transition available for a work item in its current status. */
export interface WorkItemTransition {
  /** Transition ID in the source system. */
  readonly id: string;
  /** Transition display name (e.g. `Start Progress`, `Done`). */
  readonly name: string;
  /** Target status after transition completes. */
  readonly targetStatus: string;
}
