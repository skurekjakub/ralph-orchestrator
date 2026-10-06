import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolTimelineSummary } from "./ToolTimelineSummary";
import type { ToolCallEntry } from "./tool-timeline-types";

function makeTimeline(): ToolCallEntry[] {
  return [
    {
      index: 0,
      ts: 1000,
      tool: "skill",
      args: { skill: "malph-vscode-workflow-setup" },
      isSkill: true,
      skillName: "malph-vscode-workflow-setup",
      isSubagent: false,
      durationMs: 1000,
    },
    {
      index: 1,
      ts: 2000,
      tool: "task",
      args: { agent_type: "ralph.malph-scout" },
      isSkill: false,
      isSubagent: true,
      subagentName: "malph-scout",
      durationMs: 3000,
    },
    {
      index: 2,
      ts: 5000,
      tool: "bash",
      args: { command: "echo hi" },
      isSkill: false,
      isSubagent: false,
      durationMs: 0,
    },
  ];
}

describe("ToolTimelineSummary", () => {
  it("renders high-level counts plus distinct skill and subagent inventory", () => {
    render(<ToolTimelineSummary timeline={makeTimeline()} totalDuration={4000} />);

    expect(screen.queryByText(/3 calls/)).not.toBeNull();
    expect(screen.queryByText(/1 skill/)).not.toBeNull();
    expect(screen.queryByText("malph-vscode-workflow-setup")).not.toBeNull();
    expect(screen.queryByText("malph-scout")).not.toBeNull();
    expect(screen.queryByText(/shell \(1\)/)).not.toBeNull();
  });
});
