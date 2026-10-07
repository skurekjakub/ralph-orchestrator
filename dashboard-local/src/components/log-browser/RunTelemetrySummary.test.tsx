import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import telemetryJson from "../../test/fixtures/claude-run-telemetry.json?raw";
import { parseRunTelemetry } from "./run-telemetry-parser";
import { RunTelemetrySummary } from "./RunTelemetrySummary";
import type { RunTelemetry } from "./tool-timeline-types";

function fixture(): RunTelemetry {
  const telemetry = parseRunTelemetry(telemetryJson);
  if (!telemetry) throw new Error("the run telemetry fixture is unreadable");
  return telemetry;
}

describe("RunTelemetrySummary", () => {
  it("shows the run's counts, failed calls, API errors by kind, hook blocks and unreadable log lines", () => {
    // Act
    render(<RunTelemetrySummary telemetry={fixture()} />);

    // Assert
    for (const text of [
      "Claude Code telemetry",
      "2 sessions",
      "3 subagents",
      "8 model calls",
      "4 tool calls",
      "1 failed",
      "API errors: authentication_failed ×1",
      "1 compaction",
      "1 hook block",
      "1 unreadable session log line",
      "5m 0s",
    ]) {
      expect(screen.queryByText(text)).not.toBeNull();
    }
  });

  it("leaves out the problem counts of a clean run", () => {
    // Arrange
    const clean = fixture();
    clean.totals = {
      ...clean.totals,
      failedToolCalls: 0,
      apiErrors: 0,
      compactions: 0,
      hookFeedback: 0,
      malformedLines: 0,
    };
    clean.spans = clean.spans.map((span) => ({ ...span, apiErrors: [] }));

    // Act
    render(<RunTelemetrySummary telemetry={clean} />);

    // Assert
    expect(screen.queryByText(/failed/)).toBeNull();
    expect(screen.queryByText(/API errors/)).toBeNull();
    expect(screen.queryByText(/compaction/)).toBeNull();
    expect(screen.queryByText(/hook block/)).toBeNull();
    expect(screen.queryByText(/unreadable/)).toBeNull();
  });
});
