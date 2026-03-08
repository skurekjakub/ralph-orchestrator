import { describe, expect, it } from "vitest";
import { parseAssistantUsageEntries, parseContextWindowEntries, splitEntriesByAgent } from "./context-window-parser";
import type { AssistantUsageEntry, ContextWindowEntry, SubagentSpan } from "./tool-timeline-types";

describe("parseContextWindowEntries", () => {
  it("parses CompactionProcessor lines", () => {
    const content = [
      '2026-03-07T08:22:33.874Z [INFO] CompactionProcessor: Utilization 17.6% (22534/128000 tokens) below threshold 80%',
      '2026-03-07T08:22:42.643Z [INFO] CompactionProcessor: Utilization 18.4% (23612/128000 tokens) below threshold 80%',
    ].join("\n");

    const entries = parseContextWindowEntries(content);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      tsMs: new Date("2026-03-07T08:22:33.874Z").getTime(),
      utilization: 17.6,
      usedTokens: 22534,
      maxTokens: 128000,
    });
    expect(entries[1]).toEqual({
      tsMs: new Date("2026-03-07T08:22:42.643Z").getTime(),
      utilization: 18.4,
      usedTokens: 23612,
      maxTokens: 128000,
    });
  });

  it("returns empty array for empty input", () => {
    expect(parseContextWindowEntries("")).toEqual([]);
  });

  it("ignores non-matching lines", () => {
    const content = [
      '2026-03-07T08:22:30.289Z [INFO] Starting Copilot CLI: 1.0.2',
      '2026-03-07T08:22:33.874Z [INFO] CompactionProcessor: Utilization 17.6% (22534/128000 tokens) below threshold 80%',
      '2026-03-07T08:22:42.208Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: assistant_usage)',
    ].join("\n");

    const entries = parseContextWindowEntries(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].utilization).toBe(17.6);
  });

  it("sorts entries by timestamp", () => {
    const content = [
      '2026-03-07T08:30:00.000Z [INFO] CompactionProcessor: Utilization 40.0% (51200/128000 tokens) below threshold 80%',
      '2026-03-07T08:22:00.000Z [INFO] CompactionProcessor: Utilization 10.0% (12800/128000 tokens) below threshold 80%',
    ].join("\n");

    const entries = parseContextWindowEntries(content);
    expect(entries[0].utilization).toBe(10.0);
    expect(entries[1].utilization).toBe(40.0);
  });

  it("detects context drops after subagent dispatch", () => {
    const content = [
      '2026-03-07T08:23:37.501Z [INFO] CompactionProcessor: Utilization 21.9% (28049/128000 tokens) below threshold 80%',
      '2026-03-07T08:23:52.378Z [INFO] CompactionProcessor: Utilization 11.9% (15193/128000 tokens) below threshold 80%',
      '2026-03-07T08:24:09.870Z [INFO] CompactionProcessor: Utilization 20.3% (25952/128000 tokens) below threshold 80%',
    ].join("\n");

    const entries = parseContextWindowEntries(content);
    expect(entries).toHaveLength(3);
    // Context drops from 21.9% → 11.9% (subagent dispatched, context shrinks)
    expect(entries[0].utilization).toBeGreaterThan(entries[1].utilization);
    // Context grows back as results are read
    expect(entries[2].utilization).toBeGreaterThan(entries[1].utilization);
  });
});

describe("parseAssistantUsageEntries", () => {
  it("parses assistant_usage blocks with usage JSON", () => {
    const content = [
      '2026-03-07T08:22:42.208Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: assistant_usage)',
      '2026-03-07T08:22:42.208Z [DEBUG] Sending telemetry event: copilot-cli/cli.model_call',
      '2026-03-07T08:22:42.209Z [DEBUG] Sending telemetry event: copilot-cli/request.sent',
      '2026-03-07T08:22:42.209Z [DEBUG] response (Request-ID 00000-7e69c354):',
      '2026-03-07T08:22:42.209Z [DEBUG] data:',
      '2026-03-07T08:22:42.210Z [DEBUG] {',
      '2026-03-07T08:22:42.210Z [DEBUG]   "usage": {',
      '2026-03-07T08:22:42.210Z [DEBUG]     "completion_tokens": 277,',
      '2026-03-07T08:22:42.210Z [DEBUG]     "prompt_tokens": 26542,',
      '2026-03-07T08:22:42.210Z [DEBUG]     "prompt_tokens_details": {',
      '2026-03-07T08:22:42.210Z [DEBUG]       "cached_tokens": 5000',
      '2026-03-07T08:22:42.210Z [DEBUG]     },',
      '2026-03-07T08:22:42.210Z [DEBUG]     "total_tokens": 26819',
      '2026-03-07T08:22:42.210Z [DEBUG]   },',
      '2026-03-07T08:22:42.210Z [DEBUG]   "id": "msg_vrtx_abc123"',
      '2026-03-07T08:22:42.210Z [DEBUG] }',
    ].join("\n");

    const entries = parseAssistantUsageEntries(content);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      tsMs: new Date("2026-03-07T08:22:42.208Z").getTime(),
      promptTokens: 26542,
      completionTokens: 277,
      cachedTokens: 5000,
      totalTokens: 26819,
    });
  });

  it("returns empty array for empty input", () => {
    expect(parseAssistantUsageEntries("")).toEqual([]);
  });

  it("parses multiple usage blocks", () => {
    const content = [
      '2026-03-07T08:22:42.208Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: assistant_usage)',
      '2026-03-07T08:22:42.210Z [DEBUG] {',
      '2026-03-07T08:22:42.210Z [DEBUG]   "usage": {',
      '2026-03-07T08:22:42.210Z [DEBUG]     "completion_tokens": 100,',
      '2026-03-07T08:22:42.210Z [DEBUG]     "prompt_tokens": 20000,',
      '2026-03-07T08:22:42.210Z [DEBUG]     "prompt_tokens_details": { "cached_tokens": 0 },',
      '2026-03-07T08:22:42.210Z [DEBUG]     "total_tokens": 20100',
      '2026-03-07T08:22:42.210Z [DEBUG]   }',
      '2026-03-07T08:22:42.210Z [DEBUG] }',
      '',
      '2026-03-07T08:23:10.000Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: assistant_usage)',
      '2026-03-07T08:23:10.001Z [DEBUG] {',
      '2026-03-07T08:23:10.001Z [DEBUG]   "usage": {',
      '2026-03-07T08:23:10.001Z [DEBUG]     "completion_tokens": 500,',
      '2026-03-07T08:23:10.001Z [DEBUG]     "prompt_tokens": 30000,',
      '2026-03-07T08:23:10.001Z [DEBUG]     "prompt_tokens_details": { "cached_tokens": 15000 },',
      '2026-03-07T08:23:10.001Z [DEBUG]     "total_tokens": 30500',
      '2026-03-07T08:23:10.001Z [DEBUG]   }',
      '2026-03-07T08:23:10.001Z [DEBUG] }',
    ].join("\n");

    const entries = parseAssistantUsageEntries(content);
    expect(entries).toHaveLength(2);
    expect(entries[0].promptTokens).toBe(20000);
    expect(entries[1].promptTokens).toBe(30000);
    expect(entries[1].cachedTokens).toBe(15000);
  });

  it("handles missing cached_tokens gracefully", () => {
    const content = [
      '2026-03-07T08:22:42.208Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: assistant_usage)',
      '2026-03-07T08:22:42.210Z [DEBUG] {',
      '2026-03-07T08:22:42.210Z [DEBUG]   "usage": {',
      '2026-03-07T08:22:42.210Z [DEBUG]     "completion_tokens": 100,',
      '2026-03-07T08:22:42.210Z [DEBUG]     "prompt_tokens": 20000,',
      '2026-03-07T08:22:42.210Z [DEBUG]     "total_tokens": 20100',
      '2026-03-07T08:22:42.210Z [DEBUG]   }',
      '2026-03-07T08:22:42.210Z [DEBUG] }',
    ].join("\n");

    const entries = parseAssistantUsageEntries(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].cachedTokens).toBe(0);
  });
});

function makeSpan(overrides: Partial<SubagentSpan> = {}): SubagentSpan {
  return {
    name: "scout",
    fullName: "ralph.scout",
    resolvedModel: "claude-opus-4.6",
    didFallback: false,
    startTs: "",
    startMs: 2000,
    endMs: 4000,
    durationMs: 2000,
    toolCallCount: 3,
    modelCallCount: 2,
    toolCalls: [],
    ...overrides,
  };
}

describe("splitEntriesByAgent", () => {
  it("returns empty when no subagent spans", () => {
    const entries: ContextWindowEntry[] = [{ tsMs: 1000, usedTokens: 10000, maxTokens: 128000, utilization: 7.8 }];
    const usage: AssistantUsageEntry[] = [{ tsMs: 1000, promptTokens: 10000, completionTokens: 200, cachedTokens: 0, totalTokens: 10200 }];

    const slices = splitEntriesByAgent(entries, usage, []);
    expect(slices).toHaveLength(0);
  });

  it("attributes entries inside subagent time window to that subagent", () => {
    const entries: ContextWindowEntry[] = [
      { tsMs: 1000, usedTokens: 20000, maxTokens: 128000, utilization: 15.6 },
      { tsMs: 2500, usedTokens: 12000, maxTokens: 128000, utilization: 9.4 },
      { tsMs: 3500, usedTokens: 25000, maxTokens: 128000, utilization: 19.5 },
      { tsMs: 5000, usedTokens: 28000, maxTokens: 128000, utilization: 21.9 },
    ];
    const usage: AssistantUsageEntry[] = [
      { tsMs: 1000, promptTokens: 20000, completionTokens: 200, cachedTokens: 0, totalTokens: 20200 },
      { tsMs: 3000, promptTokens: 12000, completionTokens: 300, cachedTokens: 0, totalTokens: 12300 },
      { tsMs: 5000, promptTokens: 28000, completionTokens: 400, cachedTokens: 10000, totalTokens: 28400 },
    ];
    const span = makeSpan();

    const slices = splitEntriesByAgent(entries, usage, [span]);
    expect(slices).toHaveLength(2);

    const main = slices.find((s) => s.name === "main")!;
    expect(main.entries).toHaveLength(2);
    expect(main.entries[0].tsMs).toBe(1000);
    expect(main.entries[1].tsMs).toBe(5000);
    expect(main.usageEntries).toHaveLength(2);

    const sub = slices.find((s) => s.name === "scout")!;
    expect(sub.entries).toHaveLength(2);
    expect(sub.entries[0].tsMs).toBe(2500);
    expect(sub.entries[1].tsMs).toBe(3500);
    expect(sub.usageEntries).toHaveLength(1);
    expect(sub.model).toBe("claude-opus-4.6");
  });

  it("handles multiple subagent spans", () => {
    const entries: ContextWindowEntry[] = [
      { tsMs: 500, usedTokens: 10000, maxTokens: 128000, utilization: 7.8 },
      { tsMs: 2500, usedTokens: 12000, maxTokens: 128000, utilization: 9.4 },
      { tsMs: 6000, usedTokens: 14000, maxTokens: 128000, utilization: 10.9 },
      { tsMs: 9000, usedTokens: 30000, maxTokens: 128000, utilization: 23.4 },
    ];
    const usage: AssistantUsageEntry[] = [];
    const spans = [
      makeSpan({ name: "scout", fullName: "ralph.scout", startMs: 2000, endMs: 4000 }),
      makeSpan({ name: "reviewer", fullName: "ralph.reviewer", startMs: 5000, endMs: 7000 }),
    ];

    const slices = splitEntriesByAgent(entries, usage, spans);
    expect(slices).toHaveLength(3);
    expect(slices.map((s) => s.name)).toEqual(["main", "scout", "reviewer"]);
    expect(slices[0].entries).toHaveLength(2); // 500, 9000
    expect(slices[1].entries).toHaveLength(1); // 2500
    expect(slices[2].entries).toHaveLength(1); // 6000
  });

  it("skips subagents with no data", () => {
    const entries: ContextWindowEntry[] = [
      { tsMs: 1000, usedTokens: 20000, maxTokens: 128000, utilization: 15.6 },
    ];
    const span = makeSpan({ startMs: 5000, endMs: 6000 });

    const slices = splitEntriesByAgent(entries, [], [span]);
    expect(slices).toHaveLength(1);
    expect(slices[0].name).toBe("main");
  });
});
