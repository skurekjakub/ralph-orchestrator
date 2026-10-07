import { execa, type ResultPromise } from "execa";
import { join } from "node:path";
import type { ICliRuntime } from "../../cli/cli-runtime";
import { githubMcpArgs } from "../../cli/copilot/copilot-args";
import { copilotAgentFileName } from "../../cli/copilot/copilot-agent-writer";
import { copilotHostEnv } from "../../cli/copilot/copilot-host-env";
import { DEFAULT_COPILOT_MODEL } from "../../cli/model-catalog";
import type { IAgentProfile } from "../../config/types";
import type { Logger } from "../../logger";
import type { ICliExecutor } from "../cli-executor";
import type { ContainerExecResult, HostStageWorkspace } from "../types";
import { prepareHostStage } from "./host-stage";
import { executeCliCommand, killActiveProcess } from "./shared-exec";

/** Dependencies of one host stage's Copilot CLI executor. */
export interface LocalCopilotExecutorDeps {
  /** The variant with the stage's overrides applied (`deriveStageProfile`): agent, model, timeout. */
  readonly stageProfile: IAgentProfile;
  /** Where the stage runs; its agents and skills are already rendered into the workspace's `.github/`. */
  readonly workspace: HostStageWorkspace;
  /** The Copilot runtime: credentials and output decoder. */
  readonly runtime: ICliRuntime;
  /** The pinned Copilot CLI the orchestrator installed (`node_modules/.bin/copilot`). */
  readonly binary: string;
  readonly containerLogger: Logger;
}

/**
 * Runs a `mode: "local"` stage with the Copilot CLI on the host, inside the stage's own workspace.
 *
 * The CLI runs in `workspace.cwd`, a git repository of its own, where it discovers the stage's agents and skills
 * in `.github/` and none of the orchestrator checkout's. Its home (`COPILOT_HOME`) and debug logs are in the
 * workspace, so nothing it writes lands in the checkout and the developer's own Copilot config, agents and MCP
 * servers stay out; auto-update is off. It may reach only its working directory and, with one `--add-dir` each,
 * `workspace.additionalDirs`. Its environment holds only `PATH`, `HOME`, `LANG` and `GH_TOKEN`: no other
 * orchestrator secret reaches its tools.
 */
export class LocalCopilotExecutor implements ICliExecutor {
  activeProcess: ResultPromise | null = null;

  private readonly profile: IAgentProfile;
  private readonly workspace: HostStageWorkspace;
  private readonly runtime: ICliRuntime;
  private readonly binary: string;
  private readonly logger: Logger;

  constructor({ stageProfile, workspace, runtime, binary, containerLogger }: LocalCopilotExecutorDeps) {
    this.profile = stageProfile;
    this.workspace = workspace;
    this.runtime = runtime;
    this.binary = binary;
    this.logger = containerLogger;
  }

  /** Kill the active copilot process if one is running. */
  killActive(): void {
    killActiveProcess(this);
  }

  /** Start a new session with `prompt`. */
  async run(prompt: string): Promise<ContainerExecResult> {
    return this.exec([], prompt);
  }

  /** Resume the last session of the stage's CLI home (`--continue`) with a continuation prompt. */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["--continue"], prompt);
  }

  /**
   * Runs Copilot CLI non-interactively in the stage's workspace, passing `prompt` on stdin.
   *
   * @param sessionFlags Flags that pick the session, e.g. `["--continue"]`; none starts a new one.
   * @throws Error when the stage root's agent was not rendered into the workspace, or the workspace cannot be
   *   prepared.
   */
  private async exec(sessionFlags: readonly string[], prompt: string): Promise<ContainerExecResult> {
    const { workspace } = this;
    const env = await prepareHostStage(workspace, {
      rootAgentPath: join(workspace.agentsOutDir, copilotAgentFileName(this.profile.agentName)),
      runtime: this.runtime,
      env: copilotHostEnv(workspace.cliHomeDir),
    });

    const args = [
      "--agent",
      this.profile.agentName,
      "--model",
      this.profile.model ?? DEFAULT_COPILOT_MODEL,
      ...githubMcpArgs(this.profile.githubMcpTools),
      "--log-level",
      "debug",
      "--log-dir",
      join(workspace.logDir, "cli-debug"),
      "--experimental",
      "--allow-all-tools",
      ...workspace.additionalDirs.flatMap((dir) => ["--add-dir", dir]),
      ...sessionFlags,
    ];

    return executeCliCommand({
      spawn: () =>
        execa(this.binary, args, {
          cwd: workspace.cwd,
          timeout: this.profile.timeoutMs,
          extendEnv: false,
          env,
          input: prompt,
        }),
      logger: this.logger,
      tag: "local-copilot",
      tracker: this,
      decoder: this.runtime.createOutputDecoder(),
    });
  }
}
