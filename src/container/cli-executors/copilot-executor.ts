import { ExecaError, type ResultPromise } from "execa";
import type { AgentProfile } from "../../config.js";
import { DEFAULT_MODEL } from "../../config.js";
import type { ContainerExecResult, CliExecutor } from "../types.js";
import type { Logger } from "../../logger.js";
import type { IComposeClient } from "../compose-client.js";
import { StreamCapture } from "../stream-capture.js";

/**
 * Executes the Copilot CLI agent inside a running container.
 *
 * Handles:
 * - Building the `docker compose exec` command with the right flags
 * - Streaming stdout/stderr to the container logger in real-time
 * - Timeout enforcement and error recovery
 * - Active process tracking for graceful shutdown
 */
export class CopilotExecutor implements CliExecutor {
  private activeProcess: ResultPromise | null = null;

  constructor(
    private readonly compose: IComposeClient,
    private readonly profile: AgentProfile,
    private readonly containerLogger: Logger,
  ) {}

  /** Kill the active copilot process if one is running. */
  killActive(): void {
    if (this.activeProcess) {
      try {
        this.activeProcess.kill("SIGTERM");
      } catch {
        // already terminated
      }
      this.activeProcess = null;
    }
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

  /**
   * Execute the Copilot CLI with the given prompt.
   *
   * Streams stdout/stderr to the container logger with `[copilot]` prefix.
   *
   * @param prompt The fully-built prompt string to pass to the Copilot CLI.
   * @returns Raw {@link ContainerExecResult} with exit code and captured output.
   */
  /** Path inside the container where the session transcript is saved. */
  static readonly TRANSCRIPT_PATH = "/workspace/.ralph/logs/session-transcript.md";

  /** Path inside the container where the MCP server config is mounted. */
  static readonly MCP_CONFIG_PATH = "/workspace/.ralph/mcp-config.json";

  /** Copilot CLI config directory inside the container. */
  static readonly CONFIG_DIR = "/workspace/.ralph";

  /** Copilot CLI debug log directory. */
  static readonly LOG_DIR = "/workspace/.ralph/logs/cli-debug";

  /** Subdirectories the CLI needs to create at runtime (must be writable by vscode). */
  static readonly WRITABLE_DIRS = [
    "/workspace/.ralph/logs",
    "/workspace/.ralph/logs/cli-debug",
    "/workspace/.ralph/session-state",
  ] as const;

  async run(prompt: string): Promise<ContainerExecResult> {
    const args = [
      "--user", "vscode",
      "app",
      "copilot",
      "--config-dir", CopilotExecutor.CONFIG_DIR,
      "--additional-mcp-config", `@${CopilotExecutor.MCP_CONFIG_PATH}`,
      "--agent", this.profile.agentName,
      "--model", this.profile.model ?? DEFAULT_MODEL,
      ...this.githubMcpFlags(),
      "--log-level", "debug",
      "--log-dir", CopilotExecutor.LOG_DIR,
      "--experimental",
      "--allow-all-tools",
      "--allow-all-paths",
      "--share", CopilotExecutor.TRANSCRIPT_PATH,
      "-p", prompt,
    ];

    try {
      this.activeProcess = this.compose.execWithTimeout(
        args,
        this.profile.timeoutMs,
      ) as ResultPromise;

      const capture = new StreamCapture(this.activeProcess, this.containerLogger, "copilot");

      const result = await this.activeProcess;
      this.activeProcess = null;

      return {
        exitCode: result.exitCode ?? 0,
        stdout: capture.stdout,
        stderr: capture.stderr,
        timedOut: false,
      };
    } catch (err: unknown) {
      this.activeProcess = null;

      if (err instanceof ExecaError) {
        return {
          exitCode: err.exitCode ?? 1,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
          timedOut: err.timedOut ?? false,
        };
      }

      throw err;
    }
  }
}
