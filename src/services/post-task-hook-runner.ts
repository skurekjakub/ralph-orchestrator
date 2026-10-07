import { mkdirSync } from "node:fs";
import type { IPostTaskHook } from "../config/types";
import { TaskStatus, type ContainerManagerFactory } from "../container/types";
import type { Logger } from "../logger";
import { toErrorMessage } from "../util/error";
import type { IProfileSetupService } from "./profile-setup-service";
import { hookOutputDir, type IStageWorkspaceResolver } from "./stage-workspace";
import type { TaskContext } from "./task-context";

/** Runs a task's post-task hooks on the host. */
export interface IPostTaskHookRunner {
  /**
   * Runs `hooks` in order. Each hook's stages run in order, each in its own host workspace: rendered into it, then
   * run through a host session without continuations, under the stage's own result contract. A stage that does
   * not complete skips the rest of its hook; a hook that throws is logged, and the next hook still runs.
   *
   * Never throws, so hook failures never change the task's result.
   *
   * @param collectedLogs The main pipeline's collected logs, keyed by log source id, for the hooks' templates.
   */
  run(
    ctx: TaskContext,
    hooks: readonly IPostTaskHook[],
    collectedLogs: Readonly<Record<string, string>>,
  ): Promise<void>;
}

/** Runs post-task hooks for the task runner and for replays of a saved hook manifest. */
export class PostTaskHookRunner implements IPostTaskHookRunner {
  private readonly logger: Logger;
  private readonly profileSetup: IProfileSetupService;
  private readonly containerFactory: ContainerManagerFactory;
  private readonly stageWorkspaces: IStageWorkspaceResolver;

  constructor({
    logger,
    profileSetup,
    containerFactory,
    stageWorkspaces,
  }: {
    logger: Logger;
    profileSetup: IProfileSetupService;
    containerFactory: ContainerManagerFactory;
    stageWorkspaces: IStageWorkspaceResolver;
  }) {
    this.logger = logger;
    this.profileSetup = profileSetup;
    this.containerFactory = containerFactory;
    this.stageWorkspaces = stageWorkspaces;
  }

  async run(
    ctx: TaskContext,
    hooks: readonly IPostTaskHook[],
    collectedLogs: Readonly<Record<string, string>>,
  ): Promise<void> {
    for (const hook of hooks) {
      try {
        await this.runHook(ctx, hook, collectedLogs);
      } catch (err) {
        this.logger.warn(`[hook:${hook.name}] Unexpected error: ${toErrorMessage(err)}`);
      }
    }
  }

  private async runHook(
    ctx: TaskContext,
    hook: IPostTaskHook,
    collectedLogs: Readonly<Record<string, string>>,
  ): Promise<void> {
    const outputDir = hookOutputDir(ctx.outputDir, hook.name);
    mkdirSync(outputDir, { recursive: true });

    this.logger.info(`[hook:${hook.name}] Starting (${hook.stages.length} stage${hook.stages.length > 1 ? "s" : ""})`);
    const completedRoles: string[] = [];

    for (const [stageIndex, stage] of hook.stages.entries()) {
      const stageLabel = `[hook:${hook.name}/${stage.role}]`;
      const workspace = this.stageWorkspaces.forHookStage(ctx, hook.name, stage);
      mkdirSync(workspace.artifactDir, { recursive: true });

      this.logger.info(`${stageLabel} Rendering templates into ${workspace.stageDir}...`);
      await this.profileSetup.prepareForStage(
        ctx,
        {
          stage,
          stageIndex,
          stageCount: hook.stages.length,
          previousStageRoles: [...completedRoles],
          hook: { collectedLogs: { ...collectedLogs }, name: hook.name, outputDir },
        },
        workspace,
      );

      const { executor, sessionRunner } = await this.containerFactory.createLocalSession(ctx.profile, stage, workspace);

      this.logger.info(`${stageLabel} Executing ${stage.agent}...`);
      const stageResult = await sessionRunner.run(
        executor,
        ctx.workItem,
        { comments: [], isRevision: false, handoffContent: null, triggerParams: ctx.triggerParams },
        { maxContinuations: 0, enableContinuation: false, requireResultBlock: stage.requireResultBlock },
      );

      if (stageResult.status !== TaskStatus.Completed) {
        this.logger.warn(`${stageLabel} Failed (${stageResult.status}) — skipping remaining stages in this hook`);
        break;
      }

      completedRoles.push(stage.role);
      this.logger.info(`${stageLabel} Completed`);
    }

    this.logger.info(`[hook:${hook.name}] Finished`);
  }
}
