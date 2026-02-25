import type { ResultPromise } from "execa";
import type { IAgentProfile } from "../../config.js";
import type { ContainerExecResult, CliPaths } from "../types.js";
import type { Logger } from "../../logger.js";
import type { IComposeClient } from "../compose-client.js";
import { ICliExecutor } from "../cli-executor-factory.js";
import { executeCliCommand, killActiveProcess } from "./shared-exec.js";

/**
 * Executes the Claude Code CLI inside a running container.
 *
 * Invocation: `claude -p <prompt> --dangerously-skip-permissions [--model <model>]`
 *
 * Handles:
 * - Building the `docker compose exec` command with Claude Code flags
 * - Streaming stdout/stderr to the container logger in real-time
 * - Timeout enforcement and error recovery
 * - Active process tracking for graceful shutdown
 */
export class ClaudeCodeExecutor implements ICliExecutor {
  activeProcess: ResultPromise | null = null;

  /** Filesystem paths specific to the Claude Code CLI. */
  readonly paths: CliPaths = {
    configDir: "/workspace/.ralph",
    writableDirs: [
      "/workspace/.ralph/logs",
      "/workspace/.ralph/logs/cli-debug",
      "/workspace/.ralph/session-state",
    ],
    transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
    logDir: "/workspace/.ralph/logs/cli-debug",
  };

  constructor(
    private readonly compose: IComposeClient,
    private readonly profile: IAgentProfile,
    private readonly containerLogger: Logger,
  ) {}

  /** Kill the active claude process if one is running. */
  killActive(): void {
    killActiveProcess(this);
  }

  /**
   * Execute Claude Code CLI with the given prompt.
   *
   * Streams stdout/stderr to the container logger with `[claude]` prefix.
   *
   * @param prompt The fully-built prompt string to pass to Claude Code.
   * @returns Raw {@link ContainerExecResult} with exit code and captured output.
   */
  async run(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["-p", prompt]);
  }

  /**
   * Resume the previous Claude Code session with a continuation prompt.
   *
   * Uses `--continue` to resume the last session, preserving conversation context.
   */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["--continue", "-p", prompt]);
  }

  /**
   * Internal: build and execute a Claude Code command with shared flags.
   *
   * @param promptArgs CLI-specific args (e.g. `-p <prompt>` or `--continue -p <prompt>`)
   */
  private async exec(promptArgs: string[]): Promise<ContainerExecResult> {
    const args = [
      "--user", "vscode",
      "app",
      "claude",
      ...promptArgs,
      "--dangerously-skip-permissions",
      "--mcp-config", "/workspace/.ralph/mcp-config.json",
      "--strict-mcp-config",
    ];

    if (this.profile.model) {
      args.push("--model", this.profile.model);
    }

    return executeCliCommand(
      this.compose, args, this.profile.timeoutMs, this.containerLogger, "claude", this,
    );
  }
}
