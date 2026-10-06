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
});
