import type { Logger } from "../logger.js";
import type { IJiraClient } from "../jira/client.js";
import type { JiraIssue, JiraComment } from "../jira/types.js";
import type { RetryOptions } from "../retry.js";
import { withRetry } from "../retry.js";
import { TransitionPhase } from "../orchestrator-types.js";
import { OrchestratorComments } from "./orchestrator-comments.js";
import { toErrorMessage } from "../util/error.js";

/** Public contract for JIRA issue lifecycle operations. */
export interface IIssueManager {
  refreshIssue(issueKey: string): Promise<JiraIssue | null>;
  getComments(issueKey: string): Promise<JiraComment[]>;
  transitionIssue(issueKey: string, targetStatus: string | undefined, phase: TransitionPhase): Promise<void>;
  postStartComment(issueKey: string, displayName: string, profileId: string): Promise<void>;
  postErrorComment(issueKey: string, error: string): Promise<void>;
  postCrashRecoveryComment(issueKey: string, variant: string): Promise<void>;
  postStaleStatusComment(issueKey: string, displayName: string, currentStatus: string): Promise<void>;
  postAckComment(issueKey: string, displayName: string, triggerParams?: string[]): Promise<void>;
  postComment(issueKey: string, body: string): Promise<void>;
}

/**
 * Manages JIRA issue lifecycle operations — transitions, orchestrator comments,
 * and issue lookups. Wraps {@link JiraClient} so the rest of the orchestrator
 * never calls the JIRA REST client directly.
 */
export class JiraIssueManager implements IIssueManager {
  constructor(
    private readonly jiraClient: IJiraClient,
    private readonly logger: Logger,
    private readonly retryOptions?: RetryOptions,
  ) {}

  /**
   * Re-fetch a single issue from JIRA by key.
   * @returns The issue, or `null` if not found or the request fails.
   */
  async refreshIssue(issueKey: string): Promise<JiraIssue | null> {
    try {
      const results = await this.jiraClient.searchIssues(
        `key = ${issueKey}`,
        1,
      );
      return results[0] ?? null;
    } catch (err) {
      this.logger.warn(
        `Failed to refresh ${issueKey}: ${toErrorMessage(err)}`,
      );
      return null;
    }
  }

  /** Fetch all comments on an issue. */
  async getComments(issueKey: string): Promise<JiraComment[]> {
    return this.jiraClient.getComments(issueKey);
  }

  /**
   * Transition a JIRA issue to a target status.
   *
   * Resolves the transition ID dynamically, executes the transition with retry,
   * and posts a failure comment if all retries are exhausted.
   *
   * @param issueKey      JIRA issue key (e.g. "DF-100").
   * @param targetStatus  Target status name (e.g. "In Progress"). Skipped if undefined.
   * @param phase         Identifies whether this is a pre- or post-agent transition.
   */
  async transitionIssue(issueKey: string, targetStatus: string | undefined, phase: TransitionPhase): Promise<void> {
    if (!targetStatus) return;

    this.logger.info(`Resolving ${phase} transition for ${issueKey} → "${targetStatus}"...`);
    try {
      await withRetry(
        async () => {
          const transitionId = await this.jiraClient.findTransitionId(
            issueKey,
            targetStatus,
          );
          if (!transitionId) {
            throw new Error(
              `No transition to "${targetStatus}" available for ${issueKey}`
            );
          }
          await this.jiraClient.transitionIssue(issueKey, transitionId);
        },
        `transition ${issueKey} (${phase})`,
        this.logger,
        this.retryOptions,
      );
      this.logger.info(`${issueKey} transitioned (${phase} → "${targetStatus}")`);
    } catch (err) {
      const message = toErrorMessage(err);
      this.logger.warn(
        `Failed to transition ${issueKey} (${phase}): ${message}`
      );
      this.jiraClient.addComment(
        issueKey,
        OrchestratorComments.transitionFailed(phase, targetStatus, message),
      ).catch(() => {});
    }
  }

  /** Post a start comment to JIRA. */
  async postStartComment(issueKey: string, displayName: string, profileId: string): Promise<void> {
    this.logger.info(`Posting start comment on ${issueKey}...`);
    const startMessage = OrchestratorComments.start(displayName, profileId);
    try {
      await withRetry(
        () => this.jiraClient.addComment(issueKey, startMessage),
        `comment on ${issueKey}`,
        this.logger,
        this.retryOptions,
      );
      this.logger.info(`Start comment posted on ${issueKey}`);
    } catch (err) {
      this.logger.warn(
        `Failed to comment on ${issueKey} after retries: ${toErrorMessage(err)}`
      );
    }
  }

  /** Post an error comment to JIRA when a task fails. */
  async postErrorComment(issueKey: string, error: string): Promise<void> {
    const message = OrchestratorComments.error(error);
    try {
      await withRetry(
        () => this.jiraClient.addComment(issueKey, message),
        `error comment on ${issueKey}`,
        this.logger,
        this.retryOptions,
      );
      this.logger.info(`Error comment posted on ${issueKey}`);
    } catch (err) {
      this.logger.warn(
        `Failed to post error comment on ${issueKey}: ${toErrorMessage(err)}`
      );
    }
  }

  /** Post a crash-recovery comment for an operation found active on startup. */
  async postCrashRecoveryComment(issueKey: string, variant: string): Promise<void> {
    const displayName = variant.split(":")[1];
    await this.jiraClient
      .addComment(issueKey, OrchestratorComments.crashRecovery(displayName))
      .catch((err) => {
        this.logger.warn(
          `Failed to post crash-recovery comment on ${issueKey}: ${toErrorMessage(err)}`,
        );
      });
  }

  /** Post a stale-status comment when an issue no longer matches the profile. */
  async postStaleStatusComment(issueKey: string, displayName: string, currentStatus: string): Promise<void> {
    await this.jiraClient
      .addComment(issueKey, OrchestratorComments.staleStatus(displayName, currentStatus))
      .catch((err) => {
        this.logger.warn(
          `Failed to post stale-status comment on ${issueKey}: ${toErrorMessage(err)}`,
        );
      });
  }

  /** Post an ack comment when a trigger comment is discovered. */
  async postAckComment(issueKey: string, displayName: string, triggerParams?: string[]): Promise<void> {
    await this.jiraClient
      .addComment(issueKey, OrchestratorComments.ack(displayName, triggerParams))
      .catch((err) => {
        this.logger.warn(
          `Failed to post ack comment on ${issueKey}: ${toErrorMessage(err)}`,
        );
      });
  }

  /** Post an arbitrary comment (used for preflight failures with custom text). */
  async postComment(issueKey: string, body: string): Promise<void> {
    await this.jiraClient
      .addComment(issueKey, body)
      .catch((err) => {
        this.logger.warn(
          `Failed to post comment on ${issueKey}: ${toErrorMessage(err)}`,
        );
      });
  }
}
