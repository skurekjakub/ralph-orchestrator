import { describe, it, expect } from "vitest";
import { buildRunSummary } from "../fractalLogPlugin";
import { parseCliDebugTree } from "../components/log-browser/cli-debug-subagent-parser";
import type { ContextWindowEntry } from "../components/log-browser/tool-timeline-types";

function makeLine(ts: string, content: string) {
  return `${ts} ${content}`;
}

function makeSubagentBlock(startTs: string, endTs: string, agentName: string) {
  return [
    makeLine(startTs, "[DEBUG] kind: subagent_started"),
    makeLine(startTs, `[DEBUG] Agent "${agentName}" getOrCreateAgent: final model="m"`),
    makeLine(endTs, "[DEBUG] kind: subagent_completed"),
  ].join("\n");
}

describe("buildRunSummary", () => {
  it("computes aggregate stats across agents", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "ralph.scout"),
      makeSubagentBlock("2026-01-01T00:03:00.000Z", "2026-01-01T00:05:00.000Z", "ralph.writer"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const contextEntries: ContextWindowEntry[] = [];
    const summary = buildRunSummary(tree, contextEntries);

    expect(summary.totalInvocations).toBe(2);
    expect(summary.maxDepth).toBe(1);
    expect(summary.compactionCount).toBe(0);
    expect(summary.agentBreakdown).toHaveLength(2);
    expect(summary.agentBreakdown.every((a) => a.compactionCount === 0)).toBe(true);
    expect(summary.agentBreakdown.map((a) => a.name).sort()).toEqual(["scout", "writer"]);
  });

  it("counts compaction events from node entries", () => {
    const contextEntries: ContextWindowEntry[] = [
      { tsMs: 1000, usedTokens: 800, maxTokens: 1000, utilization: 80 },
      { tsMs: 2000, usedTokens: 850, maxTokens: 1000, utilization: 85 },
      { tsMs: 3000, usedTokens: 600, maxTokens: 1000, utilization: 60 }, // drop 25 → compaction
      { tsMs: 4000, usedTokens: 900, maxTokens: 1000, utilization: 90 },
      { tsMs: 5000, usedTokens: 750, maxTokens: 1000, utilization: 75 }, // drop 15 → compaction
      { tsMs: 6000, usedTokens: 700, maxTokens: 1000, utilization: 70 }, // drop 5 → NOT compaction
    ];

    const tree = parseCliDebugTree(makeLine("2026-01-01T00:00:00.000Z", "startup"));
    // Attribute entries to root so buildRunSummary can detect drops
    tree.root.contextWindowEntries = contextEntries;
    const summary = buildRunSummary(tree, contextEntries);
    expect(summary.compactionCount).toBe(2);
  });

  it("aggregates compaction counts per agent type", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "ralph.writer"),
      makeSubagentBlock("2026-01-01T00:03:00.000Z", "2026-01-01T00:04:00.000Z", "ralph.writer"),
      makeSubagentBlock("2026-01-01T00:05:00.000Z", "2026-01-01T00:06:00.000Z", "ralph.reviewer"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const [writer1, writer2, reviewer] = tree.root.children;

    writer1.contextWindowEntries = [
      { tsMs: 1000, usedTokens: 800, maxTokens: 1000, utilization: 80 },
      { tsMs: 2000, usedTokens: 600, maxTokens: 1000, utilization: 60 },
    ];
    writer2.contextWindowEntries = [
      { tsMs: 3000, usedTokens: 900, maxTokens: 1000, utilization: 90 },
      { tsMs: 4000, usedTokens: 650, maxTokens: 1000, utilization: 65 },
      { tsMs: 5000, usedTokens: 500, maxTokens: 1000, utilization: 50 },
    ];
    reviewer.contextWindowEntries = [
      { tsMs: 6000, usedTokens: 700, maxTokens: 1000, utilization: 70 },
      { tsMs: 7000, usedTokens: 650, maxTokens: 1000, utilization: 65 },
    ];

    const summary = buildRunSummary(tree, []);

    expect(summary.compactionCount).toBe(3);
    expect(summary.agentBreakdown.find((a) => a.name === "writer")?.compactionCount).toBe(3);
    expect(summary.agentBreakdown.find((a) => a.name === "reviewer")?.compactionCount).toBe(0);
  });

  it("aggregates token usage from manually attributed entries", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "ralph.scout"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    // Manually attribute usage entries to the node
    tree.root.children[0].assistantUsageEntries = [
      { tsMs: 1000, promptTokens: 1000, completionTokens: 200, cachedTokens: 300, totalTokens: 1200 },
      { tsMs: 2000, promptTokens: 500, completionTokens: 100, cachedTokens: 150, totalTokens: 600 },
    ];
    const summary = buildRunSummary(tree, []);

    expect(summary.totalPromptTokens).toBe(1500);
    expect(summary.totalCompletionTokens).toBe(300);
    expect(summary.totalCachedTokens).toBe(450);
  });

  it("handles empty log returning zeroed summary", () => {
    const tree = parseCliDebugTree("");
    const summary = buildRunSummary(tree, []);

    expect(summary.totalInvocations).toBe(0);
    expect(summary.maxDepth).toBe(0);
    expect(summary.totalPromptTokens).toBe(0);
    expect(summary.compactionCount).toBe(0);
    expect(summary.agentBreakdown).toHaveLength(0);
  });

  it("groups same agent name in breakdown", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "ralph.writer"),
      makeSubagentBlock("2026-01-01T00:03:00.000Z", "2026-01-01T00:04:00.000Z", "ralph.writer"),
      makeSubagentBlock("2026-01-01T00:05:00.000Z", "2026-01-01T00:06:00.000Z", "ralph.reviewer"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const summary = buildRunSummary(tree, []);

    const writerEntry = summary.agentBreakdown.find((a) => a.name === "writer");
    expect(writerEntry?.count).toBe(2);
    const reviewerEntry = summary.agentBreakdown.find((a) => a.name === "reviewer");
    expect(reviewerEntry?.count).toBe(1);
  });
});
