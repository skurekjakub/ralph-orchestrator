import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolTimelineCallList } from "./ToolTimelineCallList";
import type { SubagentSpan, ToolCallEntry } from "./tool-timeline-types";

function makeSubagentSpan(): SubagentSpan {
  return {
    name: "malph-scout",
    fullName: "ralph.malph-scout",
    definitionModel: "claude-sonnet-4.5",
    resolvedModel: "claude-opus-4.6",
    didFallback: true,
    startTs: "2026-03-07T08:23:52.073Z",
    endTs: "2026-03-07T08:26:35.033Z",
    startMs: new Date("2026-03-07T08:23:52.073Z").getTime(),
    endMs: new Date("2026-03-07T08:26:35.033Z").getTime(),
    durationMs: 162960,
    toolCallCount: 3,
    modelCallCount: 2,
    toolCalls: [
      {
        ts: "2026-03-07T08:23:59.960Z",
        tsMs: new Date("2026-03-07T08:23:59.960Z").getTime(),
        tool: "report_intent",
      },
    ],
  };
}

function makeTimeline(): ToolCallEntry[] {
  return [
    {
      index: 0,
      ts: new Date("2026-03-07T08:23:51.934Z").getTime(),
      tool: "task",
      args: { agent_type: "ralph.malph-scout" },
      isSkill: false,
      isSubagent: true,
      subagentName: "malph-scout",
      status: "success",
      durationMs: 162960,
    },
    {
      index: 1,
      ts: new Date("2026-03-07T08:26:48.095Z").getTime(),
      tool: "skill",
      args: { skill: "malph-vscode-workflow-review-panel" },
      isSkill: true,
      skillName: "malph-vscode-workflow-review-panel",
      isSubagent: false,
      status: "success",
      durationMs: 17000,
    },
  ];
}

describe("ToolTimelineCallList", () => {
  it("renders subagent detail when the matching row is marked expanded", () => {
    const span = makeSubagentSpan();

    render(
      <ToolTimelineCallList
        timeline={makeTimeline()}
        expandedIndex={0}
        onToggle={() => {}}
        maxDuration={162960}
        subagentByName={new Map([[span.name, span]])}
      />,
    );

    expect(screen.queryByText("wanted claude-sonnet-4.5")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /hide 1 tool calls/i })).not.toBeNull();
  });
});
