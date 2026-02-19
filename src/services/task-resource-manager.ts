import type { Logger } from "../logger.js";
import { extractAdfText } from "../jira/adf-converter.js";
import type { IJiraClient } from "../jira/client.js";
import type { RetryOptions } from "../retry.js";
import { withRetry } from "../retry.js";

/** Public contract for JIRA resource interactions (comments, attachments, transcripts). */
export interface IResourceManager {
  fetchComments(issueKey: string): Promise<string[]>;
  fetchHandoff(issueKey: string): Promise<string | null>;
  attachTranscript(issueKey: string, localPath: string, variantName: string): Promise<void>;
}

/**
 * Manages JIRA resource interactions for a task — fetching comments,
 * downloading attachments, and uploading artifacts.
 */
export class TaskJiraResourceManager implements IResourceManager {
  constructor(
    private readonly jiraClient: IJiraClient,
    private readonly logger: Logger,
    private readonly retryOptions?: RetryOptions,
  ) {}

  /**
   * Fetch and format all JIRA comments for an issue.
   *
   * Comment bodies are extracted from ADF to plain text.
   */
  async fetchComments(issueKey: string): Promise<string[]> {
    const comments = await this.jiraClient.getComments(issueKey).catch((err) => {
      this.logger.warn(
        `Failed to fetch comments for ${issueKey}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    });

    return comments.map((c) => {
      const bodyText = typeof c.body === "string"
        ? c.body
        : extractAdfText(c.body);
      return `[${c.created}] ${c.author.displayName}:\n${bodyText.trim()}`;
    });
  }

  /**
   * Download the most recent `handoff.md` attachment for a revision task.
   */
  async fetchHandoff(issueKey: string): Promise<string | null> {
    const attachments = await this.jiraClient.getAttachments(issueKey).catch((err) => {
      this.logger.warn(
        `Failed to fetch attachments for ${issueKey}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    });

    const handoffAttachments = attachments
      .filter((a) => a.filename === "handoff.md")
      .sort((a, b) => b.created.localeCompare(a.created));

    if (handoffAttachments.length === 0) return null;

    try {
      return await this.jiraClient.downloadAttachment(
        handoffAttachments[0].content
      );
    } catch (err) {
      this.logger.warn(
        `Failed to download handoff.md: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  /** Attach the session transcript to JIRA with variant name and date. */
  async attachTranscript(issueKey: string, localPath: string, variantName: string): Promise<void> {
    try {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(localPath, "utf-8");
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const filename = `session-transcript-${variantName}-${dd}-${mm}-${yyyy}.md`;
      await withRetry(
        () => this.jiraClient.addAttachment(issueKey, filename, content),
        `attach transcript to ${issueKey}`,
        this.logger,
        this.retryOptions,
      );
      this.logger.info(`Session transcript attached to ${issueKey}`);
    } catch (err) {
      this.logger.warn(
        `Failed to attach transcript to ${issueKey}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
