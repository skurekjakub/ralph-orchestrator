import type { Logger } from "../logger.js";
import type { IDataSourceConnector, ISupportsTransitions } from "../datasource/connector.js";
import { supportsTransitions } from "../datasource/connector.js";
import type { WorkItem, WorkItemComment } from "../datasource/types.js";
import type { RetryOptions } from "../retry.js";
import { withRetry } from "../retry.js";
import { TransitionPhase } from "../orchestrator-types.js";
import { OrchestratorComments } from "./orchestrator-comments.js";
import { toErrorMessage } from "../util/error.js";

/** Public contract for work item lifecycle operations. */
export interface IIssueManager {
  refreshWorkItem(workItemId: string): Promise<WorkItem | null>;
  getComments(workItemId: string): Promise<WorkItemComment[]>;
  transitionWorkItem(workItemId: string, targetStatus: string | undefined, phase: TransitionPhase): Promise<void>;
  postStartComment(workItemId: string, displayName: string, profileId: string): Promise<void>;
  postErrorComment(workItemId: string, error: string): Promise<void>;
  postCrashRecoveryComment(workItemId: string, variant: string): Promise<void>;
  postStaleStatusComment(workItemId: string, displayName: string, currentStatus: string): Promise<void>;
  postAckComment(workItemId: string, displayName: string, triggerParams?: string[]): Promise<void>;
  postComment(workItemId: string, body: string): Promise<void>;
}

/**
 * Manages work item lifecycle operations — transitions, orchestrator comments,
 * and item lookups. Delegates to an {@link IDataSourceConnector} so the rest of
 * the orchestrator never calls the data source directly.
 */
export class IssueManager implements IIssueManager {
  private readonly connector: IDataSourceConnector;
  private readonly transitions: ISupportsTransitions | null;
  private readonly logger: Logger;
  /** Retry options — settable for test injection (not part of the DI cradle). */
  retryOptions?: RetryOptions;

  constructor({ connector, logger }: {
    connector: IDataSourceConnector;
    logger: Logger;
  }) {
    this.connector = connector;
    this.transitions = supportsTransitions(connector) ? connector : null;
    this.logger = logger;
  }

  /**
   * Re-fetch a single work item by ID.
   * @returns The work item, or `null` if not found or the request fails.
   */
  async refreshWorkItem(workItemId: string): Promise<WorkItem | null> {
    try {
      return await this.connector.refreshWorkItem(workItemId);
    } catch (err) {
      this.logger.warn(
        `Failed to refresh ${workItemId}: ${toErrorMessage(err)}`,
      );
      return null;
    }
  }

  /** Fetch all comments on a work item. */
  async getComments(workItemId: string): Promise<WorkItemComment[]> {
    return this.connector.getComments(workItemId);
  }

  /**
   * Transition a work item to a target status.
   *
   * If the connector does not support transitions, logs a warning and returns.
   * Otherwise delegates to the connector with retry, and posts a failure
   * comment if all retries are exhausted.
   *
   * @param workItemId    Work item identifier (e.g. "DF-100").
   * @param targetStatus  Target status name (e.g. "In Progress"). Skipped if undefined.
   * @param phase         Identifies whether this is a pre- or post-agent transition.
   */
  async transitionWorkItem(workItemId: string, targetStatus: string | undefined, phase: TransitionPhase): Promise<void> {
    if (!targetStatus) return;

    if (!this.transitions) {
      this.logger.warn(
        `Connector "${this.connector.name}" does not support transitions — skipping ${phase} for ${workItemId}`
      );
      return;
    }

    this.logger.info(`Resolving ${phase} transition for ${workItemId} → "${targetStatus}"...`);
    const transitions = this.transitions;
    try {
      await withRetry(
        () => transitions.transitionWorkItem(workItemId, targetStatus),
        `transition ${workItemId} (${phase})`,
        this.logger,
        this.retryOptions,
      );
      this.logger.info(`${workItemId} transitioned (${phase} → "${targetStatus}")`);
    } catch (err) {
      const message = toErrorMessage(err);
      this.logger.warn(
        `Failed to transition ${workItemId} (${phase}): ${message}`
      );
      this.connector.addComment(
        workItemId,
        OrchestratorComments.transitionFailed(phase, targetStatus, message),
      ).catch(() => {});
    }
  }

  /** Post a start comment. */
  async postStartComment(workItemId: string, displayName: string, profileId: string): Promise<void> {
    this.logger.info(`Posting start comment on ${workItemId}...`);
    const startMessage = OrchestratorComments.start(displayName, profileId);
    try {
      await withRetry(
        () => this.connector.addComment(workItemId, startMessage),
        `comment on ${workItemId}`,
        this.logger,
        this.retryOptions,
      );
      this.logger.info(`Start comment posted on ${workItemId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to comment on ${workItemId} after retries: ${toErrorMessage(err)}`
      );
    }
  }

  /** Post an error comment when a task fails. */
  async postErrorComment(workItemId: string, error: string): Promise<void> {
    const message = OrchestratorComments.error(error);
    try {
      await withRetry(
        () => this.connector.addComment(workItemId, message),
        `error comment on ${workItemId}`,
        this.logger,
        this.retryOptions,
      );
      this.logger.info(`Error comment posted on ${workItemId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to post error comment on ${workItemId}: ${toErrorMessage(err)}`
      );
    }
  }

  /** Post a crash-recovery comment for an operation found active on startup. */
  async postCrashRecoveryComment(workItemId: string, variant: string): Promise<void> {
    const displayName = variant.split(":")[1];
    await this.connector
      .addComment(workItemId, OrchestratorComments.crashRecovery(displayName))
      .catch((err) => {
        this.logger.warn(
          `Failed to post crash-recovery comment on ${workItemId}: ${toErrorMessage(err)}`,
        );
      });
  }

  /** Post a stale-status comment when an item no longer matches the profile. */
  async postStaleStatusComment(workItemId: string, displayName: string, currentStatus: string): Promise<void> {
    await this.connector
      .addComment(workItemId, OrchestratorComments.staleStatus(displayName, currentStatus))
      .catch((err) => {
        this.logger.warn(
          `Failed to post stale-status comment on ${workItemId}: ${toErrorMessage(err)}`,
        );
      });
  }

  /** Post an ack comment when a trigger comment is discovered. */
  async postAckComment(workItemId: string, displayName: string, triggerParams?: string[]): Promise<void> {
    await this.connector
      .addComment(workItemId, OrchestratorComments.ack(displayName, triggerParams))
      .catch((err) => {
        this.logger.warn(
          `Failed to post ack comment on ${workItemId}: ${toErrorMessage(err)}`,
        );
      });
  }

  /** Post an arbitrary comment (used for preflight failures with custom text). */
  async postComment(workItemId: string, body: string): Promise<void> {
    await this.connector
      .addComment(workItemId, body)
      .catch((err) => {
        this.logger.warn(
          `Failed to post comment on ${workItemId}: ${toErrorMessage(err)}`,
        );
      });
  }
}
