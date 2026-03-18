import { describe, it, expect } from "vitest";
import { parseCliDebugTree, flattenTree, attributeEntriesToTree } from "../cli-debug-subagent-parser";
import type { ContextWindowEntry, AssistantUsageEntry } from "../tool-timeline-types";

function makeLine(ts: string, content: string) {
  return `${ts} ${content}`;
}

function makeSubagentBlock(
  startTs: string,
  endTs: string,
  agentName: string,
  model = "claude-opus-4.6",
) {
  return [
    makeLine(startTs, '[DEBUG] kind: subagent_started'),
    makeLine(startTs, `[DEBUG] Agent "${agentName}" getOrCreateAgent: definitionModel="${model}" sessionModel="${model}"`),
    makeLine(startTs, `[DEBUG] Agent "${agentName}" getOrCreateAgent: final model="${model}"`),
    makeLine(endTs, '[DEBUG] kind: subagent_completed'),
  ].join("\n");
}

describe("parseCliDebugTree", () => {
  it("parses flat depth-1 subagents", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "ralph.scout"),
      makeSubagentBlock("2026-01-01T00:03:00.000Z", "2026-01-01T00:04:00.000Z", "ralph.writer"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    expect(tree.root.children).toHaveLength(2);
    expect(tree.root.children[0].name).toBe("scout");
    expect(tree.root.children[0].depth).toBe(1);
    expect(tree.root.children[1].name).toBe("writer");
    expect(tree.root.children[1].depth).toBe(1);
    expect(tree.allNodes).toHaveLength(3); // root + 2
  });

  it("parses nested depth-2 subagents", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] Agent "ralph.coordinator" getOrCreateAgent: final model="claude-opus-4.6"'),
      // Nested child
      makeSubagentBlock("2026-01-01T00:01:30.000Z", "2026-01-01T00:01:45.000Z", "ralph.writer"),
      makeLine("2026-01-01T00:02:00.000Z", '[DEBUG] kind: subagent_completed'),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    expect(tree.root.children).toHaveLength(1);
    const coordinator = tree.root.children[0];
    expect(coordinator.name).toBe("coordinator");
    expect(coordinator.depth).toBe(1);
    expect(coordinator.children).toHaveLength(1);

    const writer = coordinator.children[0];
    expect(writer.name).toBe("writer");
    expect(writer.depth).toBe(2);
    expect(writer.parentId).toBe(coordinator.id);
  });

  it("parses deep (4+) nesting", () => {
    const lines = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
    ];
    // Open 4 levels
    for (let d = 1; d <= 4; d++) {
      lines.push(makeLine(`2026-01-01T00:0${d}:00.000Z`, '[DEBUG] kind: subagent_started'));
      lines.push(makeLine(`2026-01-01T00:0${d}:00.000Z`, `[DEBUG] Agent "ralph.agent-${d}" getOrCreateAgent: final model="m"`));
    }
    // Close 4 levels
    for (let d = 4; d >= 1; d--) {
      lines.push(makeLine(`2026-01-01T00:1${d}:00.000Z`, '[DEBUG] kind: subagent_completed'));
    }

    const tree = parseCliDebugTree(lines.join("\n"));
    let current = tree.root;
    for (let d = 1; d <= 4; d++) {
      expect(current.children).toHaveLength(1);
      current = current.children[0];
      expect(current.depth).toBe(d);
      expect(current.name).toBe(`agent-${d}`);
    }
  });

  it("tracks multiple invocations of same agent name", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "ralph.writer"),
      makeSubagentBlock("2026-01-01T00:03:00.000Z", "2026-01-01T00:04:00.000Z", "ralph.writer"),
      makeSubagentBlock("2026-01-01T00:05:00.000Z", "2026-01-01T00:06:00.000Z", "ralph.writer"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    expect(tree.root.children[0].invocationIndex).toBe(1);
    expect(tree.root.children[1].invocationIndex).toBe(2);
    expect(tree.root.children[2].invocationIndex).toBe(3);
  });

  it("handles unclosed spans gracefully", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] Agent "ralph.scout" getOrCreateAgent: final model="m"'),
      makeLine("2026-01-01T00:05:00.000Z", "some other log line"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    expect(tree.root.children).toHaveLength(1);
    const scout = tree.root.children[0];
    expect(scout.name).toBe("scout");
    // Should have endMs from the last timestamp in the log
    expect(scout.endMs).toBeGreaterThan(0);
  });

  it("keeps repeated agents as siblings in partial crashed logs", () => {
    function makeUnclosedStart(ts: string, agentName: string) {
      return [
        makeLine(ts, "[DEBUG] kind: subagent_started"),
        makeLine(ts, `[DEBUG] Agent "${agentName}" getOrCreateAgent: final model="m"`),
      ].join("\n");
    }

    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeUnclosedStart("2026-01-01T00:01:00.000Z", "ralph.coordinator"),
      makeLine("2026-01-01T00:01:30.000Z", "[DEBUG] kind: assistant_usage"),
      makeUnclosedStart("2026-01-01T00:02:00.000Z", "ralph.writer"),
      makeLine("2026-01-01T00:02:30.000Z", "[DEBUG] kind: assistant_usage"),
      makeUnclosedStart("2026-01-01T00:03:00.000Z", "ralph.reviewer"),
      makeUnclosedStart("2026-01-01T00:04:00.000Z", "ralph.writer"),
      makeLine("2026-01-01T00:05:00.000Z", "shutdown"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const coordinator = tree.root.children[0];

    expect(coordinator.name).toBe("coordinator");
    expect(coordinator.children).toHaveLength(2);
    expect(coordinator.children.map((child) => child.name)).toEqual(["writer", "writer"]);
    expect(coordinator.children[0].children).toHaveLength(1);
    expect(coordinator.children[0].children[0].name).toBe("reviewer");
    expect(coordinator.children[0].endMs).toBe(coordinator.children[1].startMs);
  });

  it("returns empty tree for empty log", () => {
    const tree = parseCliDebugTree("");
    expect(tree.root.children).toHaveLength(0);
    expect(tree.allNodes).toHaveLength(1); // just root
  });

  it("extracts agent name correctly", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "docwriter.content-writer"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    expect(tree.root.children[0].name).toBe("content-writer");
    expect(tree.root.children[0].fullName).toBe("docwriter.content-writer");
  });

  it("counts tool calls correctly", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] Agent "ralph.scout" getOrCreateAgent: final model="m"'),
      makeLine("2026-01-01T00:01:30.000Z", '[DEBUG] kind: tool_call_executed'),
      makeLine("2026-01-01T00:01:40.000Z", '[DEBUG] kind: tool_call_executed'),
      makeLine("2026-01-01T00:01:50.000Z", '[DEBUG] kind: assistant_usage'),
      makeLine("2026-01-01T00:02:00.000Z", '[DEBUG] kind: subagent_completed'),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    expect(tree.root.children[0].toolCallCount).toBe(2);
    expect(tree.root.children[0].modelCallCount).toBe(1);
  });

  it("flattens parallel dispatches into siblings", () => {
    // Simulate a coordinator dispatching 3 reviewers in parallel (within 10ms)
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      // Coordinator starts
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] Agent "ralph.coordinator" getOrCreateAgent: final model="m"'),
      // 3 parallel dispatches within 10ms
      makeLine("2026-01-01T00:02:00.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:02:00.000Z", '[DEBUG] Agent "ralph.style-reviewer" getOrCreateAgent: final model="m"'),
      makeLine("2026-01-01T00:02:00.002Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:02:00.002Z", '[DEBUG] Agent "ralph.persona-reviewer" getOrCreateAgent: final model="m"'),
      makeLine("2026-01-01T00:02:00.010Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:02:00.010Z", '[DEBUG] Agent "ralph.accuracy-reviewer" getOrCreateAgent: final model="m"'),
      // Completions in LIFO order
      makeLine("2026-01-01T00:05:00.000Z", '[DEBUG] kind: subagent_completed'),
      makeLine("2026-01-01T00:06:00.000Z", '[DEBUG] kind: subagent_completed'),
      makeLine("2026-01-01T00:07:00.000Z", '[DEBUG] kind: subagent_completed'),
      // Coordinator completes
      makeLine("2026-01-01T00:08:00.000Z", '[DEBUG] kind: subagent_completed'),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const coordinator = tree.root.children[0];
    expect(coordinator.name).toBe("coordinator");

    // All 3 reviewers should be siblings (children of coordinator), not nested
    expect(coordinator.children).toHaveLength(3);
    expect(coordinator.children.map((c) => c.name).sort()).toEqual([
      "accuracy-reviewer", "persona-reviewer", "style-reviewer",
    ]);
    // All at the same depth
    expect(coordinator.children.every((c) => c.depth === 2)).toBe(true);
    // All are children of coordinator
    expect(coordinator.children.every((c) => c.parentId === coordinator.id)).toBe(true);
  });

  it("preserves genuine sequential nesting", () => {
    // Coordinator dispatches agent A, which takes 30s, then dispatches agent B
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] Agent "ralph.coordinator" getOrCreateAgent: final model="m"'),
      // Child agent starts 30s after coordinator (not parallel)
      makeLine("2026-01-01T00:01:30.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:01:30.000Z", '[DEBUG] Agent "ralph.writer" getOrCreateAgent: final model="m"'),
      makeLine("2026-01-01T00:02:00.000Z", '[DEBUG] kind: subagent_completed'),
      makeLine("2026-01-01T00:03:00.000Z", '[DEBUG] kind: subagent_completed'),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const coordinator = tree.root.children[0];
    expect(coordinator.children).toHaveLength(1);
    expect(coordinator.children[0].name).toBe("writer");
    expect(coordinator.children[0].depth).toBe(2);
  });
});

describe("flattenTree", () => {
  it("produces flat SubagentSpan[] in DFS order", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] Agent "ralph.coordinator" getOrCreateAgent: final model="m"'),
      makeSubagentBlock("2026-01-01T00:01:30.000Z", "2026-01-01T00:01:45.000Z", "ralph.writer"),
      makeLine("2026-01-01T00:02:00.000Z", '[DEBUG] kind: subagent_completed'),
      makeSubagentBlock("2026-01-01T00:03:00.000Z", "2026-01-01T00:04:00.000Z", "ralph.reviewer"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const flat = flattenTree(tree);

    expect(flat).toHaveLength(3); // coordinator, writer, reviewer
    expect(flat[0].name).toBe("coordinator");
    expect(flat[1].name).toBe("writer");
    expect(flat[2].name).toBe("reviewer");
  });

  it("excludes root from output", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "ralph.scout"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const flat = flattenTree(tree);
    expect(flat.every((s) => s.name !== "root")).toBe(true);
  });

  it("output has SubagentSpan shape (no tree fields)", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeSubagentBlock("2026-01-01T00:01:00.000Z", "2026-01-01T00:02:00.000Z", "ralph.scout"),
    ].join("\n");

    const flat = flattenTree(parseCliDebugTree(log));
    const span = flat[0];
    expect(span).toHaveProperty("name");
    expect(span).toHaveProperty("fullName");
    expect(span).toHaveProperty("resolvedModel");
    expect(span).toHaveProperty("toolCalls");
    // Should NOT have tree-specific fields
    expect(span).not.toHaveProperty("children");
    expect(span).not.toHaveProperty("depth");
    expect(span).not.toHaveProperty("parentId");
  });
});

describe("attributeEntriesToTree", () => {
  it("attributes entries to deepest matching node", () => {
    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] kind: subagent_started'),
      makeLine("2026-01-01T00:01:00.000Z", '[DEBUG] Agent "ralph.coordinator" getOrCreateAgent: final model="m"'),
      makeSubagentBlock("2026-01-01T00:01:30.000Z", "2026-01-01T00:01:45.000Z", "ralph.writer"),
      makeLine("2026-01-01T00:02:00.000Z", '[DEBUG] kind: subagent_completed'),
    ].join("\n");

    const tree = parseCliDebugTree(log);

    const contextEntries: ContextWindowEntry[] = [
      { tsMs: new Date("2026-01-01T00:00:30.000Z").getTime(), usedTokens: 100, maxTokens: 1000, utilization: 10 },
      { tsMs: new Date("2026-01-01T00:01:35.000Z").getTime(), usedTokens: 500, maxTokens: 1000, utilization: 50 },
      { tsMs: new Date("2026-01-01T00:01:15.000Z").getTime(), usedTokens: 300, maxTokens: 1000, utilization: 30 },
    ];

    const usageEntries: AssistantUsageEntry[] = [
      { tsMs: new Date("2026-01-01T00:01:35.000Z").getTime(), promptTokens: 100, completionTokens: 50, cachedTokens: 10, totalTokens: 150 },
    ];

    attributeEntriesToTree(tree, contextEntries, usageEntries);

    // Entry at 00:00:30 is before any subagent → root
    expect(tree.root.contextWindowEntries).toHaveLength(1);
    expect(tree.root.contextWindowEntries[0].usedTokens).toBe(100);

    // Entry at 00:01:35 is inside writer (deepest) → writer
    const coordinator = tree.root.children[0];
    const writer = coordinator.children[0];
    expect(writer.contextWindowEntries).toHaveLength(1);
    expect(writer.contextWindowEntries[0].usedTokens).toBe(500);

    // Entry at 00:01:15 is inside coordinator but not writer → coordinator
    expect(coordinator.contextWindowEntries).toHaveLength(1);
    expect(coordinator.contextWindowEntries[0].usedTokens).toBe(300);

    // Usage entry at 00:01:35 → writer
    expect(writer.assistantUsageEntries).toHaveLength(1);
    expect(writer.assistantUsageEntries[0].totalTokens).toBe(150);
  });

  it("reparents children of unclosed spans to grandparent", () => {
    // Simulate: orchestrator dispatches coordinator (unclosed), then dispatches
    // 2 more agents. Without fix, they'd nest under the unclosed coordinator.
    function makeUnclosedStart(ts: string, agentName: string, model = "claude-opus-4.6") {
      return [
        makeLine(ts, '[DEBUG] kind: subagent_started'),
        makeLine(ts, `[DEBUG] Agent "${agentName}" getOrCreateAgent: definitionModel="${model}" sessionModel="${model}"`),
        makeLine(ts, `[DEBUG] Agent "${agentName}" getOrCreateAgent: final model="${model}"`),
      ].join("\n");
    }

    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      // Unclosed coordinator — never gets subagent_completed
      makeUnclosedStart("2026-01-01T00:01:00.000Z", "ralph.coordinator"),
      // These 2 agents are dispatched by the orchestrator but appear under
      // the unclosed coordinator in the raw stack-based parse
      makeSubagentBlock("2026-01-01T00:10:00.000Z", "2026-01-01T00:15:00.000Z", "ralph.writer"),
      makeSubagentBlock("2026-01-01T00:20:00.000Z", "2026-01-01T00:25:00.000Z", "ralph.reviewer"),
      makeLine("2026-01-01T00:30:00.000Z", "end"),
    ].join("\n");

    const tree = parseCliDebugTree(log);

    // coordinator, writer, and reviewer should all be direct children of root
    expect(tree.root.children).toHaveLength(3);
    expect(tree.root.children.map((c) => c.name)).toEqual(["coordinator", "writer", "reviewer"]);

    // Unclosed coordinator is now a leaf
    const coord = tree.root.children.find((c) => c.name === "coordinator")!;
    expect(coord.children).toHaveLength(0);

    // All at depth 1
    expect(tree.root.children.every((c) => c.depth === 1)).toBe(true);
  });

  it("does not attribute entries to unclosed spans", () => {
    function makeUnclosedStart(ts: string, agentName: string, model = "claude-opus-4.6") {
      return [
        makeLine(ts, '[DEBUG] kind: subagent_started'),
        makeLine(ts, `[DEBUG] Agent "${agentName}" getOrCreateAgent: definitionModel="${model}" sessionModel="${model}"`),
        makeLine(ts, `[DEBUG] Agent "${agentName}" getOrCreateAgent: final model="${model}"`),
      ].join("\n");
    }

    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeUnclosedStart("2026-01-01T00:01:00.000Z", "ralph.coordinator"),
      makeSubagentBlock("2026-01-01T00:10:00.000Z", "2026-01-01T00:15:00.000Z", "ralph.writer"),
      makeLine("2026-01-01T00:30:00.000Z", "end"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const coord = tree.root.children.find((c) => c.name === "coordinator")!;
    const writer = tree.root.children.find((c) => c.name === "writer")!;

    // Context event during writer's time range → writer, not the unclosed coordinator
    const contextEntries: ContextWindowEntry[] = [
      { tsMs: new Date("2026-01-01T00:12:00.000Z").getTime(), usedTokens: 500, maxTokens: 1000, utilization: 50 },
      // Event outside writer but inside unclosed coordinator's span → root (not coordinator)
      { tsMs: new Date("2026-01-01T00:20:00.000Z").getTime(), usedTokens: 200, maxTokens: 1000, utilization: 20 },
    ];

    attributeEntriesToTree(tree, contextEntries, []);

    expect(writer.contextWindowEntries).toHaveLength(1);
    expect(writer.contextWindowEntries[0].usedTokens).toBe(500);
    expect(coord.contextWindowEntries).toHaveLength(0);
    // Event at 00:20 falls back to root since coordinator is unclosed
    expect(tree.root.contextWindowEntries).toHaveLength(1);
    expect(tree.root.contextWindowEntries[0].usedTokens).toBe(200);
  });

  it("attributes bounded partial-log telemetry to repeated nested agents", () => {
    function makeUnclosedStart(ts: string, agentName: string) {
      return [
        makeLine(ts, "[DEBUG] kind: subagent_started"),
        makeLine(ts, `[DEBUG] Agent "${agentName}" getOrCreateAgent: final model="m"`),
      ].join("\n");
    }

    const log = [
      makeLine("2026-01-01T00:00:00.000Z", "startup"),
      makeUnclosedStart("2026-01-01T00:01:00.000Z", "ralph.coordinator"),
      makeLine("2026-01-01T00:01:30.000Z", "[DEBUG] kind: assistant_usage"),
      makeUnclosedStart("2026-01-01T00:02:00.000Z", "ralph.writer"),
      makeLine("2026-01-01T00:02:30.000Z", "[DEBUG] kind: assistant_usage"),
      makeUnclosedStart("2026-01-01T00:03:00.000Z", "ralph.reviewer"),
      makeUnclosedStart("2026-01-01T00:04:00.000Z", "ralph.writer"),
      makeLine("2026-01-01T00:05:00.000Z", "shutdown"),
    ].join("\n");

    const tree = parseCliDebugTree(log);
    const coordinator = tree.root.children[0];
    const [writer1, writer2] = coordinator.children;
    const reviewer = writer1.children[0];

    const usageEntries: AssistantUsageEntry[] = [
      { tsMs: new Date("2026-01-01T00:01:30.000Z").getTime(), promptTokens: 10, completionTokens: 1, cachedTokens: 0, totalTokens: 11 },
      { tsMs: new Date("2026-01-01T00:02:30.000Z").getTime(), promptTokens: 20, completionTokens: 2, cachedTokens: 0, totalTokens: 22 },
      { tsMs: new Date("2026-01-01T00:03:30.000Z").getTime(), promptTokens: 30, completionTokens: 3, cachedTokens: 0, totalTokens: 33 },
      { tsMs: new Date("2026-01-01T00:04:30.000Z").getTime(), promptTokens: 40, completionTokens: 4, cachedTokens: 0, totalTokens: 44 },
    ];

    attributeEntriesToTree(tree, [], usageEntries);

    expect(coordinator.assistantUsageEntries).toHaveLength(1);
    expect(writer1.assistantUsageEntries).toHaveLength(1);
    expect(reviewer.assistantUsageEntries).toHaveLength(1);
    expect(writer2.assistantUsageEntries).toHaveLength(1);
  });
});
