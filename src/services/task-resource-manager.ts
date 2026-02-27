import type { Logger } from "../logger.js";
import { supportsAttachments, type IDataSourceConnector, type ISupportsAttachments } from "../datasource/connector.js";
import { withRetry, type RetryOptions } from "../retry.js";
import { toErrorMessage } from "../util/error.js";

/** Public contract for work item resource interactions (comments, attachments, transcripts). */
export interface IResourceManager {
  fetchComments(source: string, workItemId: string): Promise<string[]>;
  fetchHandoff(source: string, workItemId: string): Promise<string | null>;
  attachTranscript(source: string, workItemId: string, localPath: string, variantName: string): Promise<void>;
}

/**
 * Manages work item resource interactions for a task — fetching comments,
 * downloading attachments, and uploading artifacts.
 */
export class TaskResourceManager implements IResourceManager {
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

  private resolveAttachments(source: string): ISupportsAttachments | null {
    const connector = this.resolveConnector(source);
    return supportsAttachments(connector) ? connector : null;
  }

  async fetchComments(source: string, workItemId: string): Promise<string[]> {
    const connector = this.resolveConnector(source);
    const comments = await connector.getComments(workItemId).catch((err) => {
      this.logger.warn(
        `Failed to fetch comments for ${workItemId}: ${toErrorMessage(err)}`
      );
      return [];
    });

    return comments.map((c) =>
      `[${c.created}] ${c.authorName}:\n${c.body.trim()}`
    );
  }

  async fetchHandoff(source: string, workItemId: string): Promise<string | null> {
    const attachments = this.resolveAttachments(source);
    if (!attachments) return null;

    const attachmentList = await attachments.getAttachments(workItemId).catch((err) => {
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
      return await attachments.downloadAttachment(
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

  async attachTranscript(source: string, workItemId: string, localPath: string, variantName: string): Promise<void> {
    const attachments = this.resolveAttachments(source);
    if (!attachments) return;

    try {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(localPath, "utf-8");
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const filename = `session-transcript-${variantName}-${dd}-${mm}-${yyyy}.md`;
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
