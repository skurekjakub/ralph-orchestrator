import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResultPromise } from "execa";
import type { IAgentProfile } from "../../config/types";
import type { ContainerExecResult, CliPaths } from "../types";
import type { Logger } from "../../logger";
import type { IComposeClient } from "../compose-client";
import { ICliExecutor } from "../cli-executor-factory";
import { executeCliCommand, killActiveProcess } from "./shared-exec";

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
  /** Prompt file path inside the container — avoids passing large prompts as CLI args. */
  static readonly PROMPT_FILE = "/workspace/.ralph/prompt.txt";

  activeProcess: ResultPromise | null = null;

  /** Filesystem paths specific to the Claude Code CLI. */
  readonly paths: CliPaths = {
    configDir: "/workspace/.ralph",
    writableDirs: ["/workspace/.ralph/logs", "/workspace/.ralph/logs/cli-debug", "/workspace/.ralph/session-state"],
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
    return this.exec(["-p"], prompt);
  }

  /**
   * Resume the previous Claude Code session with a continuation prompt.
   *
   * Uses `--continue` to resume the last session, preserving conversation context.
   */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["--continue", "-p"], prompt);
  }

  /**
   * Write the prompt to a file on the host, visible inside the container via
   * the target-repo bind mount.
   */
  private writePromptFile(prompt: string): void {
    const dir = join(this.profile.repoPath, ".ralph");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "prompt.txt"), prompt, "utf-8");
  }

  /**
   * Internal: build and execute a Claude Code command with shared flags.
   *
   * The prompt is written to a file and read inside the container via
   * `$(cat /workspace/.ralph/prompt.txt)`.
   *
   * @param promptFlags Flag(s) preceding the prompt value (e.g. `["-p"]` or `["--continue", "-p"]`).
   * @param prompt The full prompt text.
   */
  private async exec(promptFlags: string[], prompt: string): Promise<ContainerExecResult> {
    this.writePromptFile(prompt);

    const cliArgs = [
      "claude",
      ...promptFlags,
      `"$(cat ${ClaudeCodeExecutor.PROMPT_FILE})"`,
      "--dangerously-skip-permissions",
      "--mcp-config",
      "/workspace/.ralph/mcp-config.json",
      "--strict-mcp-config",
    ];

    if (this.profile.model) {
      cliArgs.push("--model", this.profile.model);
    }

    const shellCmd = `exec ${cliArgs.join(" ")}`;

    const args = ["--user", "vscode", "app", "sh", "-c", shellCmd];

    return executeCliCommand(this.compose, args, this.profile.timeoutMs, this.containerLogger, "claude", this);
  }
}
