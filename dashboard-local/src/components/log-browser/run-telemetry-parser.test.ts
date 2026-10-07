import { describe, expect, it } from "vitest";
import telemetryJson from "../../test/fixtures/claude-run-telemetry.json?raw";
import {
  applyTelemetryToTimeline,
  buildTelemetryRunSummary,
  buildTelemetryTree,
  parseRunTelemetry,
  telemetrySubagentSpans,
  telemetryTimeline,
} from "./run-telemetry-parser";
import type { RunTelemetry, RunTelemetrySpan, ToolCallEntry } from "./tool-timeline-types";

const MAIN = "11111111-2222-4333-8444-555555555555";
const LATER = "00000000-0000-4000-8000-000000000000";
const at = (time: string): number => Date.parse(`2026-10-07T${time}Z`);

/** The telemetry the orchestrator derives from its Claude Code session fixtures: two sessions, three subagents. */
function fixture(): RunTelemetry {
  const telemetry = parseRunTelemetry(telemetryJson);
  if (!telemetry) throw new Error("the run telemetry fixture is unreadable");
  return telemetry;
}

/** The fixture's first session alone, as a run of one stage records it. */
function firstSessionOnly(): RunTelemetry {
  const telemetry = fixture();
  return { ...telemetry, sessionIds: [MAIN], spans: telemetry.spans.filter((span) => span.sessionId === MAIN) };
}

function spanOf(telemetry: RunTelemetry, spanId: string): RunTelemetrySpan {
  const span = telemetry.spans.find((s) => s.spanId === spanId);
  if (!span) throw new Error(`no span ${spanId}`);
  return span;
}

function entry(fields: Partial<ToolCallEntry> & Pick<ToolCallEntry, "index" | "ts" | "tool">): ToolCallEntry {
  return { args: {}, isSkill: false, isSubagent: false, ...fields };
}

describe("parseRunTelemetry", () => {
  it("reads the telemetry the orchestrator writes", () => {
    // Act
    const telemetry = parseRunTelemetry(telemetryJson);

    // Assert
    expect(telemetry?.cli).toBe("claude");
    expect(telemetry?.sessionIds).toEqual([MAIN, LATER]);
    expect(telemetry?.spans.map((s) => s.spanId)).toEqual([MAIN, `${MAIN}/a1`, `${MAIN}/a2`, `${MAIN}/a3`, LATER]);
  });

  /** The fixture as a plain object, for corrupting one field. */
  const raw = () => JSON.parse(telemetryJson) as Record<string, any>;

  it.each([
    ["text that is not JSON", () => "{ not json"],
    ["another schema version", () => JSON.stringify({ ...raw(), schemaVersion: 2 })],
    ["telemetry without spans", () => JSON.stringify({ ...raw(), spans: undefined })],
    [
      "a span without its tool calls",
      () => {
        const telemetry = raw();
        delete telemetry.spans[0].toolCalls;
        return JSON.stringify(telemetry);
      },
    ],
    [
      "a tool call whose duration is not a number",
      () => {
        const telemetry = raw();
        telemetry.spans[0].toolCalls[0].durationMs = "1500";
        return JSON.stringify(telemetry);
      },
    ],
    [
      "a hook feedback entry without its hook event",
      () => {
        const telemetry = raw();
        telemetry.spans[0].hookFeedback = [{ ts: 1 }];
        return JSON.stringify(telemetry);
      },
    ],
    [
      "totals without a count",
      () => {
        const telemetry = raw();
        delete telemetry.totals.modelCalls;
        return JSON.stringify(telemetry);
      },
    ],
  ])("rejects %s", (_label, content) => {
    // Act & Assert
    expect(parseRunTelemetry(content())).toBeNull();
  });
});

describe("telemetrySubagentSpans", () => {
  it("lists every subagent depth-first under the span that spawned it, without the main threads", () => {
    // Act
    const spans = telemetrySubagentSpans(fixture());

    // Assert
    expect(spans.map((s) => [s.name, s.toolUseId])).toEqual([
      ["writer", "toolu_agent"],
      ["reviewer", "toolu_review"],
      ["unknown", undefined],
    ]);
  });

  it("maps a subagent's models, timing, counts and tool calls", () => {
    // Act
    const [writer] = telemetrySubagentSpans(fixture());

    // Assert
    expect(writer).toMatchObject({
      name: "writer",
      fullName: "writer",
      resolvedModel: "claude-haiku-4-5-20251001",
      didFallback: false,
      startTs: "2026-10-07T06:00:06.000Z",
      startMs: at("06:00:06.000"),
      endMs: at("06:01:00.000"),
      durationMs: 54_000,
      toolCallCount: 2,
      modelCallCount: 3,
    });
    expect(writer.toolCalls[0]).toEqual({
      ts: "2026-10-07T06:00:07.000Z",
      tsMs: at("06:00:07.000"),
      tool: "Write",
      durationMs: 250,
      isError: true,
    });
  });

  it("strips the family prefix from a subagent's name", () => {
    // Arrange
    const telemetry = fixture();
    spanOf(telemetry, `${MAIN}/a1`).agent = "ralph.writer";

    // Act
    const [writer] = telemetrySubagentSpans(telemetry);

    // Assert
    expect([writer.name, writer.fullName]).toEqual(["writer", "ralph.writer"]);
  });

  it("leaves out a subagent whose log carries no timestamp", () => {
    // Arrange
    const telemetry = fixture();
    const orphan = spanOf(telemetry, `${MAIN}/a3`);
    delete orphan.startTs;
    delete orphan.endTs;
    delete orphan.durationMs;

    // Act
    const spans = telemetrySubagentSpans(telemetry);

    // Assert
    expect(spans.map((s) => s.name)).toEqual(["writer", "reviewer"]);
  });
});

describe("buildTelemetryTree", () => {
  it("roots a run of several sessions at a run node over their main threads", () => {
    // Act
    const { root, allNodes } = buildTelemetryTree(fixture());

    // Assert
    expect(root).toMatchObject({ id: "run", depth: 0, startMs: at("06:00:01.000"), endMs: at("06:05:01.000") });
    expect(root.children.map((n) => n.id)).toEqual([MAIN, LATER]);
    expect(allNodes.map((n) => [n.id, n.depth, n.parentId])).toEqual([
      ["run", 0, null],
      [MAIN, 1, "run"],
      [`${MAIN}/a1`, 2, MAIN],
      [`${MAIN}/a2`, 3, `${MAIN}/a1`],
      [`${MAIN}/a3`, 2, MAIN],
      [LATER, 1, "run"],
    ]);
  });

  it("roots a run of one session at its main thread", () => {
    // Act
    const { root } = buildTelemetryTree(firstSessionOnly());

    // Assert
    expect(root).toMatchObject({ id: MAIN, depth: 0, parentId: null, name: "ralph", toolCallCount: 2 });
    expect(root.children.map((n) => [n.name, n.depth])).toEqual([
      ["writer", 1],
      ["unknown", 1],
    ]);
  });

  it("numbers repeated invocations of an agent in start order", () => {
    // Arrange
    const telemetry = firstSessionOnly();
    spanOf(telemetry, `${MAIN}/a3`).agent = "writer";

    // Act
    const { allNodes } = buildTelemetryTree(telemetry);

    // Assert
    expect(allNodes.filter((n) => n.name === "writer").map((n) => [n.id, n.invocationIndex])).toEqual([
      [`${MAIN}/a1`, 1],
      [`${MAIN}/a3`, 2],
    ]);
  });

  it("hangs a subagent whose parent span is missing under its session's main thread", () => {
    // Arrange
    const telemetry = firstSessionOnly();
    spanOf(telemetry, `${MAIN}/a2`).parentSpanId = `${MAIN}/gone`;

    // Act
    const { allNodes } = buildTelemetryTree(telemetry);

    // Assert
    expect(allNodes.find((n) => n.id === `${MAIN}/a2`)).toMatchObject({ parentId: MAIN, depth: 1 });
  });

  it("gives no node context-window or token entries", () => {
    // Act
    const { allNodes } = buildTelemetryTree(fixture());

    // Assert
    expect(allNodes.every((n) => n.contextWindowEntries.length === 0 && n.assistantUsageEntries.length === 0)).toBe(
      true,
    );
  });
});

describe("buildTelemetryRunSummary", () => {
  it("summarises the run and leaves the token totals null", () => {
    // Act
    const summary = buildTelemetryRunSummary(fixture());

    // Assert
    expect(summary).toMatchObject({
      totalDurationMs: 300_000,
      totalInvocations: 3,
      maxDepth: 2,
      compactionCount: 1,
      totalPromptTokens: null,
      totalCompletionTokens: null,
      totalCachedTokens: null,
    });
  });

  it("breaks the subagents down by agent, longest first", () => {
    // Arrange
    const telemetry = firstSessionOnly();
    spanOf(telemetry, `${MAIN}/a2`).compactions = [{ ts: at("06:00:20.000"), trigger: "auto" }];

    // Act
    const { agentBreakdown } = buildTelemetryRunSummary(telemetry);

    // Assert
    expect(agentBreakdown).toEqual([
      { name: "writer", count: 1, totalDurationMs: 54_000, totalTokens: null, compactionCount: 0, maxDepth: 1 },
      { name: "reviewer", count: 1, totalDurationMs: 20_000, totalTokens: null, compactionCount: 1, maxDepth: 2 },
      { name: "unknown", count: 1, totalDurationMs: 0, totalTokens: null, compactionCount: 0, maxDepth: 1 },
    ]);
  });
});

describe("telemetryTimeline", () => {
  it("lists every timed call of every span in call order with its duration, result and calling subagent", () => {
    // Act
    const timeline = telemetryTimeline(fixture());

    // Assert
    expect(timeline.map((e) => [e.index, e.tool, e.ts, e.durationMs, e.status, e.agent])).toEqual([
      [0, "Bash", at("06:00:03.000"), 1500, "success", undefined],
      [1, "Agent", at("06:00:05.000"), 60_000, "success", undefined],
      [2, "Write", at("06:00:07.000"), 250, "failure", "writer"],
      [3, "Agent", at("06:00:08.000"), 22_000, "success", "writer"],
    ]);
  });

  it("names the subagent each spawning call started", () => {
    // Act
    const timeline = telemetryTimeline(fixture());

    // Assert
    expect(timeline.filter((e) => e.isSubagent).map((e) => [e.toolUseId, e.subagentName])).toEqual([
      ["toolu_agent", "writer"],
      ["toolu_review", "reviewer"],
    ]);
  });

  it("leaves out a call without a timestamp and records no arguments", () => {
    // Arrange
    const telemetry = fixture();
    delete spanOf(telemetry, MAIN).toolCalls[0].ts;

    // Act
    const timeline = telemetryTimeline(telemetry);

    // Assert
    expect(timeline.map((e) => e.toolUseId)).toEqual(["toolu_agent", "toolu_write", "toolu_review"]);
    expect(timeline.every((e) => Object.keys(e.args).length === 0)).toBe(true);
  });
});

describe("applyTelemetryToTimeline", () => {
  it("takes each matched call's measured duration and result over the gap and the tool-order status", () => {
    // Arrange
    const timeline = [
      entry({ index: 0, ts: at("06:00:03.000"), tool: "Bash", toolUseId: "toolu_bash", durationMs: 2000 }),
      entry({ index: 1, ts: at("06:00:07.000"), tool: "Write", toolUseId: "toolu_write", status: "success" }),
    ];

    // Act
    const enriched = applyTelemetryToTimeline(timeline, fixture());

    // Assert
    expect(enriched.map((e) => [e.durationMs, e.status])).toEqual([
      [1500, "success"],
      [250, "failure"],
    ]);
  });

  it("names the subagent a call spawned when its audit record named none", () => {
    // Arrange
    const timeline = [
      entry({ index: 0, ts: at("06:00:05.000"), tool: "Agent", toolUseId: "toolu_agent", isSubagent: true }),
    ];

    // Act
    const [agentCall] = applyTelemetryToTimeline(timeline, fixture());

    // Assert
    expect(agentCall.subagentName).toBe("writer");
  });

  it("keeps entries the telemetry does not hold", () => {
    // Arrange
    const timeline = [
      entry({ index: 0, ts: 1000, tool: "bash", durationMs: 700, status: "success" }),
      entry({ index: 1, ts: 1700, tool: "Bash", toolUseId: "toolu_elsewhere", durationMs: 300 }),
    ];

    // Act
    const enriched = applyTelemetryToTimeline(timeline, fixture());

    // Assert
    expect(enriched).toEqual(timeline);
  });
});
