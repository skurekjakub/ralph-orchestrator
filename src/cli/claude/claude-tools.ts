import type { CliToolNames } from "../cli-tools";

/**
 * Claude Code built-in tools an agent may be granted. The set is bound to the pinned Claude Code
 * version; scheduling, worktree and messaging tools have no use in a headless run and are left out.
 *
 * `WebSearch` runs server-side at Anthropic, so the egress proxy's allowlist does not apply to it.
 * `WebFetch` fetches from the container through the egress proxy, so it reaches only allowlisted
 * domains; before each fetch it sends the hostname to `api.anthropic.com` for a safety check
 * (https://code.claude.com/docs/en/data-usage#webfetch-domain-safety-check).
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

/**
 * The `--tools` cap of a host session: the built-in tools without the web tools, since no egress proxy limits
 * what a CLI on the host reaches.
 */
export const CLAUDE_HOST_TOOLS: readonly ClaudeBuiltinTool[] = CLAUDE_BUILTIN_TOOLS.filter(
  (tool) => tool !== ClaudeBuiltinTool.WebFetch && tool !== ClaudeBuiltinTool.WebSearch,
);

/** The Claude Code tool that spawns a subagent; `Agent(a, b)` limits it to the named agents. */
export const CLAUDE_SUBAGENT_TOOL = "Agent";

/**
 * The Claude Code tool a session run with `--json-schema` returns its result with. The `--tools` cap leaves it in,
 * but an `--agent` root's frontmatter `tools` drops it unless it lists it (observed on Claude Code 2.1.292).
 */
export const CLAUDE_STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

/**
 * Whether a Claude Code tool call spawns a subagent: {@link CLAUDE_SUBAGENT_TOOL}, or `Task`, its name
 * before Claude Code 2.1.63 and still an alias (https://code.claude.com/docs/en/sub-agents).
 */
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
