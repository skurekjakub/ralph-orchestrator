import type { ICliRuntimeRegistry } from "../cli/cli-runtime";
import { hostCliBinary } from "../cli/cli-versions";
import { CliType, type IAgentProfile, type IStageConfig } from "../config/types";
import type { Logger } from "../logger";
import type { IComposeClient } from "./compose-client";
import type { IAgentCatalogProvider } from "./setup/agent-catalogs";
import type { ContainerExecResult, HostStageWorkspace } from "./types";
import { ClaudeCodeExecutor } from "./cli-executors/claude-code-executor";
import { CopilotExecutor } from "./cli-executors/copilot-executor";
import { LocalClaudeCodeExecutor } from "./cli-executors/local-claude-code-executor";
import { LocalCopilotExecutor } from "./cli-executors/local-copilot-executor";
import { profileBuildPaths } from "./setup/build-paths";

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

/** Creates the executor of a stage's CLI. Credentials are checked by startup validation, not here. */
export interface ICliExecutorFactory {
  /**
   * Executor for a `mode: "container"` stage, running inside the task's `app` container.
   *
   * @param stageProfile The variant with the stage's overrides applied (`deriveStageProfile`).
   * @throws Error when the profile's agent templates are invalid or lack the stage's agent.
   */
  create(
    compose: IComposeClient,
    stageProfile: IAgentProfile,
    stage: IStageConfig,
    cliLogger: Logger,
  ): Promise<ICliExecutor>;
  /**
   * Executor for a `mode: "local"` stage, running the pinned CLI the orchestrator installed
   * (`node_modules/.bin/<cli>`) on the host in the stage's `workspace`.
   *
   * @param stageProfile The variant with the stage's overrides applied (`deriveStageProfile`).
   * @throws Error when the stage's CLI has no host executor.
   */
  createLocal(
    stageProfile: IAgentProfile,
    stage: IStageConfig,
    workspace: HostStageWorkspace,
    cliLogger: Logger,
  ): Promise<ICliExecutor>;
}

/** Dispatches on the stage's resolved CLI. */
export class CliExecutorFactory implements ICliExecutorFactory {
  private readonly cliRuntimes: ICliRuntimeRegistry;
  private readonly agentCatalogs: IAgentCatalogProvider;
  private readonly rootDir: string;

  /** @param rootDir The orchestrator checkout, whose `node_modules/.bin` holds the CLIs host stages run. */
  constructor({
    cliRuntimes,
    agentCatalogs,
    rootDir,
  }: {
    cliRuntimes: ICliRuntimeRegistry;
    agentCatalogs: IAgentCatalogProvider;
    rootDir: string;
  }) {
    this.cliRuntimes = cliRuntimes;
    this.agentCatalogs = agentCatalogs;
    this.rootDir = rootDir;
  }

  /** Claude Code takes the stage root's frontmatter name and the depth of its subagent graph from the agent catalog. */
  async create(
    compose: IComposeClient,
    stageProfile: IAgentProfile,
    stage: IStageConfig,
    cliLogger: Logger,
  ): Promise<ICliExecutor> {
    const runtime = this.cliRuntimes.get(stage.cli);
    switch (stage.cli) {
      case CliType.Claude: {
        const catalog = await this.agentCatalogs.load(stageProfile.id);
        return new ClaudeCodeExecutor({
          compose,
          profile: stageProfile,
          stage,
          agentName: catalog.get(stage.agent).frontmatter.name,
          subagentDepth: catalog.depthFrom(stage.agent),
          runtime,
          logger: cliLogger,
        });
      }
      case CliType.Copilot:
        return new CopilotExecutor({ compose, profile: stageProfile, runtime, logger: cliLogger });
    }
  }

  /**
   * Claude Code also takes the frontmatter names of the agents the stage root can reach, which its permission
   * rules let it spawn, and runs the audit hooks of the orchestrator's `shared/hooks`.
   */
  async createLocal(
    stageProfile: IAgentProfile,
    stage: IStageConfig,
    workspace: HostStageWorkspace,
    cliLogger: Logger,
  ): Promise<ICliExecutor> {
    const runtime = this.cliRuntimes.get(stage.cli);
    const binary = hostCliBinary(this.rootDir, stage.cli);
    switch (stage.cli) {
      case CliType.Copilot:
        return new LocalCopilotExecutor({ profile: stageProfile, workspace, runtime, binary, logger: cliLogger });
      case CliType.Claude: {
        const catalog = await this.agentCatalogs.load(stageProfile.id);
        const nameOf = (fileId: string): string => catalog.get(fileId).frontmatter.name;
        return new LocalClaudeCodeExecutor({
          profile: stageProfile,
          stage,
          agentName: nameOf(stage.agent),
          subagentDepth: catalog.depthFrom(stage.agent),
          subagents: catalog.reachableFrom(stage.agent).slice(1).map(nameOf),
          workspace,
          runtime,
          binary,
          hooksDir: profileBuildPaths(this.rootDir, stageProfile.id).hooksDir,
          logger: cliLogger,
        });
      }
    }
  }
}
