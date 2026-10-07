import type { IAgentProfile } from "../config/types";
import { TaskStatus, type RalphResult, type ContainerManagerFactory } from "../container/types";
import type { IssueContext } from "../prompt/prompt";
import type { Logger } from "../logger";
import type { IContainerManager } from "../container/manager";
import type { IResourceManager } from "./task-resource-manager";
import type { ITaskResultWriter } from "./task-result-writer";
import type { IIssueManager } from "./issue-manager";
import type { ILifecycleHook } from "../container/lifecycle";
import type { IProfileSetupService } from "./profile-setup-service";
import type { IAgentPipelineExecutor } from "./agent-pipeline-executor";
import { TransitionPhase } from "../orchestrator-types";
import type { TaskContext } from "./task-context";
import { toErrorMessage } from "../util/error";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
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
  private readonly profileSetup: IProfileSetupService;
  private readonly pipelineExecutor: IAgentPipelineExecutor;
  private readonly preExecuteHooks: readonly ILifecycleHook[];

  constructor({
    logger,
    containerFactory,
    resources,
    resultWriter,
    issueManager,
    profileSetup,
    pipelineExecutor,
    preExecuteHooks = [],
  }: {
    logger: Logger;
    containerFactory: ContainerManagerFactory;
    resources: IResourceManager;
    resultWriter: ITaskResultWriter;
    issueManager: IIssueManager;
    profileSetup: IProfileSetupService;
    pipelineExecutor: IAgentPipelineExecutor;
    preExecuteHooks?: readonly ILifecycleHook[];
  }) {
    this.logger = logger;
    this.containerFactory = containerFactory;
    this.resources = resources;
    this.resultWriter = resultWriter;
    this.issueManager = issueManager;
    this.profileSetup = profileSetup;
    this.pipelineExecutor = pipelineExecutor;
    this.preExecuteHooks = preExecuteHooks;
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
   * Run the full pipeline for a single issue + profile combination.
   *
   * @returns The task result (status, duration, PR URL, etc.)
   */
  async run(ctx: TaskContext): Promise<RalphResult> {
    const container = this.containerFactory.create(ctx.profile);
    container.onToolOutput = ctx.onToolOutput;
    container.onPreToolUse = ctx.onPreToolUse;

    try {
      await this.prepareProfile(ctx);
      await this.transitionIssue(ctx);
      await this.prepareContainer(ctx, container);
      const result = await this.executeAgent(ctx, container);
      await this.resultWriter.collectResults(ctx, container, result);

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

      if (container) {
        await this.resultWriter.collectLogs(container, errorResult);
      }

      return errorResult;
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
    // Clean the .ralph runtime directory on the host before compose up.
    // This removes stale logs/session-state from prior runs. Docker will
    // recreate it (owned by host UID) when mounting config files into it.
    const ralphDir = join(ctx.profile.repoPath, ".ralph");
    this.logger.info(`Cleaning ${ralphDir}...`);
    rmSync(ralphDir, { recursive: true, force: true });
    mkdirSync(ralphDir, { recursive: true });

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

    for (const hook of this.preExecuteHooks) {
      this.logger.info(`Running lifecycle hook: ${hook.name}...`);
      await hook.execute(container, ctx, this.logger);
    }
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
   * Execute post-task hook pipelines after the main pipeline is complete.
   *
   * Each hook runs its stages sequentially using local-only executors.
   * A failing stage aborts the current hook but does not prevent subsequent
   * hooks from running. Hook failures are logged as warnings — they never
   * affect the task result or JIRA transitions.
   */
  private async executePostTaskHooks(ctx: TaskContext, result: RalphResult): Promise<void> {
    const hooks = ctx.profile.postTaskHooks;
    if (!hooks.length) return;

    if (ctx.triggerParams.skip_hooks) {
      this.logger.info("skip_hooks param set — skipping post-task hooks, writing hook manifest");
      this.writeHookManifest(ctx, result);
      return;
    }

    for (const hook of hooks) {
      const hookOutputDir = join(ctx.outputDir, "hooks", hook.name);
      mkdirSync(hookOutputDir, { recursive: true });

      this.logger.info(
        `[hook:${hook.name}] Starting (${hook.stages.length} stage${hook.stages.length > 1 ? "s" : ""})`,
      );
      const completedRoles: string[] = [];

      try {
        for (let i = 0; i < hook.stages.length; i++) {
          const stage = hook.stages[i];
          const stageLabel = `[hook:${hook.name}/${stage.role}]`;

          this.logger.info(`${stageLabel} Rendering templates...`);
          await this.profileSetup.prepareForStage(ctx, {
            stage,
            stageIndex: i,
            stageCount: hook.stages.length,
            previousStageRoles: completedRoles,
            hook: {
              collectedLogs: result.collectedLogs,
              name: hook.name,
              outputDir: hookOutputDir,
            },
          });

          const { executor, sessionRunner } = this.containerFactory.createLocalSession(ctx.profile, stage);

          this.logger.info(`${stageLabel} Executing ${stage.agent}...`);
          const stageResult = await sessionRunner.run(
            executor,
            ctx.workItem,
            { comments: [], isRevision: false, handoffContent: null, triggerParams: ctx.triggerParams },
            {
              maxContinuations: 0,
              enableContinuation: false,
            },
          );

          if (stageResult.status !== TaskStatus.Completed) {
            this.logger.warn(`${stageLabel} Failed (${stageResult.status}) — skipping remaining stages in this hook`);
            break;
          }

          completedRoles.push(stage.role);
          this.logger.info(`${stageLabel} Completed`);
        }

        this.logger.info(`[hook:${hook.name}] Finished`);
      } catch (err) {
        this.logger.warn(`[hook:${hook.name}] Unexpected error: ${toErrorMessage(err)}`);
      }
    }
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
