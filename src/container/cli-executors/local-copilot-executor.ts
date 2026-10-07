import { execa, type ResultPromise } from "execa";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ICliRuntime } from "../../cli/cli-runtime";
import { githubMcpArgs } from "../../cli/copilot/copilot-args";
import { copilotAgentFileName } from "../../cli/copilot/copilot-agent-writer";
import { hostCliEnv } from "../../cli/host-env";
import { DEFAULT_COPILOT_MODEL } from "../../cli/model-catalog";
import type { IAgentProfile } from "../../config/types";
import type { Logger } from "../../logger";
import type { ICliExecutor } from "../cli-executor-factory";
import type { ContainerExecResult, HostStageWorkspace } from "../types";
import { executeCliCommand, killActiveProcess } from "./shared-exec";

/** Dependencies of one host stage's Copilot CLI executor. */
export interface LocalCopilotExecutorDeps {
  /** The variant with the stage's overrides applied (`deriveStageProfile`): agent, model, timeout. */
  readonly profile: IAgentProfile;
  /** Where the stage runs; its agents and skills are already rendered into the workspace's `.github/`. */
  readonly workspace: HostStageWorkspace;
  /** The Copilot runtime: credentials and output decoder. */
  readonly runtime: ICliRuntime;
  /** The pinned Copilot CLI the orchestrator installed (`node_modules/.bin/copilot`). */
  readonly binary: string;
  readonly logger: Logger;
}

/**
 * Runs a `mode: "local"` stage with the Copilot CLI on the host, inside the stage's own workspace.
 *
 * The CLI runs in `workspace.cwd`, where it discovers the stage's agents and skills in `.github/`, with its home
 * (`--config-dir`) and debug logs in the workspace, so nothing it writes lands in the orchestrator checkout and
 * the developer's own Copilot config, agents and MCP servers stay out. Its environment holds only `PATH`, `HOME`,
 * `LANG` and `GH_TOKEN`: no other orchestrator secret reaches its tools.
 */
export class LocalCopilotExecutor implements ICliExecutor {
  activeProcess: ResultPromise | null = null;

  private readonly profile: IAgentProfile;
  private readonly workspace: HostStageWorkspace;
  private readonly runtime: ICliRuntime;
  private readonly binary: string;
  private readonly logger: Logger;

  constructor({ profile, workspace, runtime, binary, logger }: LocalCopilotExecutorDeps) {
    this.profile = profile;
    this.workspace = workspace;
    this.runtime = runtime;
    this.binary = binary;
    this.logger = logger;
  }

  /** Kill the active copilot process if one is running. */
  killActive(): void {
    killActiveProcess(this);
  }

  /** Start a new session with `prompt`. */
  async run(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["-p", prompt]);
  }

  /** Resume the last session of the stage's CLI home with a continuation prompt. */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["--continue", "--prompt", prompt]);
  }

  /**
   * @throws Error when the stage root's agent was not rendered into the workspace.
   */
  private async exec(promptArgs: readonly string[]): Promise<ContainerExecResult> {
    const { workspace } = this;
    const rootAgentPath = join(workspace.agentsOutDir, copilotAgentFileName(this.profile.agentName));
    if (!existsSync(rootAgentPath)) {
      throw new Error(
        `Rendered Copilot agent ${rootAgentPath} not found; the stage's agents must be rendered before it runs`,
      );
    }
    for (const dir of [workspace.cwd, workspace.cliHomeDir, workspace.logDir]) mkdirSync(dir, { recursive: true });

    const args = [
      "--agent",
      this.profile.agentName,
      "--model",
      this.profile.model ?? DEFAULT_COPILOT_MODEL,
      ...githubMcpArgs(this.profile.githubMcpTools),
      "--config-dir",
      workspace.cliHomeDir,
      "--log-level",
      "debug",
      "--log-dir",
      join(workspace.logDir, "cli-debug"),
      "--experimental",
      "--allow-all-tools",
      "--allow-all-paths",
      ...promptArgs,
    ];
    const env = hostCliEnv(
      process.env,
      this.runtime.credentials.required.map(({ envVar }) => envVar),
    );

    return executeCliCommand({
      spawn: () =>
        execa(this.binary, args, { cwd: workspace.cwd, timeout: this.profile.timeoutMs, extendEnv: false, env }),
      logger: this.logger,
      tag: "local-copilot",
      tracker: this,
      decoder: this.runtime.createOutputDecoder(),
    });
  }
}
