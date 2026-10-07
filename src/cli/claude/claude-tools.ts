import type { CliToolNames } from "../cli-tools";

/**
 * Claude Code built-in tools an agent may be granted. The set is bound to the pinned Claude Code
 * version; scheduling, worktree and messaging tools have no use in a headless run and are left out.
 *
 * `WebSearch` runs server-side at Anthropic, so the egress proxy's allowlist does not apply to it.
 * `WebFetch` fetches from the container through the egress proxy, so it reaches only allowlisted
 * domains; its domain safety check goes to `api.anthropic.com`.
 */
export enum ClaudeBuiltinTool {
  Read = "Read",
  Write = "Write",
  Edit = "Edit",
  Bash = "Bash",
  Skill = "Skill",
  TaskCreate = "TaskCreate",
  TaskGet = "TaskGet",
  TaskList = "TaskList",
  TaskUpdate = "TaskUpdate",
  WebFetch = "WebFetch",
  WebSearch = "WebSearch",
}

/** Built-in tools of an agent that declares no `tools` of its own, and the `--tools` cap of a container session. */
export const CLAUDE_BUILTIN_TOOLS: readonly ClaudeBuiltinTool[] = Object.values(ClaudeBuiltinTool);

/** The Claude Code tool that spawns a subagent; `Agent(a, b)` limits it to the named agents. */
export const CLAUDE_SUBAGENT_TOOL = "Agent";

/** Whether a Claude Code tool call spawns a subagent; the CLI reports {@link CLAUDE_SUBAGENT_TOOL} as `Task` in places. */
export function isClaudeSubagentTool(name: string): boolean {
  return name === CLAUDE_SUBAGENT_TOOL || name === "Task";
}

/**
 * Claude Code's name for an MCP tool (`mcp__ado__ado_push_progress`), or for every tool of `server`
 * when `tool` is omitted (`mcp__ado`).
 */
export function claudeMcpToolName(server: string, tool?: string): string {
  return tool === undefined ? `mcp__${server}` : `mcp__${server}__${tool}`;
}

/** Claude Code tool names. */
export const CLAUDE_TOOL_NAMES: CliToolNames = {
  subagent: CLAUDE_SUBAGENT_TOOL,
  skill: ClaudeBuiltinTool.Skill,
  shell: ClaudeBuiltinTool.Bash,
  read: ClaudeBuiltinTool.Read,
  askUser: "AskUserQuestion",
};
