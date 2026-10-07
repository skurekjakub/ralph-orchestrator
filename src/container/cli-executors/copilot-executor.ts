import type { ResultPromise } from "execa";
import type { ICliRuntime } from "../../cli/cli-runtime";
import { COPILOT_CONTAINER_LAYOUT } from "../../cli/copilot/copilot-layout";
import { DEFAULT_COPILOT_MODEL } from "../../cli/model-catalog";
import { CliType, type IAgentProfile } from "../../config/types";
import type { Logger } from "../../logger";
import type { ICliExecutor } from "../cli-executor-factory";
import type { IComposeClient } from "../compose-client";
import { MCP_CONFIG_CONTAINER_PATH } from "../setup/compose-overlay";
import type { ContainerExecResult } from "../types";
import { executeCliCommand, killActiveProcess, writePromptFile } from "./shared-exec";

/** The prompt file inside the container, read with `$(cat …)` so the exec command line stays free of prompt text. */
const PROMPT_FILE = "/workspace/.ralph/prompt.txt";

/** Dependencies of one stage's Copilot CLI executor. */
export interface CopilotExecutorDeps {
  readonly compose: IComposeClient;
  /** The variant with the stage's overrides applied (`deriveStageProfile`): agent, model, timeout, repo path. */
  readonly profile: IAgentProfile;
  /** The Copilot runtime, for its output decoder. */
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
    return this.exec(["-p"], prompt);
  }

  /**
   * Resume the previous Copilot CLI session with a continuation prompt.
   *
   * Uses `--continue` to resume the last session, preserving conversation
   * context. The continuation prompt is passed via `--prompt`.
   */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["--continue", "--prompt"], prompt);
  }

  /**
   * Internal: build and execute a Copilot CLI command with shared flags.
   *
   * The prompt is written to a file on the host and read inside the container
   * via `$(cat /workspace/.ralph/prompt.txt)`, keeping the `docker compose exec`
   * command line free of large, unescapable text.
   *
   * @param promptFlags Flag(s) preceding the prompt value (e.g. `["-p"]` or `["--continue", "--prompt"]`).
   * @param prompt The full prompt text.
   */
  private async exec(promptFlags: string[], prompt: string): Promise<ContainerExecResult> {
    writePromptFile(this.profile.repoPath, prompt);
    const layout = COPILOT_CONTAINER_LAYOUT;

    const shellCmd = [
      "exec",
      "copilot",
      "--config-dir",
      layout.configDir,
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
      "--experimental",
      "--allow-all-tools",
      "--allow-all-paths",
      "--share",
      layout.transcriptPath,
      ...promptFlags,
      `"$(cat ${PROMPT_FILE})"`,
    ].join(" ");

    return executeCliCommand({
      compose: this.compose,
      args: ["--user", "vscode", "app", "sh", "-c", shellCmd],
      timeoutMs: this.profile.timeoutMs,
      logger: this.logger,
      tag: "copilot",
      tracker: this,
      decoder: this.runtime.createOutputDecoder(),
    });
  }
}
