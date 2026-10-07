import type { IAgentProfile } from "../config/types";
import { TaskStatus, type RalphResult, type ContainerManagerFactory } from "../container/types";
import type { IssueContext } from "../prompt/prompt";
import type { Logger } from "../logger";
import type { IContainerManager } from "../container/manager";
import type { IResourceManager } from "./task-resource-manager";
import type { ITaskResultWriter } from "./task-result-writer";
import type { IIssueManager } from "./issue-manager";
import type { IProfileSetupService } from "./profile-setup-service";
import type { IAgentPipelineExecutor } from "./agent-pipeline-executor";
import type { ITaskWorkspaceManager } from "./task-workspace-manager";
import type { IPostTaskHookRunner } from "./post-task-hook-runner";
import { TransitionPhase } from "../orchestrator-types";
import type { TaskContext } from "./task-context";
import { toErrorMessage } from "../util/error";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** Public contract for the task execution pipeline. */
export interface ITaskRunner {
  /** Run the full pipeline for a single issue + profile combination. */
  run(ctx: TaskContext): Promise<RalphResult>;
  /** Tear down containers — tries graceful stop, falls back to raw compose down. */
  teardown(profile: IAgentProfile, container: IContainerManager | null): Promise<void>;
}

/**
 * Processes a single work item end-to-end:
 *
 * 1. Transition to "In Progress" + post start comment
 * 2. Create the task's workspace on the task branch
 * 3. Start the containers for the matched profile, with the workspace mounted at `/workspace`
 * 4. Execute the agent inside the container
 * 5. Save CLI output + collect audit logs
 * 6. Save execution summary (also when a phase throws, with the error status and message), run post-task hooks
 * 7. Delete the workspace when the task succeeded, keep it otherwise
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
  private readonly profileSetup: IProfileSetupService;
  private readonly pipelineExecutor: IAgentPipelineExecutor;
  private readonly workspaceManager: ITaskWorkspaceManager;
  private readonly hookRunner: IPostTaskHookRunner;

  constructor({
    logger,
    containerFactory,
    resources,
    resultWriter,
    issueManager,
    profileSetup,
    pipelineExecutor,
    workspaceManager,
    hookRunner,
  }: {
    logger: Logger;
    containerFactory: ContainerManagerFactory;
    resources: IResourceManager;
    resultWriter: ITaskResultWriter;
    issueManager: IIssueManager;
    profileSetup: IProfileSetupService;
    pipelineExecutor: IAgentPipelineExecutor;
    workspaceManager: ITaskWorkspaceManager;
    hookRunner: IPostTaskHookRunner;
  }) {
    this.logger = logger;
    this.containerFactory = containerFactory;
    this.resources = resources;
    this.resultWriter = resultWriter;
    this.issueManager = issueManager;
    this.profileSetup = profileSetup;
    this.pipelineExecutor = pipelineExecutor;
    this.workspaceManager = workspaceManager;
    this.hookRunner = hookRunner;
  }

  /**
   * Tear down containers — tries graceful stop, falls back to raw compose down.
   *
   * Attempts `container.stop()` first. If the container reference is null or
   * stop fails, delegates to the factory's `forceDown()` fallback.
   */
  async teardown(profile: IAgentProfile, container: IContainerManager | null): Promise<void> {
    if (container?.isRunning) {
      try {
        await container.stop();
        return;
      } catch (err) {
        this.logger.warn(`Graceful stop failed: ${toErrorMessage(err)}`);
      }
    }

    if (container && !container.isRunning) return;

    try {
      await this.containerFactory.forceDown(profile);
    } catch (err) {
      this.logger.warn(`Fallback teardown failed: ${toErrorMessage(err)}`);
    }
  }

  /**
   * Run the full pipeline for a single issue + profile combination, then delete the task's workspace when
   * the task succeeded. A failed task keeps its workspace for inspection.
   *
   * @returns The task result (status, duration, PR URL, etc.)
   */
  async run(ctx: TaskContext): Promise<RalphResult> {
    const result = await this.runPipeline(ctx);
    await this.workspaceManager.cleanup(ctx, result.status);
    return result;
  }

  /** Run every phase of the task; a phase that throws ends it with an error result. */
  private async runPipeline(ctx: TaskContext): Promise<RalphResult> {
    const container = this.containerFactory.create(ctx.profile, ctx.workspacePath);
    container.onToolOutput = ctx.onToolOutput;
    container.onPreToolUse = ctx.onPreToolUse;

    let resultsCollected = false;
    try {
      await this.prepareProfile(ctx);
      await this.transitionIssue(ctx);
      await this.prepareContainer(ctx, container);
      const result = await this.executeAgent(ctx, container);
      await this.resultWriter.collectResults(ctx, container, result);
      resultsCollected = true;

      // Tear down the container before running hooks — hooks are local-only
      // and don't need the container. The isRunning guard in teardown() makes
      // the orchestrator's safety-net teardown in finally a no-op.
      await this.teardown(ctx.profile, container);

      // Run post-task hooks (local-only, after full container lifecycle)
      await this.executePostTaskHooks(ctx, result);

      return result;
    } catch (err) {
      this.logger.error(`Error processing ${ctx.workItem.id}: ${toErrorMessage(err)}`);

      const errorResult: RalphResult = {
        taskId: ctx.workItem.id,
        status: TaskStatus.Error,
        durationMs: 0,
        exitCode: 1,
        stdout: "",
        stderr: toErrorMessage(err),
        collectedLogs: {},
      };

      // A failure after the results were collected (teardown, hooks) must not attach and summarise them twice.
      if (!resultsCollected) {
        await this.collectErrorResults(ctx, container, errorResult);
      }

      return errorResult;
    }
  }

  /**
   * Collect logs, redact transcripts and write the execution summary for a task a phase failed, so a failed
   * task leaves the same artifacts as a finished one. A collection failure is logged and never replaces the
   * task's own error.
   */
  private async collectErrorResults(ctx: TaskContext, container: IContainerManager, result: RalphResult) {
    try {
      await this.resultWriter.collectResults(ctx, container, result);
    } catch (err) {
      this.logger.error(`Collecting results of failed ${ctx.workItem.id} failed: ${toErrorMessage(err)}`);
    }
  }

  private async prepareProfile(ctx: TaskContext): Promise<void> {
    // Render with first-stage defaults to populate .build/ before container start.
    // For multi-stage pipelines, the stage loop re-renders per-stage with overrides.
    await this.profileSetup.prepareForTask(ctx);
  }

  private async transitionIssue(ctx: TaskContext): Promise<void> {
    await this.issueManager.transitionWorkItem(
      ctx.workItem.source,
      ctx.workItem.id,
      ctx.profile.beforeAgent?.targetStatus,
      TransitionPhase.BeforeAgent,
    );
    await this.issueManager.postStartComment(
      ctx.workItem.source,
      ctx.workItem.id,
      ctx.profile.displayName,
      ctx.profile.id,
      ctx.triggerParams,
    );
  }

  private async prepareContainer(ctx: TaskContext, container: IContainerManager): Promise<void> {
    await this.workspaceManager.prepare(ctx);

    // The container registers an abort listener internally — it will stop itself
    // when ctx.signal fires, allowing shutdown() to cancel without needing a
    // direct container reference.
    await container.start(ctx.signal);

    this.logger.info("Verifying container health...");
    await container.checkPrerequisites();

    this.logger.info("Preparing CLI config directories...");
    for (const layout of container.layouts) {
      await container.cleaner.prepareConfigDir(layout.configDir, layout.writableDirs);
    }

    await container.cleaner.cleanPaths(ctx.profile.cleanPaths);

    // Register log sources after cleanup but before setup — cleanup deletes
    // the directory that streaming sources watch, and setup is where squid
    // proxy failures surface. With sources registered, the error path can
    // still collectAll (especially proxy logs) before teardown.
    container.registerLogSources(ctx.taskId, ctx.workItem.id, ctx.outputDir);

    await container.setup();
  }

  private async executeAgent(ctx: TaskContext, container: IContainerManager): Promise<RalphResult> {
    this.logger.info(`Fetching comments for ${ctx.workItem.id}...`);
    const comments = await this.resources.fetchComments(ctx.workItem.source, ctx.workItem.id);
    this.logger.info(`Found ${comments.length} comments on ${ctx.workItem.id}`);

    let handoffContent: string | null = null;
    if (ctx.isRevision) {
      this.logger.info(`Issue is in revision status ("${ctx.workItem.status}") — fetching handoff...`);
      handoffContent = await this.resources.fetchHandoff(ctx.workItem.source, ctx.workItem.id);
      this.logger.info(`Handoff context: ${handoffContent ? "found" : "not found"}`);
    }

    const issueContext: IssueContext = {
      comments,
      isRevision: ctx.isRevision,
      handoffContent,
      triggerParams: ctx.triggerParams,
    };

    return this.pipelineExecutor.run(ctx, container, issueContext);
  }

  /**
   * Run the variant's post-task hooks after the main pipeline is complete, or, with the `skip_hooks` trigger
   * param, write the manifest that replays them later instead. Hook failures never affect the task result or
   * the work item's transitions.
   */
  private async executePostTaskHooks(ctx: TaskContext, result: RalphResult): Promise<void> {
    const hooks = ctx.profile.postTaskHooks;
    if (!hooks.length) return;

    if (ctx.triggerParams.skip_hooks) {
      this.logger.info("skip_hooks param set — skipping post-task hooks, writing hook manifest");
      this.writeHookManifest(ctx, result);
      return;
    }

    await this.hookRunner.run(ctx, hooks, result.collectedLogs);
  }

  /**
   * Write a JSON manifest with all context needed to replay post-task hooks later.
   * Saved to `<outputDir>/hook-manifest.json`.
   */
  private writeHookManifest(ctx: TaskContext, result: RalphResult): void {
    const manifest = {
      taskId: ctx.taskId,
      workItemId: ctx.workItem.id,
      source: ctx.workItem.source,
      profileId: ctx.profile.id,
      variantKey: ctx.profile.variantKey,
      triggerParams: ctx.triggerParams,
      isRevision: ctx.isRevision,
      outputDir: ctx.outputDir,
      status: result.status,
      collectedLogs: result.collectedLogs,
      hooks: ctx.profile.postTaskHooks,
      createdAt: new Date().toISOString(),
    };

    const manifestPath = join(ctx.outputDir, "hook-manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    this.logger.info(`Hook manifest written to ${manifestPath}`);
  }
}
