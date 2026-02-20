import type { AgentProfile } from "../config.js";
import type { JiraIssue } from "../jira/types.js";
import type { RalphResult, ContainerManagerFactory } from "../container/types.js";
import { TaskStatus } from "../container/types.js";
import type { IssueContext } from "../prompt/prompt.js";
import type { Logger } from "../logger.js";
import type { IContainerManager } from "../container/manager.js";
import type { ILogCollector } from "../logs/collector.js";
import type { IResourceManager } from "./task-resource-manager.js";
import type { IIssueManager } from "./jira-issue-manager.js";
import { TransitionPhase } from "../orchestrator-types.js";
import { CopilotExecutor } from "../container/cli-executors/copilot-executor.js";

/** Public contract for the task execution pipeline. */
export interface ITaskRunner {
  /** Optional callback invoked for each real-time tool output line from the container. */
  onToolOutput?: (line: string) => void;
  /** Optional callback invoked for each real-time pre-tool invocation line from the container. */
  onPreToolUse?: (line: string) => void;
  /** Run the full pipeline for a single issue + profile combination. */
  run(issue: JiraIssue, profile: AgentProfile, taskId: string): Promise<{ result: RalphResult; container: IContainerManager }>;
  /** Tear down containers — tries graceful stop, falls back to raw compose down. */
  teardown(profile: AgentProfile, container: IContainerManager | null): Promise<void>;
}

/**
 * Processes a single JIRA issue end-to-end:
 *
 * 1. Transition to "In Progress" + post start comment
 * 2. Start the containers for the matched profile
 * 3. Execute the agent inside the container
 * 4. Save CLI output + collect audit logs
 * 5. Save execution summary
 *
 * Also provides lifecycle helpers called by the Orchestrator after `run()` completes:
 * - {@link transitionToReview} — move issue to "Ready for Review"
 * - {@link postErrorComment} — post error details when a task fails
 *
 * This is a stateless service — all per-task state is scoped to the `run()` call.
 */
export class TaskRunner implements ITaskRunner {
  constructor(
    private readonly logCollector: ILogCollector,
    private readonly logger: Logger,
    private readonly containerFactory: ContainerManagerFactory,
    private readonly resources: IResourceManager,
    private readonly issueManager: IIssueManager,
  ) {}

  /** Optional callback invoked for each real-time tool output line from the container. */
  onToolOutput?: (line: string) => void;

  /** Optional callback invoked for each real-time pre-tool invocation line from the container. */
  onPreToolUse?: (line: string) => void;

  /**
   * Tear down containers — tries graceful stop, falls back to raw compose down.
   *
   * Attempts `container.stop()` first. If the container reference is null or
   * stop fails, delegates to the factory's `forceDown()` fallback.
   */
  async teardown(profile: AgentProfile, container: IContainerManager | null): Promise<void> {
    if (container) {
      try {
        await container.stop();
        return;
      } catch (err) {
        this.logger.warn(
          `Graceful stop failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    try {
      await this.containerFactory.forceDown(profile);
    } catch (err) {
      this.logger.warn(
        `Fallback teardown failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Run the full pipeline for a single issue + profile combination.
   *
   * @param isRevision When true, fetches JIRA comments and the previous handoff
   * @returns The task result (status, duration, PR URL, etc.)
   */
  async run(
    issue: JiraIssue,
    profile: AgentProfile,
    taskId: string,
  ): Promise<{ result: RalphResult; container: IContainerManager }> {
    const container = this.containerFactory.create(profile);
    if (this.onToolOutput) {
      container.onToolOutput = this.onToolOutput;
    }
    if (this.onPreToolUse) {
      container.onPreToolUse = this.onPreToolUse;
    }

    try {
      await this.issueManager.transitionIssue(issue.key, profile.beforeAgent?.targetStatus, TransitionPhase.BeforeAgent);
      await this.issueManager.postStartComment(issue.key, profile.displayName, profile.id);

      await container.start();

      this.logger.info("Verifying container health...");
      await container.checkPrerequisites();

      this.logger.info("Preparing config directory...");
      await container.cleaner.prepareConfigDir(CopilotExecutor.CONFIG_DIR, CopilotExecutor.WRITABLE_DIRS);

      this.logger.info("Cleaning previous audit logs...");
      await container.cleaner.cleanLogDirectory(profile.auditLogPath);
      await container.cleaner.cleanPaths(profile.cleanPaths);

      // Register log sources after cleanup but before setup — cleanup deletes
      // the directory that streaming sources watch, and setup is where squid
      // proxy failures surface. With sources registered, the error path can
      // still collectAll (especially proxy logs) before teardown.
      container.registerLogSources(taskId);

      await container.setup();

      this.logger.info(`Fetching JIRA comments for ${issue.key}...`);
      const comments = await this.resources.fetchComments(issue.key);
      this.logger.info(`Found ${comments.length} comments on ${issue.key}`);

      const issueStatus = issue.fields.status?.name?.toLowerCase() ?? "";
      const revisionStatuses = profile.match.revisionStatuses ?? [];
      const isRevision = revisionStatuses.some(
        (s) => s.toLowerCase() === issueStatus,
      );

      let handoffContent: string | null = null;
      if (isRevision) {
        this.logger.info(`Issue is in revision status ("${issue.fields.status?.name}") — fetching handoff...`);
        handoffContent = await this.resources.fetchHandoff(issue.key);
        this.logger.info(
          `Handoff context: ${handoffContent ? "found" : "not found"}`
        );
      }

      const issueContext: IssueContext = {
        comments,
        isRevision,
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

      if (result.status === TaskStatus.Partial) {
        this.logger.warn(
          `${issue.key} completed with partial status — check handoff for details`
        );
      }

      this.logger.info("Collecting logs from containers...");
      const collected = await container.logs.collectAll();
      for (const { id, path } of collected) {
        if (path) result.collectedLogs[id] = path;
      }

      const transcriptPath = result.collectedLogs["transcript"];
      if (transcriptPath) {
        await this.resources.attachTranscript(issue.key, transcriptPath, profile.agentName);
      }

      this.logCollector.saveExecutionSummary(result, undefined, taskId);
      this.logger.info("Execution summary saved");

      return { result, container };
    } catch (err) {
      this.logger.error(
        `Error processing ${issue.key}: ${err instanceof Error ? err.message : String(err)}`
      );

      const errorResult: RalphResult = {
        issueKey: issue.key,
        status: TaskStatus.Error,
        durationMs: 0,
        exitCode: 1,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        collectedLogs: {},
      };

      if (container) {
        const collected = await container.logs.collectAll().catch(() => []);
        for (const { id, path } of collected) {
          if (path) errorResult.collectedLogs[id] = path;
        }
      }

      return { result: errorResult, container };
    }
  }

}
