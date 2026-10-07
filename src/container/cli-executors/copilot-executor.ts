import type { ResultPromise } from "execa";
import type { ICliRuntime } from "../../cli/cli-runtime";
import { DEFAULT_COPILOT_MODEL } from "../../cli/model-catalog";
import { CliType, type IAgentProfile } from "../../config/types";
import type { Logger } from "../../logger";
import type { ICliExecutor } from "../cli-executor-factory";
import type { IComposeClient } from "../compose-client";
import { MCP_CONFIG_CONTAINER_PATH } from "../setup/compose-overlay";
import type { ContainerExecResult } from "../types";
import { executeCliCommand, killActiveProcess } from "./shared-exec";

/** Dependencies of one stage's Copilot CLI executor. */
export interface CopilotExecutorDeps {
  readonly compose: IComposeClient;
  /** The variant with the stage's overrides applied (`deriveStageProfile`): agent, model, timeout, repo path. */
  readonly profile: IAgentProfile;
  /** The Copilot runtime: container layout and output decoder. */
  readonly runtime: ICliRuntime;
  readonly logger: Logger;
}

/**
 * Executes the Copilot CLI agent inside a running container.
 *
 * Handles:
 * - Building the `docker compose exec` command with the right flags
 * - Streaming stdout/stderr to the container logger in real-time
 * - Timeout enforcement and error recovery
 * - Active process tracking for graceful shutdown
 */
export class CopilotExecutor implements ICliExecutor {
  readonly cli = CliType.Copilot;
  activeProcess: ResultPromise | null = null;

  private readonly compose: IComposeClient;
  private readonly profile: IAgentProfile;
  private readonly runtime: ICliRuntime;
  private readonly logger: Logger;

  constructor({ compose, profile, runtime, logger }: CopilotExecutorDeps) {
    this.compose = compose;
    this.profile = profile;
    this.runtime = runtime;
    this.logger = logger;
  }

  /** Kill the active copilot process if one is running. */
  killActive(): void {
    killActiveProcess(this);
  }

  /**
   * Build CLI flags to control the bundled GitHub MCP server.
   *
   * - `false` → `--disable-builtin-mcps` (server disabled)
   * - `["tool1"]` → `--add-github-mcp-tool tool1` (only listed tools enabled)
   */
  private githubMcpFlags(): string[] {
    const tools = this.profile.githubMcpTools;
    if (tools === false) return ["--disable-builtin-mcps"];
    return tools.flatMap((t) => ["--add-github-mcp-tool", t]);
  }

  async run(prompt: string): Promise<ContainerExecResult> {
    return this.exec([], prompt);
  }

  /** Resume the last Copilot CLI session (`--continue`) with a continuation prompt. */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["--continue"], prompt);
  }

  /**
   * Runs Copilot CLI non-interactively with the shared flags, passing `prompt` on stdin.
   *
   * @param sessionFlags Flags that pick the session, e.g. `["--continue"]`; none starts a new one.
   */
  private async exec(sessionFlags: string[], prompt: string): Promise<ContainerExecResult> {
    const { layout } = this.runtime;
    const cliArgs = [
      layout.binary,
      "--additional-mcp-config",
      `@${MCP_CONFIG_CONTAINER_PATH}`,
      "--agent",
      this.profile.agentName,
      "--model",
      this.profile.model ?? DEFAULT_COPILOT_MODEL,
      ...this.githubMcpFlags(),
      "--log-level",
      "debug",
      "--log-dir",
      layout.debugLog.path,
      "--allow-all-tools",
      "--allow-all-paths",
      ...(layout.transcriptPath === null ? [] : ["--share", layout.transcriptPath]),
      ...sessionFlags,
    ];

    return executeCliCommand({
      compose: this.compose,
      args: ["-T", "--user", "vscode", "app", ...cliArgs],
      timeoutMs: this.profile.timeoutMs,
      logger: this.logger,
      tag: "copilot",
      tracker: this,
      decoder: this.runtime.createOutputDecoder(),
      input: prompt,
    });
  }
}
