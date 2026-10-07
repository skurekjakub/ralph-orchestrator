import type { IAgentProfile, IStageConfig } from "../config/types";
import type { ContainerExecResult, HostStageWorkspace } from "./types";

/**
 * Runs one pipeline stage's agent CLI.
 *
 * Each implementation translates a prompt into its CLI's invocation, handles streaming, timeout and the
 * process lifecycle.
 */
export interface ICliExecutor {
  /** Execute the agent CLI with the given prompt. */
  run(prompt: string): Promise<ContainerExecResult>;
  /** Resume the previous CLI session with a continuation prompt. */
  continueSession(prompt: string): Promise<ContainerExecResult>;
  /** Kill the active process if running (for graceful shutdown). */
  killActive(): void;
}

/** Creates the executors of one task's stages. Credentials are checked by startup validation, not here. */
export interface IStageExecutorFactory {
  /**
   * Executor for a `mode: "container"` stage, running inside the task's `app` container.
   *
   * @param stageProfile The variant with the stage's overrides applied (`deriveStageProfile`).
   * @throws Error when the stage runs Claude Code and the profile's agent templates are invalid or lack the
   *   stage's agent.
   */
  create(stageProfile: IAgentProfile, stage: IStageConfig): Promise<ICliExecutor>;
  /**
   * Executor for a `mode: "local"` stage, running the pinned CLI the orchestrator installed
   * (`node_modules/.bin/<cli>`) on the host in the stage's `workspace`.
   *
   * @param stageProfile The variant with the stage's overrides applied (`deriveStageProfile`).
   * @throws Error when the stage runs Claude Code and the profile's agent templates are invalid or lack the
   *   stage's agent.
   */
  createHost(stageProfile: IAgentProfile, stage: IStageConfig, workspace: HostStageWorkspace): Promise<ICliExecutor>;
}
