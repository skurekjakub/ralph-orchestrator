import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextWindowChart } from "./ContextWindowChart";
import type { AssistantUsageEntry, ContextWindowEntry, SubagentSpan } from "./tool-timeline-types";

function makeEntries(): ContextWindowEntry[] {
  return [
    { tsMs: 1000, usedTokens: 22534, maxTokens: 128000, utilization: 17.6 },
    { tsMs: 2000, usedTokens: 28049, maxTokens: 128000, utilization: 21.9 },
    { tsMs: 3000, usedTokens: 15193, maxTokens: 128000, utilization: 11.9 },
    { tsMs: 4000, usedTokens: 36512, maxTokens: 128000, utilization: 28.5 },
  ];
}

function makeUsageEntries(): AssistantUsageEntry[] {
  return [
    { tsMs: 1000, promptTokens: 26542, completionTokens: 277, cachedTokens: 0, totalTokens: 26819 },
    { tsMs: 2000, promptTokens: 27599, completionTokens: 379, cachedTokens: 20914, totalTokens: 27978 },
    { tsMs: 3000, promptTokens: 30000, completionTokens: 500, cachedTokens: 15000, totalTokens: 30500 },
  ];
}

function makeSubagentSpan(): SubagentSpan {
  return {
    name: "malph-scout",
    fullName: "ralph.malph-scout",
    resolvedModel: "claude-opus-4.6",
    didFallback: false,
    startTs: "2026-03-07T08:23:37.000Z",
    startMs: 2500,
    endMs: 3500,
    durationMs: 1000,
    toolCallCount: 5,
    modelCallCount: 3,
    toolCalls: [],
  };
}

describe("ContextWindowChart", () => {
  it("renders nothing when both entries and usage are empty", () => {
    const { container } = render(<ContextWindowChart entries={[]} usageEntries={[]} subagentSpans={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the header with peak utilization and max tokens", () => {
    render(<ContextWindowChart entries={makeEntries()} usageEntries={[]} subagentSpans={[]} />);

    expect(screen.getByText(/Context Window/)).toBeDefined();
    expect(screen.getByText(/peak: 28.5%/)).toBeDefined();
    expect(screen.getByText(/max: 128K/)).toBeDefined();
  });

  it("renders cumulative token info in header when usage entries present", () => {
    render(<ContextWindowChart entries={makeEntries()} usageEntries={makeUsageEntries()} subagentSpans={[]} />);

    expect(screen.getByText(/total tokens/)).toBeDefined();
  });

  it("renders the SVG chart with utilization entries", () => {
    const { container } = render(<ContextWindowChart entries={makeEntries()} usageEntries={[]} subagentSpans={[]} />);

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders subagent markers when spans are present", () => {
    render(<ContextWindowChart entries={makeEntries()} usageEntries={[]} subagentSpans={[makeSubagentSpan()]} />);

    expect(screen.getAllByText("malph-scout").length).toBeGreaterThanOrEqual(1);
  });

  it("renders per-turn token usage section", () => {
    render(<ContextWindowChart entries={makeEntries()} usageEntries={makeUsageEntries()} subagentSpans={[]} />);

    expect(screen.getByText(/Per-Turn Token Usage/)).toBeDefined();
  });

  it("renders cumulative token tracker", () => {
    render(<ContextWindowChart entries={makeEntries()} usageEntries={makeUsageEntries()} subagentSpans={[]} />);

    expect(screen.getByText(/Cumulative Token Spend/)).toBeDefined();
  });

  it("renders only usage sections when no context entries", () => {
    render(<ContextWindowChart entries={[]} usageEntries={makeUsageEntries()} subagentSpans={[]} />);

    expect(screen.getByText(/Per-Turn Token Usage/)).toBeDefined();
    expect(screen.getByText(/Cumulative Token Spend/)).toBeDefined();
  });

  it("renders subagent context window section when spans have data", () => {
    const span = makeSubagentSpan();
    // Entries within subagent window (2500–3500)
    const entries = makeEntries();
    const usageEntries = makeUsageEntries();

    render(<ContextWindowChart entries={entries} usageEntries={usageEntries} subagentSpans={[span]} />);

    expect(screen.getByText(/Subagent Context Windows/)).toBeDefined();
  });
});
