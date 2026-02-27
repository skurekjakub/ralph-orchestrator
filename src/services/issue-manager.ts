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
  refreshWorkItem(source: string, workItemId: string): Promise<WorkItem | null>;
  getComments(source: string, workItemId: string): Promise<WorkItemComment[]>;
  transitionWorkItem(source: string, workItemId: string, targetStatus: string | undefined, phase: TransitionPhase): Promise<void>;
  postStartComment(source: string, workItemId: string, displayName: string, profileId: string): Promise<void>;
  postErrorComment(source: string, workItemId: string, error: string): Promise<void>;
  postCrashRecoveryComment(source: string, workItemId: string, variant: string): Promise<void>;
  postStaleStatusComment(source: string, workItemId: string, displayName: string, currentStatus: string): Promise<void>;
  postAckComment(source: string, workItemId: string, displayName: string, triggerParams?: string[]): Promise<void>;
  postComment(source: string, workItemId: string, body: string): Promise<void>;
}

/**
 * Manages work item lifecycle operations — transitions, orchestrator comments,
 * and item lookups. Delegates to the appropriate {@link IDataSourceConnector}
 * based on the source key.
 */
export class IssueManager implements IIssueManager {
  private readonly connectors: ReadonlyMap<string, IDataSourceConnector>;
  private readonly logger: Logger;
  /** Retry options — settable for test injection (not part of the DI cradle). */
  retryOptions?: RetryOptions;

  constructor({ connectors, logger }: {
    connectors: ReadonlyMap<string, IDataSourceConnector>;
    logger: Logger;
  }) {
    this.connectors = connectors;
    this.logger = logger;
  }

  private resolveConnector(source: string): IDataSourceConnector {
    const connector = this.connectors.get(source);
    if (!connector) {
      throw new Error(`No connector registered for data source "${source}"`);
    }
    return connector;
  }

  private resolveTransitions(source: string): ISupportsTransitions | null {
    const connector = this.resolveConnector(source);
    return supportsTransitions(connector) ? connector : null;
  }

  async refreshWorkItem(source: string, workItemId: string): Promise<WorkItem | null> {
    try {
      return await this.resolveConnector(source).refreshWorkItem(workItemId);
    } catch (err) {
      this.logger.warn(
        `Failed to refresh ${workItemId}: ${toErrorMessage(err)}`,
      );
      return null;
    }
  }

  async getComments(source: string, workItemId: string): Promise<WorkItemComment[]> {
    return this.resolveConnector(source).getComments(workItemId);
  }

  async transitionWorkItem(source: string, workItemId: string, targetStatus: string | undefined, phase: TransitionPhase): Promise<void> {
    if (!targetStatus) return;

    const connector = this.resolveConnector(source);
    const transitions = this.resolveTransitions(source);

    if (!transitions) {
      this.logger.warn(
        `Connector "${connector.name}" does not support transitions — skipping ${phase} for ${workItemId}`
      );
      return;
    }

    this.logger.info(`Resolving ${phase} transition for ${workItemId} → "${targetStatus}"...`);
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
      connector.addComment(
        workItemId,
        OrchestratorComments.transitionFailed(phase, targetStatus, message),
      ).catch(() => {});
    }
  }

  async postStartComment(source: string, workItemId: string, displayName: string, profileId: string): Promise<void> {
    this.logger.info(`Posting start comment on ${workItemId}...`);
    const startMessage = OrchestratorComments.start(displayName, profileId);
    const connector = this.resolveConnector(source);
    try {
      await withRetry(
        () => connector.addComment(workItemId, startMessage),
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

  async postErrorComment(source: string, workItemId: string, error: string): Promise<void> {
    const message = OrchestratorComments.error(error);
    const connector = this.resolveConnector(source);
    try {
      await withRetry(
        () => connector.addComment(workItemId, message),
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

  async postCrashRecoveryComment(source: string, workItemId: string, variant: string): Promise<void> {
    const displayName = variant.split(":")[1];
    await this.resolveConnector(source)
      .addComment(workItemId, OrchestratorComments.crashRecovery(displayName))
      .catch((err) => {
        this.logger.warn(
          `Failed to post crash-recovery comment on ${workItemId}: ${toErrorMessage(err)}`,
        );
      });
  }

  async postStaleStatusComment(source: string, workItemId: string, displayName: string, currentStatus: string): Promise<void> {
    await this.resolveConnector(source)
      .addComment(workItemId, OrchestratorComments.staleStatus(displayName, currentStatus))
      .catch((err) => {
        this.logger.warn(
          `Failed to post stale-status comment on ${workItemId}: ${toErrorMessage(err)}`,
        );
      });
  }

  async postAckComment(source: string, workItemId: string, displayName: string, triggerParams?: string[]): Promise<void> {
    await this.resolveConnector(source)
      .addComment(workItemId, OrchestratorComments.ack(displayName, triggerParams))
      .catch((err) => {
        this.logger.warn(
          `Failed to post ack comment on ${workItemId}: ${toErrorMessage(err)}`,
        );
      });
  }

  async postComment(source: string, workItemId: string, body: string): Promise<void> {
    await this.resolveConnector(source)
      .addComment(workItemId, body)
      .catch((err) => {
        this.logger.warn(
          `Failed to post comment on ${workItemId}: ${toErrorMessage(err)}`,
        );
      });
  }
}
