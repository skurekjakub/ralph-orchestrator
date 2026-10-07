import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RunSummary } from "../log-browser/tool-timeline-types";
import { RunSummaryPanel } from "./RunSummaryPanel";

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    totalDurationMs: 300_000,
    totalInvocations: 2,
    maxDepth: 2,
    totalPromptTokens: 1500,
    totalCompletionTokens: 300,
    totalCachedTokens: 450,
    compactionCount: 1,
    agentBreakdown: [
      { name: "writer", count: 1, totalDurationMs: 54_000, totalTokens: 1200, compactionCount: 0, maxDepth: 1 },
      { name: "reviewer", count: 1, totalDurationMs: 20_000, totalTokens: 600, compactionCount: 1, maxDepth: 2 },
    ],
    ...overrides,
  };
}

/** A summary from Claude Code run telemetry, which records no token usage. */
function makeTelemetrySummary(): RunSummary {
  const summary = makeSummary({ totalPromptTokens: null, totalCompletionTokens: null, totalCachedTokens: null });
  return { ...summary, agentBreakdown: summary.agentBreakdown.map((row) => ({ ...row, totalTokens: null })) };
}

function agentColumn(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector("td")?.textContent ?? "");
}

describe("RunSummaryPanel", () => {
  it("shows the token figures of a run whose logs record them", () => {
    // Act
    render(<RunSummaryPanel summary={makeSummary()} />);

    // Assert
    expect(screen.queryByText("1,800")).not.toBeNull();
    expect(screen.queryByText("1,200")).not.toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("shows n/a for token figures the run telemetry does not record, and says why", () => {
    // Act
    render(<RunSummaryPanel summary={makeTelemetrySummary()} />);

    // Assert
    expect(screen.getAllByText("n/a")).toHaveLength(6);
    expect(screen.getByRole("note").textContent).toContain("Not available for Claude Code runs");
  });

  it("sorts agents by duration when there are no token figures to sort by", () => {
    // Arrange
    const summary = makeTelemetrySummary();
    summary.agentBreakdown.reverse();

    // Act
    render(<RunSummaryPanel summary={summary} />);

    // Assert
    expect(agentColumn()).toEqual(["writer", "reviewer"]);
  });
});
