import { StageMode } from "../config/types";
import { TaskStatus, type RalphResult, type StageResult } from "../container/types";
import type { IContainerManager } from "../container/manager";
import type { IssueContext } from "../prompt/prompt";
import type { Logger } from "../logger";
import type { IProfileSetupService } from "./profile-setup-service";
import type { TaskContext } from "./task-context";
import { truncate } from "../util/text";

/** Public contract for the multi-stage agent execution loop. */
export interface IAgentPipelineExecutor {
  /**
   * Run the stage loop for a single task: iterate stages, re-render templates
   * per stage, execute via the container, collect per-stage logs, and merge
   * results into a single {@link RalphResult}.
   */
  run(ctx: TaskContext, container: IContainerManager, issueContext: IssueContext): Promise<RalphResult>;
}

/**
 * Executes the multi-stage agent pipeline inside a running container.
 *
 * Extracted from {@link TaskRunner} so the stage-loop logic can be tested
 * independently without needing all of TaskRunner's lifecycle concerns.
 *
 * Responsibilities:
 * - Iterating `ctx.profile.stages` sequentially
 * - Re-rendering agent/skill templates per stage (multi-stage pipelines only)
 * - Delegating execution to `container.executeWithExecutor()`
 * - Checking `ctx.signal` for cooperative abort at stage boundaries
 * - Collecting per-stage logs and merging into the final {@link RalphResult}
 */
export class AgentPipelineExecutor implements IAgentPipelineExecutor {
  private readonly logger: Logger;
  private readonly profileSetup: IProfileSetupService;

  constructor({ logger, profileSetup }: { logger: Logger; profileSetup: IProfileSetupService }) {
    this.logger = logger;
    this.profileSetup = profileSetup;
  }

  async run(ctx: TaskContext, container: IContainerManager, issueContext: IssueContext): Promise<RalphResult> {
    const stages = ctx.profile.stages;
    const stageResults: StageResult[] = [];
    const hooklessSessions: string[] = [];
    let lastResult: RalphResult | undefined;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageLabel = `[${i + 1}/${stages.length}] ${stage.role}`;

      if (ctx.signal.aborted) {
        this.logger.info(`${stageLabel}: abort signalled — stopping pipeline`);
        break;
      }

      if (stages.length > 1) {
        this.logger.info(`${stageLabel}: rendering stage templates...`);
        await this.profileSetup.prepareForStage(ctx, {
          stage,
          stageIndex: i,
          stageCount: stages.length,
          previousStageRoles: stageResults.map((r) => r.role),
        });
      }

      const executor = await container.createExecutorForStage(stage);

      const timeoutSec = Math.round((stage.timeoutMs ?? ctx.profile.timeoutMs) / 1000);
      this.logger.info(`${stageLabel}: executing ${stage.agent} for ${ctx.workItem.id} (timeout: ${timeoutSec}s)...`);

      const result = await container.executeWithExecutor(executor, ctx.workItem, issueContext);
      this.logger.info(
        `${stageLabel}: finished — status=${result.status}, exit=${result.exitCode}, duration=${Math.round(result.durationMs / 1000)}s`,
      );
      if (
        stage.mode === StageMode.Container &&
        result.sessionId !== undefined &&
        (await container.sessionStartAudited(stage.cli, result.sessionId)) === false
      ) {
        this.logger.warn(
          `${stageLabel}: the audit log has no session_start for ${stage.cli} session ${result.sessionId} — ` +
            "Ralph's hooks did not run; server-managed settings may have replaced the managed settings file",
        );
        hooklessSessions.push(result.sessionId);
      }

      if (ctx.signal.aborted) {
        this.logger.info(`${stageLabel}: abort signalled — stopping pipeline`);
        break;
      }

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
        if (result.stderr) {
          this.logger.error(`${stageLabel}: stderr: ${truncate(result.stderr, 2000)}`);
        }
        if (!result.stderr && !result.stdout) {
          this.logger.error(`${stageLabel}: CLI produced no output — check container health or CLI installation`);
        }
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
        this.logger.warn(`${ctx.workItem.id} completed with partial status — check handoff for details`);
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
    if (hooklessSessions.length > 0) {
      finalResult.hooklessSessions = hooklessSessions;
    }

    return finalResult;
  }
}
