import { ExecaError, type ResultPromise } from "execa";
import type { AgentProfile } from "../config.js";
import type { ContainerExecResult } from "./types.js";
import type { Logger } from "../logger.js";
import type { ComposeClient } from "./compose-client.js";

/**
 * Executes the Copilot CLI agent inside a running container.
 *
 * Handles:
 * - Building the `docker compose exec` command with the right flags
 * - Streaming stdout/stderr to the container logger in real-time
 * - Timeout enforcement and error recovery
 * - Active process tracking for graceful shutdown
 */
export class CopilotExecutor {
  private activeProcess: ResultPromise | null = null;

  constructor(
    private readonly compose: ComposeClient,
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
   * Execute the Copilot CLI with the given prompt.
   *
   * Streams stdout/stderr to the container logger with `[copilot]` prefix.
   *
   * @param prompt The fully-built prompt string to pass to the Copilot CLI.
   * @returns Raw {@link ContainerExecResult} with exit code and captured output.
   */
  async run(prompt: string): Promise<ContainerExecResult> {
    const args = [
      "--user", "vscode",
      "app",
      "copilot",
      "--agent", this.profile.agentName,
      "--model", "claude-opus-4.6",
      "--experimental",
      "--yolo",
      "-p", prompt,
    ];

    try {
      this.activeProcess = this.compose.execWithTimeout(
        args,
        this.profile.timeoutMs,
      ) as ResultPromise;

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      if (this.activeProcess.stdout) {
        let stdoutBuffer = "";
        this.activeProcess.stdout.on("data", (chunk: Buffer | string) => {
          const text = String(chunk);
          stdoutChunks.push(text);
          stdoutBuffer += text;
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.containerLogger.info(`[copilot] ${trimmed}`);
            }
          }
        });
      }

      if (this.activeProcess.stderr) {
        let stderrBuffer = "";
        this.activeProcess.stderr.on("data", (chunk: Buffer | string) => {
          const text = String(chunk);
          stderrChunks.push(text);
          stderrBuffer += text;
          const lines = stderrBuffer.split("\n");
          stderrBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.containerLogger.warn(`[copilot] ${trimmed}`);
            }
          }
        });
      }

      const result = await this.activeProcess;
      this.activeProcess = null;

      return {
        exitCode: result.exitCode ?? 0,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
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
