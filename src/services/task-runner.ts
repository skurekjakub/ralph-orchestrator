import type { AgentProfile, AppConfig } from "../config.js";
import type { JiraIssue } from "../jira/types.js";
import type { RalphResult } from "../container/types.js";
import type { IssueContext } from "../container/prompt.js";
import type { Logger } from "../logger.js";
import { extractAdfText } from "../jira/field-extractor.js";
import { JiraClient } from "../jira/client.js";
import { ContainerManager } from "../container/manager.js";
import { LogCollector } from "../logs/collector.js";
import { withRetry } from "../retry.js";
import { OrchestratorComments } from "./orchestrator-comments.js";

/**
 * Processes a single JIRA issue end-to-end:
 *
 * 1. Transition to "In Progress" + post start comment
 * 2. Start the containers for the matched profile
 * 3. Execute the agent inside the container
 * 4. Save copilot output + collect audit logs
 * 5. Save execution summary
 *
 * Also provides lifecycle helpers called by the Orchestrator after `run()` completes:
 * - {@link transitionToReview} — move issue to "Ready for Review"
 * - {@link postErrorComment} — post error details when a task fails
 *
 * This is a stateless service — all per-task state is scoped to the `run()` call.
 */
export class TaskRunner {
  constructor(
    private config: AppConfig,
    private jiraClient: JiraClient,
    private logCollector: LogCollector,
    private logger: Logger,
    private containerLogger?: Logger,
  ) {}

  /**
   * Run the full pipeline for a single issue + profile combination.
   *
   * @param isRevision When true, fetches JIRA comments and the previous handoff
   * @returns The task result (status, duration, PR URL, etc.)
   */
  async run(
    issue: JiraIssue,
    profile: AgentProfile,
  ): Promise<{ result: RalphResult; container: ContainerManager }> {
    const container = new ContainerManager(profile, this.config, this.logger, this.containerLogger);

    try {
      const beforeTransitionId = profile.beforeAgent?.transitionId;

      if (beforeTransitionId) {
        this.logger.info(
          `Transitioning ${issue.key} (beforeAgent, id=${beforeTransitionId})...`
        );
        await withRetry(
          () =>
            this.jiraClient.transitionIssue(
              issue.key,
              beforeTransitionId
            ),
          `transition ${issue.key}`,
          this.logger,
        )
          .then(() =>
            this.logger.info(`${issue.key} transitioned (beforeAgent)`)
          )
          .catch((err) => {
            this.logger.warn(
              `Failed to transition ${issue.key} after retries: ${err instanceof Error ? err.message : String(err)}`
            );
          });
      }

      this.logger.info(`Posting start comment on ${issue.key}...`);
      const startMessage = OrchestratorComments.start(profile.displayName, profile.id);
      await withRetry(
        () =>
          this.jiraClient.addComment(
            issue.key,
            startMessage
          ),
        `comment on ${issue.key}`,
        this.logger,
      )
        .then(() =>
          this.logger.info(`Start comment posted on ${issue.key}`)
        )
        .catch((err) => {
          this.logger.warn(
            `Failed to comment on ${issue.key} after retries: ${err instanceof Error ? err.message : String(err)}`
          );
        });

      await container.start();

      this.logger.info("Verifying container health...");
      await container.checkPrerequisites();

      this.logger.info("Cleaning previous audit logs...");
      await container.cleanLogs();

      this.logger.info(`Fetching JIRA comments for ${issue.key}...`);
      const comments = await this.fetchComments(issue.key);
      this.logger.info(`Found ${comments.length} comments on ${issue.key}`);

      this.logger.info(`Fetching handoff context for ${issue.key}...`);
      const handoffContent = await this.fetchHandoff(issue.key);
      this.logger.info(
        `Handoff context: ${handoffContent ? "found" : "not found"}`
      );

      const issueContext: IssueContext = {
        comments,
        isRevision: !!handoffContent,
        handoffContent,
      };

      const timeoutSec = Math.round(profile.timeoutMs / 1000);
      this.logger.info(
        `Executing ${profile.displayName} agent for ${issue.key} (timeout: ${timeoutSec}s)...`
      );
      const result = await container.execute(issue, issueContext);
      this.logger.info(
        `Agent finished: status=${result.status}, exit=${result.exitCode}, duration=${Math.round(result.durationMs / 1000)}s`
      );

      if (result.prUrl) {
        this.logger.info(`PR created: ${result.prUrl}`);
      }

      if (result.status === "partial") {
        this.logger.warn(
          `${issue.key} completed with partial status — check handoff for details`
        );
      }

      this.logger.info("Collecting audit logs from container...");
      result.auditLogPath =
        (await container.collectLogs(issue.key)) ?? undefined;

      if (result.auditLogPath) {
        this.logger.info(`Audit logs saved: ${result.auditLogPath}`);
      } else {
        this.logger.warn("No audit logs found in container");
      }

      this.logger.info("Collecting session transcript...");
      result.transcriptPath =
        (await container.collectTranscript(issue.key)) ?? undefined;

      if (result.transcriptPath) {
        this.logger.info(`Transcript saved: ${result.transcriptPath}`);
        await this.attachTranscript(issue.key, result.transcriptPath);
      } else {
        this.logger.warn("No session transcript available");
      }

      this.logCollector.saveExecutionSummary(result);
      this.logger.info("Execution summary saved");

      return { result, container };
    } catch (err) {
      this.logger.error(
        `Error processing ${issue.key}: ${err instanceof Error ? err.message : String(err)}`
      );

      const errorResult: RalphResult = {
        issueKey: issue.key,
        status: "error",
        durationMs: 0,
        exitCode: 1,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
      };

      return { result: errorResult, container };
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
      );
      this.logger.info(`Error comment posted on ${issueKey}`);
    } catch (err) {
      this.logger.warn(
        `Failed to post error comment on ${issueKey}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Execute the afterAgent transition (if configured). */
  async transitionAfterAgent(issueKey: string, profile: AgentProfile): Promise<void> {
    const afterTransitionId = profile.afterAgent?.transitionId;
    if (!afterTransitionId) return;

    this.logger.info(`Transitioning ${issueKey} (afterAgent, id=${afterTransitionId})...`);
    try {
      await withRetry(
        () =>
          this.jiraClient.transitionIssue(
            issueKey,
            afterTransitionId
          ),
        `transition ${issueKey} (afterAgent)`,
        this.logger,
      );
      this.logger.info(`${issueKey} transitioned (afterAgent)`);
    } catch (err) {
      this.logger.warn(
        `Failed to transition ${issueKey} (afterAgent): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Fetch and format all JIRA comments for an issue.
   *
   * Comment bodies are extracted from ADF to plain text.
   */
  private async fetchComments(issueKey: string): Promise<string[]> {
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
  private async fetchHandoff(issueKey: string): Promise<string | null> {
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

  /** Attach the session transcript to JIRA as `session-transcript.md`. */
  private async attachTranscript(issueKey: string, localPath: string): Promise<void> {
    try {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(localPath, "utf-8");
      await withRetry(
        () => this.jiraClient.addAttachment(issueKey, "session-transcript.md", content),
        `attach transcript to ${issueKey}`,
        this.logger,
      );
      this.logger.info(`Session transcript attached to ${issueKey}`);
    } catch (err) {
      this.logger.warn(
        `Failed to attach transcript to ${issueKey}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
