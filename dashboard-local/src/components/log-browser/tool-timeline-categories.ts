import type { AuditToolKind, ToolCategory } from "./tool-timeline-types";

/** Category of each audit v2 tool kind that decides one; `other` falls through to the tool name. */
const CATEGORY_OF_KIND: Partial<Record<AuditToolKind, ToolCategory>> = {
  subagent: "subagent",
  skill: "skill",
  shell: "shell",
  file: "edit",
  mcp: "mcp",
};

/** Claude Code tools that read or change files (the audit hooks' `file` kind). */
const CLAUDE_FILE_TOOLS = new Set(["Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep"]);

/**
 * The category of a tool call: from its audit v2 `toolKind` when that names one, else from the Copilot or
 * Claude Code tool name.
 */
export function getToolCategory(tool: string, toolKind?: AuditToolKind): ToolCategory {
  const byKind = toolKind && CATEGORY_OF_KIND[toolKind];
  if (byKind) return byKind;
  if (tool === "skill" || tool === "Skill") return "skill";
  if (tool === "task" || tool === "Agent" || tool === "Task") return "subagent";
  if (tool.startsWith("mcp__") || tool.includes("-")) return "mcp";
  if (tool === "bash" || tool === "shell" || tool === "Bash") return "shell";
  if (tool === "edit" || tool === "create" || tool === "view" || tool === "show_file") return "edit";
  if (CLAUDE_FILE_TOOLS.has(tool)) return "edit";
  if (tool === "report_intent") return "nav";
  return "other";
}
