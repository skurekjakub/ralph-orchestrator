/**
 * Claude Code built-in tools an agent may be granted. The set is bound to the pinned Claude Code
 * version: web tools are left out because `WebSearch` runs server-side and bypasses the Squid proxy
 * (web access goes through the `web-fetch` MCP server), and scheduling, worktree and messaging
 * tools have no use in a headless run.
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
}

/** Built-in tools of an agent that declares no `tools` of its own, in Claude Code's listing order. */
export const CLAUDE_BUILTIN_TOOLS: readonly ClaudeBuiltinTool[] = Object.values(ClaudeBuiltinTool);

/** The Claude Code tool that spawns a subagent; `Agent(a, b)` limits it to the named agents. */
export const CLAUDE_SUBAGENT_TOOL = "Agent";

/**
 * Claude Code's name for an MCP tool (`mcp__ado__ado_push_progress`), or for every tool of `server`
 * when `tool` is omitted (`mcp__ado`).
 */
export function claudeMcpToolName(server: string, tool?: string): string {
  return tool === undefined ? `mcp__${server}` : `mcp__${server}__${tool}`;
}
