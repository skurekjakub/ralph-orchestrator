import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResultPromise } from "execa";
import type { IAgentProfile } from "../../config/types.js";
import { DEFAULT_COPILOT_MODEL } from "../../cli/model-catalog.js";
import { COPILOT_CONTAINER_LAYOUT } from "../../cli/copilot/copilot-layout.js";
import type { ContainerExecResult, CliPaths } from "../types.js";
import type { Logger } from "../../logger.js";
import type { IComposeClient } from "../compose-client.js";
import { ICliExecutor } from "../cli-executor-factory.js";
import { executeCliCommand, killActiveProcess } from "./shared-exec.js";

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
  /** Path inside the container where the MCP server config is mounted. */
  static readonly MCP_CONFIG_PATH = "/workspace/.ralph/mcp-config.json";

  /** Prompt file path inside the container — used with `$(cat ...)` to avoid passing large prompts as CLI args. */
  static readonly PROMPT_FILE = "/workspace/.ralph/prompt.txt";

  activeProcess: ResultPromise | null = null;

  /** Filesystem paths specific to the Copilot CLI. */
  readonly paths: CliPaths = {
    configDir: COPILOT_CONTAINER_LAYOUT.configDir,
    writableDirs: COPILOT_CONTAINER_LAYOUT.writableDirs,
    transcriptPath: COPILOT_CONTAINER_LAYOUT.transcriptPath,
    logDir: COPILOT_CONTAINER_LAYOUT.debugLog.path,
  };

  constructor(
    private readonly compose: IComposeClient,
    private readonly profile: IAgentProfile,
    private readonly containerLogger: Logger,
  ) {}

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
   * Write the prompt to a file on the host, visible inside the container via
   * the target-repo bind mount (`${TARGET_REPO_PATH}:/workspace`).
   *
   * Avoids passing multi-KB prompts (with shell metacharacters, quotes,
   * newlines) as `docker compose exec` CLI arguments.
   */
  private writePromptFile(prompt: string): void {
    const dir = join(this.profile.repoPath, ".ralph");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.txt"), prompt, "utf-8");
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
    this.writePromptFile(prompt);

    const shellCmd = [
      "exec",
      "copilot",
      "--config-dir",
      COPILOT_CONTAINER_LAYOUT.configDir,
      "--additional-mcp-config",
      `@${CopilotExecutor.MCP_CONFIG_PATH}`,
      "--agent",
      this.profile.agentName,
      "--model",
      this.profile.model ?? DEFAULT_COPILOT_MODEL,
      ...this.githubMcpFlags(),
      "--log-level",
      "debug",
      "--log-dir",
      COPILOT_CONTAINER_LAYOUT.debugLog.path,
      "--experimental",
      "--allow-all-tools",
      "--allow-all-paths",
      "--share",
      COPILOT_CONTAINER_LAYOUT.transcriptPath,
      ...promptFlags,
      `"$(cat ${CopilotExecutor.PROMPT_FILE})"`,
    ].join(" ");

    const args = ["--user", "vscode", "app", "sh", "-c", shellCmd];

    return executeCliCommand(this.compose, args, this.profile.timeoutMs, this.containerLogger, "copilot", this);
  }
}
