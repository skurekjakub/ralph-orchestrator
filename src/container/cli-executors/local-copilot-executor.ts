import { execa, ExecaError, type ResultPromise } from "execa";
import type { IAgentProfile } from "../../config/types.js";
import { DEFAULT_MODEL } from "../../config/constants.js";
import type { ContainerExecResult, CliPaths } from "../types.js";
import type { Logger } from "../../logger.js";
import type { ICliExecutor } from "../cli-executor-factory.js";
import { StreamCapture } from "../stream-capture.js";

/**
 * Executes the Copilot CLI directly on the host machine (no Docker).
 *
 * Used for `mode: "local"` pipeline stages that run the CLI outside
 * the container — e.g. a reviewer stage that doesn't need Docker
 * infrastructure. Requires the `copilot` CLI to be installed and
 * available on `PATH`.
 */
export class LocalCopilotExecutor implements ICliExecutor {
  activeProcess: ResultPromise | null = null;

  readonly paths: CliPaths;

  constructor(
    private readonly profile: IAgentProfile,
    private readonly cwd: string,
    private readonly logger: Logger,
  ) {
    this.paths = {
      configDir: ".ralph",
      writableDirs: [".ralph/logs", ".ralph/logs/cli-debug", ".ralph/session-state"],
      transcriptPath: ".ralph/logs/session-transcript.md",
      logDir: ".ralph/logs/cli-debug",
    };
  }

  killActive(): void {
    if (this.activeProcess) {
      try {
        this.activeProcess.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.activeProcess = null;
    }
  }

  /**
   * Build CLI flags to control the bundled GitHub MCP server.
   */
  private githubMcpFlags(): string[] {
    const tools = this.profile.githubMcpTools;
    if (tools === false) return ["--disable-builtin-mcps"];
    return tools.flatMap((t) => ["--add-github-mcp-tool", t]);
  }

  async run(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["-p", prompt]);
  }

  async continueSession(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["--continue", "--prompt", prompt]);
  }

  private async exec(promptArgs: string[]): Promise<ContainerExecResult> {
    const args = [
      "--agent", this.profile.agentName,
      "--model", this.profile.model ?? DEFAULT_MODEL,
      ...this.githubMcpFlags(),
      "--log-level", "debug",
      "--log-dir", this.paths.logDir,
      "--experimental",
      "--allow-all-tools",
      "--allow-all-paths",
      ...promptArgs,
    ];

    let capture: StreamCapture | undefined;
    try {
      this.activeProcess = execa("copilot", args, {
        cwd: this.cwd,
        timeout: this.profile.timeoutMs,
        reject: true,
      });
      capture = new StreamCapture(this.activeProcess, this.logger, "local-copilot");
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
          stdout: capture?.stdout ?? err.stdout ?? "",
          stderr: capture?.stderr ?? err.stderr ?? "",
          timedOut: err.timedOut ?? false,
        };
      }

      throw err;
    }
  }
}
