import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SubagentInnerTimeline, SubagentOverview } from "./ToolTimelineSubagents";
import type { SubagentSpan } from "./tool-timeline-types";

function makeSpan(overrides: Partial<SubagentSpan> = {}): SubagentSpan {
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
    toolCallCount: 5,
    modelCallCount: 2,
    toolCalls: [
      {
        ts: "2026-03-07T08:23:59.960Z",
        tsMs: new Date("2026-03-07T08:23:59.960Z").getTime(),
        tool: "report_intent",
        argsJson: '{"intent":"Scouting"}',
        returnValue: '{"success":true,"commentId":"662016"}',
      },
      {
        ts: "2026-03-07T08:24:00.400Z",
        tsMs: new Date("2026-03-07T08:24:00.400Z").getTime(),
        tool: "bash",
        argsJson: '{"command":"echo hi"}',
        returnValue: '{"stdout":"ok"}',
      },
    ],
    ...overrides,
  };
}

describe("SubagentOverview", () => {
  it("collapses and expands the gantt overview on demand", async () => {
    const user = userEvent.setup();

    render(<SubagentOverview spans={[makeSpan()]} />);

    expect(screen.queryByText("malph-scout")).not.toBeNull();
    expect(screen.queryByText(/claude-opus-4\.6/)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /subagent pipeline/i }));

    expect(screen.queryByText(/claude-opus-4\.6/)).toBeNull();
    expect(screen.queryByText("fallback")).toBeNull();
    expect(screen.queryByText("malph-scout")).toBeNull();

    await user.click(screen.getByRole("button", { name: /subagent pipeline/i }));

    expect(screen.queryByText(/claude-opus-4\.6/)).not.toBeNull();
    expect(screen.queryByText("malph-scout")).not.toBeNull();
  });
});

describe("SubagentInnerTimeline", () => {
  it("reveals the nested tool call table only after explicit expansion", async () => {
    const user = userEvent.setup();

    render(<SubagentInnerTimeline span={makeSpan()} />);

    expect(screen.queryByText(/^Offset$/)).not.toBeNull();
    expect(screen.queryByText(/^Time$/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /show tool breakdown/i })).not.toBeNull();
    expect(screen.getAllByText("report_intent")).toHaveLength(1);
    expect(screen.getAllByText("bash")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /hide 2 tool calls/i }));

    expect(screen.queryByText(/^Offset$/)).toBeNull();
    expect(screen.queryByText(/^Time$/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /show 2 tool calls/i }));

    expect(screen.queryByText(/^Offset$/)).not.toBeNull();
    expect(screen.queryByText(/^Time$/)).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /show tool breakdown/i }));

    expect(screen.queryByRole("button", { name: /hide tool breakdown/i })).not.toBeNull();
    expect(screen.getAllByText("report_intent")).toHaveLength(2);
    expect(screen.getAllByText("bash")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /report_intent/i }));

    expect(screen.queryByText(/^Args$/)).not.toBeNull();
    expect(screen.queryByText(/^Return Value$/)).not.toBeNull();
    expect(screen.queryByText(/Scouting/)).not.toBeNull();
    expect(screen.queryByText(/662016/)).not.toBeNull();
  });
});