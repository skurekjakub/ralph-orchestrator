export function getToolCategory(tool: string): "skill" | "mcp" | "edit" | "shell" | "nav" | "subagent" | "other" {
  if (tool === "skill") return "skill";
  if (tool === "task") return "subagent";
  if (tool.includes("-")) return "mcp";
  if (tool === "bash" || tool === "shell") return "shell";
  if (tool === "edit" || tool === "create" || tool === "view" || tool === "show_file") return "edit";
  if (tool === "report_intent") return "nav";
  return "other";
}