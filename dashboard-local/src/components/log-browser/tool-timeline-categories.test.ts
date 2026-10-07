import { describe, expect, it } from "vitest";
import { getToolCategory } from "./tool-timeline-categories";

describe("getToolCategory", () => {
  it.each([
    ["Read", "file", "edit"],
    ["Bash", "shell", "shell"],
    ["mcp__ado__ado_push_progress", "mcp", "mcp"],
    ["Agent", "subagent", "subagent"],
    ["Skill", "skill", "skill"],
    ["anything", "subagent", "subagent"],
  ] as const)("puts %s with tool kind %s under %s", (tool, toolKind, category) => {
    // Act & Assert
    expect(getToolCategory(tool, toolKind)).toBe(category);
  });

  it("falls back to the tool name for the `other` kind, which Copilot gives its MCP tools", () => {
    // Act & Assert
    expect(getToolCategory("ado-ado_list_pull_requests", "other")).toBe("mcp");
  });

  it.each([
    ["Skill", "skill"],
    ["Agent", "subagent"],
    ["Task", "subagent"],
    ["Bash", "shell"],
    ["Read", "edit"],
    ["Grep", "edit"],
    ["mcp__ralphchives__search", "mcp"],
    ["WebSearch", "other"],
  ] as const)("puts the Claude Code tool %s, without a tool kind, under %s", (tool, category) => {
    // Act & Assert
    expect(getToolCategory(tool)).toBe(category);
  });

  it.each([
    ["skill", "skill"],
    ["task", "subagent"],
    ["ado-ado_list_pull_requests", "mcp"],
    ["bash", "shell"],
    ["view", "edit"],
    ["report_intent", "nav"],
    ["web_fetch", "other"],
  ] as const)("puts the Copilot tool %s under %s", (tool, category) => {
    // Act & Assert
    expect(getToolCategory(tool)).toBe(category);
  });
});
