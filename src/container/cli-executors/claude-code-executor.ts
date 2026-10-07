import { randomUUID } from "node:crypto";
import type { ResultPromise } from "execa";
import { CLAUDE_CONTAINER_BINARY } from "../../cli/claude/claude-layout";
import { CLAUDE_BUILTIN_TOOLS, CLAUDE_SUBAGENT_TOOL } from "../../cli/claude/claude-tools";
import type { ICliRuntime } from "../../cli/cli-runtime";
import { CliType, type IAgentProfile, type IStageConfig } from "../../config/types";
import type { Logger } from "../../logger";
import type { ICliExecutor } from "../cli-executor-factory";
import type { IComposeClient } from "../compose-client";
import { MCP_CONFIG_CONTAINER_PATH } from "../setup/compose-overlay";
import type { ContainerExecResult } from "../types";
import { executeCliCommand, killActiveProcess, writePromptFile } from "./shared-exec";

/** Permission mode of container sessions: the container, egress proxy, sidecar tool filter, `--tools` cap and managed hooks are the boundary. */
const CONTAINER_PERMISSION_MODE = "bypassPermissions";

/** Dependencies of one stage's Claude Code executor. */
export interface ClaudeCodeExecutorDeps {
  readonly compose: IComposeClient;
  /** The variant with the stage's overrides applied (`deriveStageProfile`): repo path, model, timeout. */
  readonly profile: IAgentProfile;
  /** The stage: effort, budget cap and whether the result gate is on. */
  readonly stage: IStageConfig;
  /** Frontmatter `name` of the stage's root agent, which `--agent` resolves. */
  readonly agentName: string;
  /** Length of the longest subagent chain below the stage's root agent; 0 when it spawns none. */
  readonly subagentDepth: number;
  /** The Claude Code runtime: container layout and output decoder. */
  readonly runtime: ICliRuntime;
  readonly logger: Logger;
}

/**
 * Runs one pipeline stage with Claude Code inside the running `app` container.
 *
 * The CLI runs headless (`-p`) as the `vscode` user, takes its prompt on stdin from the host prompt file and
 * prints stream-json, which the runtime's decoder turns into log lines and the agent's text. Each `run`
 * starts a session with a fresh id; `continueSession` resumes that exact session. The `--tools` list caps the
 * built-in tools, adding `Agent` and the spawn depth only for a stage root with subagents; the agents'
 * frontmatter narrows the tools per agent. With `requireResultBlock`, the managed `Stop` hook keeps the
 * session going until the agent prints its result block.
 */
export class ClaudeCodeExecutor implements ICliExecutor {
  readonly cli = CliType.Claude;
  activeProcess: ResultPromise | null = null;

  private readonly compose: IComposeClient;
  private readonly profile: IAgentProfile;
  private readonly stage: IStageConfig;
  private readonly agentName: string;
  private readonly subagentDepth: number;
  private readonly runtime: ICliRuntime;
  private readonly logger: Logger;
  private sessionId: string | undefined;

  constructor({ compose, profile, stage, agentName, subagentDepth, runtime, logger }: ClaudeCodeExecutorDeps) {
    this.compose = compose;
    this.profile = profile;
    this.stage = stage;
    this.agentName = agentName;
    this.subagentDepth = subagentDepth;
    this.runtime = runtime;
    this.logger = logger;
  }

  /** Kill the active claude process if one is running. */
  killActive(): void {
    killActiveProcess(this);
  }

  /** Start a new session with `prompt`. */
  async run(prompt: string): Promise<ContainerExecResult> {
    this.sessionId = randomUUID();
    return this.exec(prompt, ["--session-id", this.sessionId]);
  }

  /** Resume the session `run` started with `prompt`, or start one when there is none. */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    if (this.sessionId === undefined) return this.run(prompt);
    return this.exec(prompt, ["--resume", this.sessionId]);
  }

  private async exec(prompt: string, sessionArgs: readonly string[]): Promise<ContainerExecResult> {
    const promptPath = writePromptFile(this.profile.repoPath, prompt);
    const { model } = this.profile;
    const { effort, maxBudgetUsd, requireResultBlock } = this.stage;
    const spawnsSubagents = this.subagentDepth > 0;
    const tools = spawnsSubagents ? [...CLAUDE_BUILTIN_TOOLS, CLAUDE_SUBAGENT_TOOL] : [...CLAUDE_BUILTIN_TOOLS];

    const args = [
      "-T",
      "--user",
      "vscode",
      "-e",
      `RALPH_REQUIRE_RESULT_BLOCK=${requireResultBlock ? "1" : "0"}`,
      ...(spawnsSubagents ? ["-e", `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=${this.subagentDepth}`] : []),
      "app",
      CLAUDE_CONTAINER_BINARY,
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--agent",
      this.agentName,
      ...(model === undefined ? [] : ["--model", model]),
      ...(effort === undefined ? [] : ["--effort", effort]),
      ...(maxBudgetUsd === undefined ? [] : ["--max-budget-usd", String(maxBudgetUsd)]),
      "--setting-sources",
      this.profile.claude.loadRepoInstructions ? "user,project" : "user",
      "--mcp-config",
      MCP_CONFIG_CONTAINER_PATH,
      "--strict-mcp-config",
      "--permission-mode",
      CONTAINER_PERMISSION_MODE,
      "--tools",
      tools.join(","),
      ...sessionArgs,
      "--debug-file",
      this.runtime.layout.debugLog.path,
    ];

    return executeCliCommand({
      compose: this.compose,
      args,
      timeoutMs: this.profile.timeoutMs,
      logger: this.logger,
      tag: "claude",
      tracker: this,
      decoder: this.runtime.createOutputDecoder(),
      inputFile: promptPath,
    });
  }
}
