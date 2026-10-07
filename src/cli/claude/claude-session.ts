import { randomUUID } from "node:crypto";
import type { ReasoningEffort } from "../../config/types";
import { CLAUDE_SUBAGENT_TOOL } from "./claude-tools";

/**
 * Environment of every headless Claude Code session Ralph runs, in a container or on the host.
 *
 * Background tasks are off so subagents run in the foreground and the session ends once; non-essential
 * traffic (telemetry, error reporting, auto-update checks) is off so the egress allowlist needs only the
 * model API; tool search is off so every MCP tool is loaded up front.
 */
export const CLAUDE_HEADLESS_ENV: Readonly<Record<string, string>> = {
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  DISABLE_AUTOUPDATER: "1",
  DISABLE_COST_WARNINGS: "1",
  ENABLE_TOOL_SEARCH: "false",
};

/** Claude Code permission modes Ralph runs sessions in. */
export enum ClaudePermissionMode {
  /** Every tool call runs; the container, egress proxy, sidecar tool filter, `--tools` cap and hooks are the boundary. */
  BypassPermissions = "bypassPermissions",
  /** A tool call that no allow rule covers and that would otherwise prompt is denied. */
  DontAsk = "dontAsk",
}

/** How one headless Claude Code session of a stage runs, in a container or on the host. */
export interface ClaudeSessionOptions {
  /** Frontmatter `name` of the stage's root agent, which `--agent` resolves. */
  readonly agentName: string;
  readonly model?: string;
  readonly effort?: ReasoningEffort;
  /** The setting sources Claude Code loads (`--setting-sources`): `user`, or `user,project` for the repo's own. */
  readonly settingSources: string;
  /** Ralph's settings file (`--settings`): hooks, attribution and, for host sessions, permission rules. */
  readonly settingsPath: string;
  /** The MCP config (`--mcp-config`); without one the session runs no MCP server at all. */
  readonly mcpConfigPath?: string;
  readonly permissionMode: ClaudePermissionMode;
  /** The built-in tools the session may use (`--tools`). */
  readonly tools: readonly string[];
  /** Directories besides the working directory the session may reach, one `--add-dir` each. */
  readonly additionalDirs?: readonly string[];
  /** Where Claude Code writes its debug log (`--debug-file`). */
  readonly debugFile: string;
}

/**
 * The `claude` arguments of one headless session that prints stream-json and reads its prompt from stdin.
 *
 * @param sessionArgs The arguments that start (`--session-id`) or resume (`--resume`) the session.
 */
export function claudeSessionArgs(options: ClaudeSessionOptions, sessionArgs: readonly string[]): string[] {
  const { agentName, model, effort, settingSources, settingsPath, mcpConfigPath, permissionMode, tools } = options;
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--agent",
    agentName,
    ...(model === undefined ? [] : ["--model", model]),
    ...(effort === undefined ? [] : ["--effort", effort]),
    "--setting-sources",
    settingSources,
    "--settings",
    settingsPath,
    ...(mcpConfigPath === undefined ? [] : ["--mcp-config", mcpConfigPath]),
    "--strict-mcp-config",
    "--permission-mode",
    permissionMode,
    "--tools",
    tools.join(","),
    ...(options.additionalDirs ?? []).flatMap((dir) => ["--add-dir", dir]),
    ...sessionArgs,
    "--debug-file",
    options.debugFile,
  ];
}

/** `tools` plus the subagent tool when the stage root spawns subagents (`subagentDepth > 0`). */
export function claudeSessionTools(tools: readonly string[], subagentDepth: number): string[] {
  return subagentDepth > 0 ? [...tools, CLAUDE_SUBAGENT_TOOL] : [...tools];
}

/**
 * The environment one session of a stage needs besides the CLI's own: whether Ralph's result gate holds the
 * session until it prints its result block, and, for a root with subagents, how deep they may spawn.
 */
export function claudeSessionEnv(requireResultBlock: boolean, subagentDepth: number): Record<string, string> {
  return {
    RALPH_REQUIRE_RESULT_BLOCK: requireResultBlock ? "1" : "0",
    ...(subagentDepth > 0 ? { CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: String(subagentDepth) } : {}),
  };
}

/** The session of one stage's Claude Code executor: each `start` begins a new one, `resume` continues the last. */
export class ClaudeSessionIds {
  private sessionId: string | undefined;

  /** Arguments that start a new session under a fresh id. */
  start(): string[] {
    this.sessionId = randomUUID();
    return ["--session-id", this.sessionId];
  }

  /** Arguments that resume the session the last `start` began; undefined when none was started. */
  resume(): string[] | undefined {
    return this.sessionId === undefined ? undefined : ["--resume", this.sessionId];
  }
}
