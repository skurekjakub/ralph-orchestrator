import type { ResultPromise } from "execa";
import { CLAUDE_SESSION_SETTINGS_PATH } from "../../cli/claude/claude-layout";
import {
  ClaudePermissionMode,
  ClaudeSessionIds,
  ClaudeSettingSources,
  claudeSessionArgs,
  claudeSessionEnv,
  claudeSessionTools,
} from "../../cli/claude/claude-session";
import { CLAUDE_BUILTIN_TOOLS } from "../../cli/claude/claude-tools";
import type { ICliRuntime } from "../../cli/cli-runtime";
import type { IAgentProfile, IStageConfig } from "../../config/types";
import type { Logger } from "../../logger";
import type { ICliExecutor } from "../cli-executor-factory";
import type { IComposeClient } from "../compose-client";
import { MCP_CONFIG_CONTAINER_PATH } from "../setup/compose-overlay";
import type { ContainerExecResult } from "../types";
import { executeCliCommand, killActiveProcess } from "./shared-exec";

/** Dependencies of one stage's Claude Code executor. */
export interface ClaudeCodeExecutorDeps {
  readonly compose: IComposeClient;
  /** The variant with the stage's overrides applied (`deriveStageProfile`): repo path, model, timeout. */
  readonly profile: IAgentProfile;
  /** The stage: effort and whether the result gate is on. */
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
 * The CLI runs headless (`-p`) as the `vscode` user, takes its prompt on stdin and prints stream-json, which the
 * runtime's decoder turns into log lines and the agent's text. Each `run` starts a session with a fresh id;
 * `continueSession` resumes that exact session. Every session loads Ralph's hooks and attribution policy from the
 * read-only `--settings` file and bypasses permission prompts: the container, egress proxy, sidecar tool filter,
 * `--tools` cap and Ralph's hooks are the boundary. The `--tools` list caps the built-in tools, adding `Agent` and
 * the spawn depth only for a stage root with subagents; the agents' frontmatter narrows the tools per agent. With
 * `requireResultBlock`, Ralph's `Stop` hook keeps the session going until the agent prints its result block.
 */
export class ClaudeCodeExecutor implements ICliExecutor {
  activeProcess: ResultPromise | null = null;

  private readonly compose: IComposeClient;
  private readonly profile: IAgentProfile;
  private readonly stage: IStageConfig;
  private readonly agentName: string;
  private readonly subagentDepth: number;
  private readonly runtime: ICliRuntime;
  private readonly logger: Logger;
  private readonly sessions = new ClaudeSessionIds();

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
    return this.exec(prompt, this.sessions.start());
  }

  /** Resume the session `run` started with `prompt`, or start one when there is none. */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    const resume = this.sessions.resume();
    return resume === undefined ? this.run(prompt) : this.exec(prompt, resume);
  }

  private async exec(prompt: string, sessionArgs: readonly string[]): Promise<ContainerExecResult> {
    const { effort, requireResultBlock } = this.stage;
    const env = claudeSessionEnv(requireResultBlock, this.subagentDepth);
    const cliArgs = claudeSessionArgs(
      {
        agentName: this.agentName,
        model: this.profile.model,
        effort,
        settingSources: this.profile.claude.loadRepoInstructions
          ? ClaudeSettingSources.UserAndProject
          : ClaudeSettingSources.User,
        settingsPath: CLAUDE_SESSION_SETTINGS_PATH,
        mcpConfigPath: MCP_CONFIG_CONTAINER_PATH,
        permissionMode: ClaudePermissionMode.BypassPermissions,
        tools: claudeSessionTools(CLAUDE_BUILTIN_TOOLS, this.subagentDepth),
        debugFile: this.runtime.layout.debugLog.path,
      },
      sessionArgs,
    );
    const args = [
      "-T",
      "--user",
      "vscode",
      ...Object.entries(env).flatMap(([name, value]) => ["-e", `${name}=${value}`]),
      "app",
      this.runtime.layout.binary,
      ...cliArgs,
    ];

    return executeCliCommand({
      spawn: () => this.compose.execWithTimeout(args, this.profile.timeoutMs, { input: prompt }),
      logger: this.logger,
      tag: "claude",
      tracker: this,
      decoder: this.runtime.createOutputDecoder(),
    });
  }
}
