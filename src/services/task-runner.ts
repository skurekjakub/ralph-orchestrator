import type { IAgentProfile } from "../config/types.js";
import type { RalphResult, ContainerManagerFactory } from "../container/types.js";
import { TaskStatus } from "../container/types.js";
import type { IssueContext } from "../prompt/prompt.js";
import type { Logger } from "../logger.js";
import type { IContainerManager } from "../container/manager.js";
import type { IResourceManager } from "./task-resource-manager.js";
import type { ITaskResultWriter } from "./task-result-writer.js";
import type { IIssueManager } from "./jira-issue-manager.js";
import type { IAgentTemplateRenderer } from "../container/setup/agent-includes.js";
import { buildTemplateContext } from "../container/setup/agent-includes.js";
import type { ISkillTemplateRenderer } from "../container/setup/skill-includes.js";
import type { IJitMcpConfigWriter } from "../container/setup/jit-mcp-params.js";
import type { ILifecycleHook } from "../container/lifecycle.js";
import { TransitionPhase } from "../orchestrator-types.js";
import type { TaskContext, TaskCallbacks } from "./task-context.js";
import { toErrorMessage } from "../util/error.js";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";


/** Public contract for the task execution pipeline. */
export interface ITaskRunner {
  /** Run the full pipeline for a single issue + profile combination. */
  run(ctx: TaskContext, callbacks?: TaskCallbacks): Promise<{ result: RalphResult; container: IContainerManager }>;
  /** Tear down containers — tries graceful stop, falls back to raw compose down. */
  teardown(profile: IAgentProfile, container: IContainerManager | null): Promise<void>;
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
 */
export class TaskRunner implements ITaskRunner {
  private readonly logger: Logger;
  private readonly containerFactory: ContainerManagerFactory;
  private readonly resources: IResourceManager;
  private readonly resultWriter: ITaskResultWriter;
  private readonly issueManager: IIssueManager;
  private readonly templateRenderer: IAgentTemplateRenderer;
  private readonly skillRenderer: ISkillTemplateRenderer;
  private readonly jitMcpConfig: IJitMcpConfigWriter;
  private readonly preExecuteHooks: readonly ILifecycleHook[];

  constructor({ logger, containerFactory, resources, resultWriter, issueManager, templateRenderer, skillRenderer, jitMcpConfig, preExecuteHooks = [] }: {
    logger: Logger;
    containerFactory: ContainerManagerFactory;
    resources: IResourceManager;
    resultWriter: ITaskResultWriter;
    issueManager: IIssueManager;
    templateRenderer: IAgentTemplateRenderer;
    skillRenderer: ISkillTemplateRenderer;
    jitMcpConfig: IJitMcpConfigWriter;
    preExecuteHooks?: readonly ILifecycleHook[];
  }) {
    this.logger = logger;
    this.containerFactory = containerFactory;
    this.resources = resources;
    this.resultWriter = resultWriter;
    this.issueManager = issueManager;
    this.templateRenderer = templateRenderer;
    this.skillRenderer = skillRenderer;
    this.jitMcpConfig = jitMcpConfig;
    this.preExecuteHooks = preExecuteHooks;
  }

  /**
   * Tear down containers — tries graceful stop, falls back to raw compose down.
   *
   * Attempts `container.stop()` first. If the container reference is null or
   * stop fails, delegates to the factory's `forceDown()` fallback.
   */
  async teardown(profile: IAgentProfile, container: IContainerManager | null): Promise<void> {
    if (container) {
      try {
        await container.stop();
        return;
      } catch (err) {
        this.logger.warn(
          `Graceful stop failed: ${toErrorMessage(err)}`,
        );
      }
    }

    try {
      await this.containerFactory.forceDown(profile);
    } catch (err) {
      this.logger.warn(
        `Fallback teardown failed: ${toErrorMessage(err)}`,
      );
    }
  }

  /**
   * Run the full pipeline for a single issue + profile combination.
   *
   * @returns The task result (status, duration, PR URL, etc.)
   */
  async run(ctx: TaskContext, callbacks?: TaskCallbacks): Promise<{ result: RalphResult; container: IContainerManager }> {
    const container = this.containerFactory.create(ctx.profile);
    if (callbacks?.onToolOutput) {
      container.onToolOutput = callbacks.onToolOutput;
    }
    if (callbacks?.onPreToolUse) {
      container.onPreToolUse = callbacks.onPreToolUse;
    }

    try {
      await this.prepareProfile(ctx);
      await this.transitionIssue(ctx);
      await this.prepareContainer(ctx, container);
      const result = await this.executeAgent(ctx, container);
      await this.resultWriter.collectResults(ctx, container, result);
      return { result, container };
    } catch (err) {
      this.logger.error(
        `Error processing ${ctx.workItem.key}: ${toErrorMessage(err)}`
      );

      const errorResult: RalphResult = {
        issueKey: ctx.workItem.key,
        status: TaskStatus.Error,
        durationMs: 0,
        exitCode: 1,
        stdout: "",
        stderr: toErrorMessage(err),
        collectedLogs: {},
      };

      if (container) {
        await this.resultWriter.collectLogs(container, errorResult);
      }

      return { result: errorResult, container };
    }
  }

  private async prepareProfile(ctx: TaskContext): Promise<void> {
    const templateContext = buildTemplateContext(ctx);

    this.logger.info("Rendering agent templates...");
    await this.templateRenderer.render(
      ctx.profile.id,
      templateContext,
      this.logger,
    );

    this.logger.info("Rendering skill templates...");
    await this.skillRenderer.render(templateContext, this.logger);

    this.jitMcpConfig.write(ctx.profile, ctx.workItem, this.logger, ctx.triggerParams);
  }

  private async transitionIssue(ctx: TaskContext): Promise<void> {
    await this.issueManager.transitionIssue(ctx.workItem.key, ctx.profile.beforeAgent?.targetStatus, TransitionPhase.BeforeAgent);
    await this.issueManager.postStartComment(ctx.workItem.key, ctx.profile.displayName, ctx.profile.id);
  }

  private async prepareContainer(ctx: TaskContext, container: IContainerManager): Promise<void> {
    // Clean the .ralph runtime directory on the host before compose up.
    // This removes stale logs/session-state from prior runs. Docker will
    // recreate it (owned by host UID) when mounting config files into it.
    const ralphDir = join(ctx.profile.repoPath, ".ralph");
    this.logger.info(`Cleaning ${ralphDir}...`);
    rmSync(ralphDir, { recursive: true, force: true });
    mkdirSync(ralphDir, { recursive: true });

    await container.start();

    this.logger.info("Verifying container health...");
    await container.checkPrerequisites();

    this.logger.info("Preparing config directory...");
    await container.cleaner.prepareConfigDir(container.cliPaths.configDir, container.cliPaths.writableDirs);

    await container.cleaner.cleanPaths(ctx.profile.cleanPaths);

    // Register log sources after cleanup but before setup — cleanup deletes
    // the directory that streaming sources watch, and setup is where squid
    // proxy failures surface. With sources registered, the error path can
    // still collectAll (especially proxy logs) before teardown.
    container.registerLogSources(ctx.taskId);

    await container.setup();

    for (const hook of this.preExecuteHooks) {
      this.logger.info(`Running lifecycle hook: ${hook.name}...`);
      await hook.execute(container, ctx, this.logger);
    }
  }

  private async executeAgent(ctx: TaskContext, container: IContainerManager): Promise<RalphResult> {
    this.logger.info(`Fetching JIRA comments for ${ctx.workItem.key}...`);
    const comments = await this.resources.fetchComments(ctx.workItem.key);
    this.logger.info(`Found ${comments.length} comments on ${ctx.workItem.key}`);

    let handoffContent: string | null = null;
    if (ctx.isRevision) {
      this.logger.info(`Issue is in revision status ("${ctx.workItem.fields.status?.name}") — fetching handoff...`);
      handoffContent = await this.resources.fetchHandoff(ctx.workItem.key);
      this.logger.info(
        `Handoff context: ${handoffContent ? "found" : "not found"}`
      );
    }

    const issueContext: IssueContext = {
      comments,
      isRevision: ctx.isRevision,
      handoffContent,
    };

    const timeoutSec = Math.round(ctx.profile.timeoutMs / 1000);
    this.logger.info(
      `Executing ${ctx.profile.displayName} agent for ${ctx.workItem.key} (timeout: ${timeoutSec}s)...`
    );
    const result = await container.execute(ctx.workItem, issueContext);
    this.logger.info(
      `Agent finished: status=${result.status}, exit=${result.exitCode}, duration=${Math.round(result.durationMs / 1000)}s`
    );

    if (result.prUrl) {
      this.logger.info(`PR created: ${result.prUrl}`);
    }

    if (result.status === TaskStatus.Partial) {
      this.logger.warn(
        `${ctx.workItem.key} completed with partial status — check handoff for details`
      );
    }

    return result;
  }
}
