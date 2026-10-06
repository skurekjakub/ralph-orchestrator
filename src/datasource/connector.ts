/**
 * Data source connector interfaces with optional capabilities.
 *
 * Every connector must implement the base {@link IDataSourceConnector} interface
 * (discovery + comments). Richer sources opt into additional capability
 * interfaces ({@link ISupportsTransitions}, {@link ISupportsAttachments}).
 *
 * Core services depend on the narrow sub-interfaces they need. At runtime,
 * type guards ({@link supportsTransitions}, {@link supportsAttachments}) check
 * whether a connector supports optional operations before calling them.
 */

import type { WorkItem, WorkItemAttachment, WorkItemComment, WorkItemTransition } from "./types.js";

/**
 * A query string or object understood by the source system.
 * For JIRA this is a JQL string; other sources may use structured filters.
 */
export type SourceQuery = string;

/** Shared identity fields present on every connector interface. */
export interface IDataSourceIdentity {
  /** Human-readable name (e.g. `"JIRA"`, `"GitHub Issues"`). */
  readonly name: string;

  /**
   * Key identifying this source in the `dataSources` config map.
   * Must match the key used in `config.json`.
   */
  readonly sourceKey: string;

  /**
   * User IDs allowed to trigger agent invocations for this source.
   * Empty array means unrestricted (all users allowed).
   */
  getAllowedUsers(): readonly string[];
}

// ── Discovery (mandatory) ─────────────────────────────────────────────────────

/** Work item discovery and lookup — consumed by the poller and profile router. */
export interface IWorkItemSource extends IDataSourceIdentity {
  /**
   * Build source-native queries from the loaded agent profiles.
   * The returned queries are passed to {@link searchWorkItems} during polling.
   */
  buildQueries(profiles: readonly { match: { projects: string[]; statuses?: string[] } }[]): SourceQuery[];

  /**
   * Execute a source-native query and return matching work items.
   * Results are deduplicated by the caller (poller/ledger).
   */
  searchWorkItems(query: SourceQuery, pageSize?: number): Promise<WorkItem[]>;

  /**
   * Re-fetch a single work item by ID.
   * Used to get the latest status before transitions and after delays.
   */
  refreshWorkItem(workItemId: string): Promise<WorkItem>;

  /**
   * Check whether `id` looks like a valid identifier for this source.
   * Used for routing when multiple connectors are active.
   */
  isValidItemId(id: string): boolean;
}

// ── Comments (mandatory) ──────────────────────────────────────────────────────

/** Comment read/write — consumed by trigger scanner, issue manager, resource manager. */
export interface IWorkItemComments extends IDataSourceIdentity {
  /** Retrieve all comments on a work item, oldest first. */
  getComments(workItemId: string): Promise<WorkItemComment[]>;

  /** Post a plain-text comment on a work item. */
  addComment(workItemId: string, bodyText: string): Promise<void>;
}

// ── Transitions (optional capability) ─────────────────────────────────────────

/**
 * Workflow transitions — optional capability for sources with status workflows.
 *
 * Connectors that support transitions implement this interface alongside
 * {@link IDataSourceConnector}. Use {@link supportsTransitions} to check.
 */
export interface ISupportsTransitions {
  /** List available workflow transitions for the work item's current status. */
  getTransitions(workItemId: string): Promise<WorkItemTransition[]>;

  /**
   * Transition a work item to the target status.
   * The connector resolves the transition ID internally.
   * @throws Error if no matching transition exists for the target status.
   */
  transitionWorkItem(workItemId: string, targetStatus: string): Promise<void>;
}

// ── Attachments (optional capability) ─────────────────────────────────────────

/**
 * Attachment operations — optional capability for sources that support file attachments.
 *
 * Connectors that support attachments implement this interface alongside
 * {@link IDataSourceConnector}. Use {@link supportsAttachments} to check.
 */
export interface ISupportsAttachments {
  /** List attachments on a work item. */
  getAttachments(workItemId: string): Promise<WorkItemAttachment[]>;

  /**
   * Download an attachment's content as a UTF-8 string.
   * @param workItemId  The work item the attachment belongs to.
   * @param attachmentId  The attachment ID (from {@link WorkItemAttachment.id}).
   */
  downloadAttachment(workItemId: string, attachmentId: string): Promise<string>;

  /** Upload a file attachment to a work item. */
  addAttachment(workItemId: string, filename: string, content: string | Buffer): Promise<void>;
}

// ── Base connector ────────────────────────────────────────────────────────────

/**
 * Base data source connector — every implementation must provide discovery + comments.
 *
 * Optional capabilities ({@link ISupportsTransitions}, {@link ISupportsAttachments})
 * are implemented as additional interfaces. Use the type guards to check support.
 *
 * Example:
 * ```ts
 * class JiraConnector implements IDataSourceConnector, ISupportsTransitions, ISupportsAttachments { ... }
 * class GitHubConnector implements IDataSourceConnector { ... }
 * ```
 */
export interface IDataSourceConnector extends IWorkItemSource, IWorkItemComments {}

// ── Convenience type: full-capability connector ───────────────────────────────

// ── Type guards ───────────────────────────────────────────────────────────────

// Define required keys as a runtime tuple
const TRANSITION_METHODS = ["getTransitions", "transitionWorkItem"] as const;

export function supportsTransitions(
  connector: IDataSourceConnector,
): connector is IDataSourceConnector & ISupportsTransitions {
  return TRANSITION_METHODS.every((method) => method in connector);
}

// Define required keys as a runtime tuple
const ATTACHMENT_METHODS = ["getAttachments", "downloadAttachment", "addAttachment"] as const;

/** Check whether a connector supports file attachments. */
export function supportsAttachments(
  connector: IDataSourceConnector,
): connector is IDataSourceConnector & ISupportsAttachments {
  return ATTACHMENT_METHODS.every((method) => method in connector);
}

export function assertSupportsAttachments(
  connector: IDataSourceConnector,
): asserts connector is IDataSourceConnector & ISupportsAttachments {
  const missing = ATTACHMENT_METHODS.filter((m) => !(m in connector));
  if (missing.length > 0) {
    throw new Error(`Connector "${connector.name}" is missing attachment methods: ${missing.join(", ")}`);
  }
}
