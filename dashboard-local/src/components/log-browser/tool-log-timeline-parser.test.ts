import { describe, expect, it } from "vitest";
import { buildTimeline } from "./tool-log-timeline-parser";

describe("buildTimeline", () => {
  it("marks skills and subagents while correlating output by tool order", () => {
    const preTool = [
      JSON.stringify({
        event: "pre_tool",
        ts: 1000,
        session: "s1",
        tool: "skill",
        args: JSON.stringify({ skill: "malph-vscode-workflow-setup" }),
      }),
      JSON.stringify({
        event: "pre_tool",
        ts: 2000,
        session: "s1",
        tool: "task",
        args: JSON.stringify({ agent_type: "ralph.malph-scout" }),
      }),
    ].join("\n");

    const toolOutput = [
      "── 09:22:42 skill (success) ──",
      "args: {",
      '  "skill": "malph-vscode-workflow-setup"',
      "}",
      "ok",
      "── 09:23:51 task (success) ──",
      "args: {",
      '  "agent_type": "ralph.malph-scout"',
      "}",
      "done",
    ].join("\n");

    const timeline = buildTimeline(preTool, toolOutput);

    expect(timeline).toHaveLength(2);
    expect(timeline[0].isSkill).toBe(true);
    expect(timeline[0].skillName).toBe("malph-vscode-workflow-setup");
    expect(timeline[0].status).toBe("success");
    expect(timeline[1].isSubagent).toBe(true);
    expect(timeline[1].subagentName).toBe("malph-scout");
    expect(timeline[1].status).toBe("success");
  });

  describe("audit v2 records", () => {
    /** A pre-tool.log line as the audit hooks write it: the v2 `pre_tool` record with `ts` for `timestamp`. */
    function preToolV2(fields: Record<string, unknown>): string {
      return JSON.stringify({
        schemaVersion: 2,
        event: "pre_tool",
        ts: 1000,
        session: "s1",
        cli: "claude",
        agent: "ralph",
        agentId: null,
        toolUseId: null,
        mcpServer: null,
        mcpTool: null,
        subagent: null,
        skill: null,
        args: "{}",
        ...fields,
      });
    }

    it("takes skills, subagents, call ids and the calling subagent from Claude Code records", () => {
      // Arrange
      const preTool = [
        preToolV2({ ts: 1000, tool: "Skill", toolUseId: "toolu_skill", toolKind: "skill", skill: "docs-style" }),
        preToolV2({
          ts: 2000,
          tool: "Agent",
          toolUseId: "toolu_agent",
          toolKind: "subagent",
          subagent: "ralph.writer",
          args: JSON.stringify({ subagent_type: "ralph.writer", prompt: "Draft the page" }),
        }),
        preToolV2({
          ts: 3000,
          agent: "ralph.writer",
          agentId: "a1",
          tool: "Bash",
          toolUseId: "toolu_bash",
          toolKind: "shell",
        }),
      ].join("\n");

      // Act
      const timeline = buildTimeline(preTool, null);

      // Assert
      expect(timeline.map((e) => [e.tool, e.toolKind, e.toolUseId, e.agent])).toEqual([
        ["Skill", "skill", "toolu_skill", undefined],
        ["Agent", "subagent", "toolu_agent", undefined],
        ["Bash", "shell", "toolu_bash", "writer"],
      ]);
      expect(timeline[0]).toMatchObject({ isSkill: true, skillName: "docs-style", isSubagent: false });
      expect(timeline[1]).toMatchObject({ isSkill: false, isSubagent: true, subagentName: "writer" });
      expect(timeline[2]).toMatchObject({ isSkill: false, isSubagent: false });
    });

    it("takes the subagent from a Copilot record's v2 fields, which carry no call id or agent", () => {
      // Arrange
      const preTool = preToolV2({
        cli: "copilot",
        agent: null,
        tool: "task",
        toolKind: "subagent",
        subagent: "ralph.malph-scout",
        args: JSON.stringify({ agent_type: "ralph.malph-scout" }),
      });

      // Act
      const [entry] = buildTimeline(preTool, null);

      // Assert
      expect(entry).toMatchObject({ isSubagent: true, subagentName: "malph-scout", toolKind: "subagent" });
      expect(entry).not.toHaveProperty("toolUseId");
      expect(entry).not.toHaveProperty("agent");
    });

    it("trusts the v2 tool kind over the tool name", () => {
      // Arrange
      const preTool = preToolV2({ tool: "task", toolKind: "other" });

      // Act
      const [entry] = buildTimeline(preTool, null);

      // Assert
      expect(entry).toMatchObject({ isSkill: false, isSubagent: false, toolKind: "other" });
    });

    it("falls back to the tool name for a record whose tool kind is unknown", () => {
      // Arrange
      const preTool = preToolV2({
        tool: "task",
        toolKind: "teleport",
        args: JSON.stringify({ agent_type: "ralph.malph-scout" }),
      });

      // Act
      const [entry] = buildTimeline(preTool, null);

      // Assert
      expect(entry).toMatchObject({ isSubagent: true, subagentName: "malph-scout" });
      expect(entry).not.toHaveProperty("toolKind");
    });
  });
});
