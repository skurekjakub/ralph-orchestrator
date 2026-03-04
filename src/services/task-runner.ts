import { StageMode, type IAgentProfile } from "../config/types.js";
import { TaskStatus, type RalphResult, type StageResult, type ContainerManagerFactory } from "../container/types.js";
import type { IssueContext } from "../prompt/prompt.js";
import type { Logger } from "../logger.js";
import type { IContainerManager } from "../container/manager.js";
import type { IResourceManager } from "./task-resource-manager.js";
import type { ITaskResultWriter } from "./task-result-writer.js";
import type { IIssueManager } from "./issue-manager.js";
import { buildTemplateContext, type IAgentTemplateRenderer } from "../container/setup/agent-includes.js";
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

      // Tear down the container before running hooks — hooks are local-only
      // and don't need the container. The isRunning guard makes the
      // orchestrator's safety-net teardown a no-op.
      await this.teardown(ctx.profile, container);

      // Run post-task hooks (local-only, after full container lifecycle)
      await this.executePostTaskHooks(ctx, result);

      return { result, container };
    } catch (err) {
      this.logger.error(
        `Error processing ${ctx.workItem.id}: ${toErrorMessage(err)}`
      );

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

      return { result: errorResult, container };
    }
  }

  private async prepareProfile(ctx: TaskContext): Promise<void> {
    // Render with first-stage defaults to populate .build/ before container start.
    // For multi-stage pipelines, the stage loop re-renders per-stage with overrides.
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
    await this.issueManager.transitionWorkItem(ctx.workItem.source, ctx.workItem.id, ctx.profile.beforeAgent?.targetStatus, TransitionPhase.BeforeAgent);
    await this.issueManager.postStartComment(ctx.workItem.source, ctx.workItem.id, ctx.profile.displayName, ctx.profile.id);
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
    this.logger.info(`Fetching comments for ${ctx.workItem.id}...`);
    const comments = await this.resources.fetchComments(ctx.workItem.source, ctx.workItem.id);
    this.logger.info(`Found ${comments.length} comments on ${ctx.workItem.id}`);

    let handoffContent: string | null = null;
    if (ctx.isRevision) {
      this.logger.info(`Issue is in revision status ("${ctx.workItem.status}") — fetching handoff...`);
      handoffContent = await this.resources.fetchHandoff(ctx.workItem.source, ctx.workItem.id);
      this.logger.info(
        `Handoff context: ${handoffContent ? "found" : "not found"}`
      );
    }

    const issueContext: IssueContext = {
      comments,
      isRevision: ctx.isRevision,
      handoffContent,
      triggerParams: ctx.triggerParams,
    };

    const stages = ctx.profile.stages;
    const stageResults: StageResult[] = [];
    let lastResult: RalphResult | undefined;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageLabel = `[${i + 1}/${stages.length}] ${stage.role}`;

      // Re-render templates with stage-specific context so each agent sees
      // correct stageRole, stageMode, stageIndex, skills, etc. Bind-mounted
      // .build/ files update in-place for container stages.
      if (stages.length > 1) {
        const stageContext = buildTemplateContext(ctx, {
          stageIndex: i,
          stageCount: stages.length,
          stageRole: stage.role,
          stageMode: stage.mode,
          previousStageRoles: stageResults.map(r => r.role),
          skills: stage.skills,
        });
        this.logger.info(`${stageLabel}: rendering stage templates...`);
        await this.templateRenderer.render(ctx.profile.id, stageContext, this.logger);
        await this.skillRenderer.render(stageContext, this.logger);
      }

      const executor = container.createExecutorForStage(stage);

      const timeoutSec = Math.round((stage.timeoutMs ?? ctx.profile.timeoutMs) / 1000);
      this.logger.info(
        `${stageLabel}: executing ${stage.agent} for ${ctx.workItem.id} (timeout: ${timeoutSec}s)...`
      );

      const result = await container.executeWithExecutor(executor, ctx.workItem, issueContext);
      this.logger.info(
        `${stageLabel}: finished — status=${result.status}, exit=${result.exitCode}, duration=${Math.round(result.durationMs / 1000)}s`
      );

      // Collect per-stage logs for container stages in multi-stage pipelines.
      // Local stages have no container logs to collect.
      const stageLogs: Record<string, string> = {};
      if (stages.length > 1 && stage.mode === StageMode.Container) {
        this.logger.info(`${stageLabel}: collecting stage logs...`);
        const collected = await container.logs.collectAll(stage.role).catch(() => []);
        for (const { id, path } of collected) {
          if (path) stageLogs[id] = path;
        }
      }

      stageResults.push({
        role: stage.role,
        status: result.status,
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        collectedLogs: stageLogs,
      });

      lastResult = result;

      const isLastStage = i === stages.length - 1;
      const pipelineAborted = result.status === TaskStatus.Error;

      if (pipelineAborted) {
        this.logger.error(`${stageLabel}: stage failed — aborting pipeline`);
        break;
      }

      // Clear container log files between stages so the next stage starts fresh.
      if (!isLastStage && stages.length > 1 && stage.mode === StageMode.Container) {
        await container.logs.clearCollectSources();
      }

      if (result.prUrl) {
        this.logger.info(`PR created: ${result.prUrl}`);
      }

      if (result.status === TaskStatus.Partial) {
        this.logger.warn(
          `${ctx.workItem.id} completed with partial status — check handoff for details`
        );
      }
    }

    // Merge stage results into the final result (last stage's output is authoritative)
    const finalResult: RalphResult = lastResult ?? {
      taskId: ctx.workItem.id,
      status: TaskStatus.Error,
      durationMs: 0,
      exitCode: 1,
      stdout: "",
      stderr: "No stages executed",
      collectedLogs: {},
    };

    // Always compute total duration from stage timings for consistency.
    if (stageResults.length > 0) {
      finalResult.durationMs = stageResults.reduce((sum, s) => sum + s.durationMs, 0);
    }
    if (stageResults.length > 1) {
      finalResult.stageResults = stageResults;
    }

    return finalResult;
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

    for (const hook of hooks) {
      const hookOutputDir = join(ctx.outputDir, "hooks", hook.name);
      mkdirSync(hookOutputDir, { recursive: true });

      this.logger.info(`[hook:${hook.name}] Starting (${hook.stages.length} stage${hook.stages.length > 1 ? "s" : ""})`);
      const completedRoles: string[] = [];

      try {
        for (let i = 0; i < hook.stages.length; i++) {
          const stage = hook.stages[i];
          const stageLabel = `[hook:${hook.name}/${stage.role}]`;

          const stageContext = buildTemplateContext(ctx, {
            stageIndex: i,
            stageCount: hook.stages.length,
            stageRole: stage.role,
            stageMode: stage.mode,
            previousStageRoles: completedRoles,
            skills: stage.skills,
            hook: {
              collectedLogs: result.collectedLogs,
              name: hook.name,
              outputDir: hookOutputDir,
            },
          });

          this.logger.info(`${stageLabel} Rendering templates...`);
          await this.templateRenderer.render(ctx.profile.id, stageContext, this.logger);
          await this.skillRenderer.render(stageContext, this.logger);

          const { executor, sessionRunner } = this.containerFactory.createLocalSession(ctx.profile, stage);

          this.logger.info(`${stageLabel} Executing ${stage.agent}...`);
          const stageResult = await sessionRunner.run(executor, ctx.workItem, { comments: [], isRevision: false, handoffContent: null, triggerParams: ctx.triggerParams }, {
            maxContinuations: 0,
            enableContinuation: false,
          });

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
}
