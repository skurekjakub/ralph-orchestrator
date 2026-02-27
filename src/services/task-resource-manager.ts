import type { Logger } from "../logger.js";
import type { IDataSourceConnector, ISupportsAttachments } from "../datasource/connector.js";
import { supportsAttachments } from "../datasource/connector.js";
import type { RetryOptions } from "../retry.js";
import { withRetry } from "../retry.js";
import { toErrorMessage } from "../util/error.js";

/** Public contract for work item resource interactions (comments, attachments, transcripts). */
export interface IResourceManager {
  fetchComments(workItemId: string): Promise<string[]>;
  fetchHandoff(workItemId: string): Promise<string | null>;
  attachTranscript(workItemId: string, localPath: string, variantName: string): Promise<void>;
}

/**
 * Manages work item resource interactions for a task — fetching comments,
 * downloading attachments, and uploading artifacts.
 */
export class TaskResourceManager implements IResourceManager {
  private readonly connector: IDataSourceConnector;
  private readonly attachments: ISupportsAttachments | null;
  private readonly logger: Logger;
  /** Retry options — settable for test injection (not part of the DI cradle). */
  retryOptions?: RetryOptions;

  constructor({ connector, logger }: {
    connector: IDataSourceConnector;
    logger: Logger;
  }) {
    this.connector = connector;
    this.attachments = supportsAttachments(connector) ? connector : null;
    this.logger = logger;
  }

  /**
   * Fetch and format all comments for a work item.
   * Comment bodies are already plain text (the connector handles format conversion).
   */
  async fetchComments(workItemId: string): Promise<string[]> {
    const comments = await this.connector.getComments(workItemId).catch((err) => {
      this.logger.warn(
        `Failed to fetch comments for ${workItemId}: ${toErrorMessage(err)}`
      );
      return [];
    });

    return comments.map((c) =>
      `[${c.created}] ${c.authorName}:\n${c.body.trim()}`
    );
  }

  /**
   * Download the most recent `handoff.md` attachment for a revision task.
   * Returns `null` if the connector does not support attachments.
   */
  async fetchHandoff(workItemId: string): Promise<string | null> {
    if (!this.attachments) return null;

    const attachmentList = await this.attachments.getAttachments(workItemId).catch((err) => {
      this.logger.warn(
        `Failed to fetch attachments for ${workItemId}: ${toErrorMessage(err)}`
      );
      return [];
    });

    const handoffAttachments = attachmentList
      .filter((a) => a.filename === "handoff.md")
      .sort((a, b) => b.created.localeCompare(a.created));

    if (handoffAttachments.length === 0) return null;

    try {
      return await this.attachments.downloadAttachment(
        workItemId,
        handoffAttachments[0].id,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to download handoff.md: ${toErrorMessage(err)}`
      );
      return null;
    }
  }

  /**
   * Attach the session transcript to the work item with variant name and date.
   * No-op if the connector does not support attachments.
   */
  async attachTranscript(workItemId: string, localPath: string, variantName: string): Promise<void> {
    if (!this.attachments) return;

    try {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(localPath, "utf-8");
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const filename = `session-transcript-${variantName}-${dd}-${mm}-${yyyy}.md`;
      const attachments = this.attachments;
      await withRetry(
        () => attachments.addAttachment(workItemId, filename, content),
        `attach transcript to ${workItemId}`,
        this.logger,
        this.retryOptions,
      );
      this.logger.info(`Session transcript attached to ${workItemId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to attach transcript to ${workItemId}: ${toErrorMessage(err)}`
      );
    }
  }
}
