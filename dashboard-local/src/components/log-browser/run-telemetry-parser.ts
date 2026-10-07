import { getToolCategory } from "./tool-timeline-categories";
import { agentDisplayName } from "./tool-timeline-shared";
import type {
  AgentBreakdownEntry,
  ParsedTree,
  RunSummary,
  RunTelemetry,
  RunTelemetrySpan,
  RunTelemetryToolCall,
  SubagentSpan,
  SubagentToolCall,
  SubagentTreeNode,
  ToolCallEntry,
} from "./tool-timeline-types";

/** The run telemetry layout this parser reads. */
const RUN_TELEMETRY_SCHEMA_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptional(value: unknown, type: "number" | "string" | "boolean"): boolean {
  return value === undefined || typeof value === type;
}

function isToolCall(value: unknown): value is RunTelemetryToolCall {
  return (
    isRecord(value) &&
    typeof value.toolUseId === "string" &&
    typeof value.tool === "string" &&
    isOptional(value.ts, "number") &&
    isOptional(value.durationMs, "number") &&
    isOptional(value.isError, "boolean") &&
    isOptional(value.spawnedSpanId, "string")
  );
}

function isSpan(value: unknown): value is RunTelemetrySpan {
  return (
    isRecord(value) &&
    typeof value.spanId === "string" &&
    isOptional(value.parentSpanId, "string") &&
    typeof value.sessionId === "string" &&
    typeof value.agent === "string" &&
    typeof value.depth === "number" &&
    isOptional(value.toolUseId, "string") &&
    Array.isArray(value.models) &&
    value.models.every((model) => typeof model === "string") &&
    isOptional(value.startTs, "number") &&
    isOptional(value.endTs, "number") &&
    isOptional(value.durationMs, "number") &&
    typeof value.modelCalls === "number" &&
    Array.isArray(value.toolCalls) &&
    value.toolCalls.every(isToolCall) &&
    Array.isArray(value.apiErrors) &&
    value.apiErrors.every((e) => isRecord(e) && typeof e.kind === "string" && isOptional(e.ts, "number")) &&
    Array.isArray(value.compactions) &&
    value.compactions.every((c) => isRecord(c) && isOptional(c.ts, "number") && isOptional(c.trigger, "string")) &&
    Array.isArray(value.hookFeedback) &&
    value.hookFeedback.every((h) => isRecord(h) && typeof h.hook === "string" && isOptional(h.ts, "number"))
  );
}

const TOTAL_COUNTS = [
  "sessions",
  "subagents",
  "toolCalls",
  "failedToolCalls",
  "modelCalls",
  "apiErrors",
  "compactions",
  "hookFeedback",
  "malformedLines",
] as const;

/**
 * Reads a run telemetry file.
 *
 * @returns The telemetry, or null when the text is not JSON of the schema version this dashboard reads.
 */
export function parseRunTelemetry(content: string): RunTelemetry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== RUN_TELEMETRY_SCHEMA_VERSION) return null;
  const { cli, sessionIds, totals, spans } = parsed;
  const valid =
    typeof cli === "string" &&
    Array.isArray(sessionIds) &&
    sessionIds.every((id) => typeof id === "string") &&
    isRecord(totals) &&
    TOTAL_COUNTS.every((key) => typeof totals[key] === "number") &&
    isOptional(totals.durationMs, "number") &&
    Array.isArray(spans) &&
    spans.every(isSpan);
  return valid ? (parsed as unknown as RunTelemetry) : null;
}

/**
 * Each span's children in start order, keyed by parent span id; main threads are keyed by `undefined`. A
 * subagent whose parent span is missing hangs off its session's main thread.
 */
function childrenByParent(telemetry: RunTelemetry): Map<string | undefined, RunTelemetrySpan[]> {
  const ids = new Set(telemetry.spans.map((span) => span.spanId));
  const children = new Map<string | undefined, RunTelemetrySpan[]>();
  for (const span of telemetry.spans) {
    const parent =
      span.parentSpanId !== undefined && ids.has(span.parentSpanId)
        ? span.parentSpanId
        : span.spanId !== span.sessionId && ids.has(span.sessionId)
          ? span.sessionId
          : undefined;
    const siblings = children.get(parent) ?? [];
    siblings.push(span);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort(byStart);
  return children;
}

function byStart(a: { startTs?: number }, b: { startTs?: number }): number {
  return (a.startTs ?? Infinity) - (b.startTs ?? Infinity);
}

/** Every span in tree order: each main thread, then its subagents depth-first. */
function spansInTreeOrder(telemetry: RunTelemetry): RunTelemetrySpan[] {
  const children = childrenByParent(telemetry);
  const ordered: RunTelemetrySpan[] = [];
  const walk = (span: RunTelemetrySpan) => {
    ordered.push(span);
    for (const child of children.get(span.spanId) ?? []) walk(child);
  };
  for (const main of children.get(undefined) ?? []) walk(main);
  return ordered;
}

function isoOrEmpty(ts: number | undefined): string {
  return ts === undefined ? "" : new Date(ts).toISOString();
}

function resultStatus(isError: boolean | undefined): string | undefined {
  if (isError === undefined) return undefined;
  return isError ? "failure" : "success";
}

function subagentToolCall(call: RunTelemetryToolCall): SubagentToolCall {
  return {
    ts: isoOrEmpty(call.ts),
    tsMs: call.ts ?? 0,
    tool: call.tool,
    ...(call.durationMs !== undefined && { durationMs: call.durationMs }),
    ...(call.isError !== undefined && { isError: call.isError }),
  };
}

/** A span as the timeline's subagent shape; telemetry names no definition model, so nothing reads as a fallback. */
function spanFields(span: RunTelemetrySpan): SubagentSpan {
  return {
    name: agentDisplayName(span.agent),
    fullName: span.agent,
    resolvedModel: span.models.length > 0 ? span.models.join(", ") : "unknown",
    didFallback: false,
    startTs: isoOrEmpty(span.startTs),
    ...(span.endTs !== undefined && { endTs: isoOrEmpty(span.endTs), endMs: span.endTs }),
    startMs: span.startTs ?? 0,
    ...(span.durationMs !== undefined && { durationMs: span.durationMs }),
    toolCallCount: span.toolCalls.length,
    modelCallCount: span.modelCalls,
    toolCalls: span.toolCalls.map(subagentToolCall),
    ...(span.toolUseId !== undefined && { toolUseId: span.toolUseId }),
  };
}

/**
 * The run's subagents for the timeline's subagent views, in tree order. Main threads are left out, as is a
 * subagent whose log carries no timestamp, since it has no place on a time axis.
 */
export function telemetrySubagentSpans(telemetry: RunTelemetry): SubagentSpan[] {
  return spansInTreeOrder(telemetry)
    .filter((span) => span.depth > 0 && span.startTs !== undefined)
    .map(spanFields);
}

/**
 * The run as a subagent tree. A run of one session is rooted at its main thread; a run of several (one per
 * pipeline stage) at a synthetic `run` node over their main threads. Nodes carry no context-window or token
 * entries: the telemetry records none.
 */
export function buildTelemetryTree(telemetry: RunTelemetry): ParsedTree {
  const children = childrenByParent(telemetry);
  const allNodes: SubagentTreeNode[] = [];
  const toNode = (span: RunTelemetrySpan, depth: number, parentId: string | null): SubagentTreeNode => {
    const node: SubagentTreeNode = {
      ...spanFields(span),
      id: span.spanId,
      depth,
      parentId,
      children: [],
      invocationIndex: 0,
      contextWindowEntries: [],
      assistantUsageEntries: [],
    };
    allNodes.push(node);
    node.children = (children.get(span.spanId) ?? []).map((child) => toNode(child, depth + 1, node.id));
    return node;
  };

  const mains = children.get(undefined) ?? [];
  let root: SubagentTreeNode;
  if (mains.length === 1) {
    root = toNode(mains[0], 0, null);
  } else {
    const starts = telemetry.spans.flatMap((s) => (s.startTs === undefined ? [] : [s.startTs]));
    const ends = telemetry.spans.flatMap((s) => (s.endTs === undefined ? [] : [s.endTs]));
    const startMs = starts.length > 0 ? Math.min(...starts) : undefined;
    const endMs = ends.length > 0 ? Math.max(...ends) : undefined;
    root = {
      id: "run",
      depth: 0,
      parentId: null,
      children: [],
      invocationIndex: 0,
      contextWindowEntries: [],
      assistantUsageEntries: [],
      name: "run",
      fullName: "run",
      resolvedModel: "unknown",
      didFallback: false,
      startTs: isoOrEmpty(startMs),
      startMs: startMs ?? 0,
      ...(endMs !== undefined && { endTs: isoOrEmpty(endMs), endMs }),
      ...(telemetry.totals.durationMs !== undefined && { durationMs: telemetry.totals.durationMs }),
      toolCallCount: 0,
      modelCallCount: 0,
      toolCalls: [],
    };
    allNodes.push(root);
    root.children = mains.map((main) => toNode(main, 1, root.id));
  }

  const invocations = new Map<string, number>();
  for (const node of [...allNodes].sort(byStartMs)) {
    if (node === root) continue;
    node.invocationIndex = (invocations.get(node.name) ?? 0) + 1;
    invocations.set(node.name, node.invocationIndex);
  }
  return { root, allNodes };
}

function byStartMs(a: SubagentTreeNode, b: SubagentTreeNode): number {
  return (a.startMs || Infinity) - (b.startMs || Infinity);
}

/** Aggregate figures of the run for the run summary; token totals are null because the telemetry records none. */
export function buildTelemetryRunSummary(telemetry: RunTelemetry): RunSummary {
  const breakdown = new Map<string, AgentBreakdownEntry>();
  for (const span of telemetry.spans.filter((s) => s.depth > 0)) {
    const name = agentDisplayName(span.agent);
    const entry = breakdown.get(name) ?? {
      name,
      count: 0,
      totalDurationMs: 0,
      totalTokens: null,
      compactionCount: 0,
      maxDepth: 0,
    };
    entry.count++;
    entry.totalDurationMs += span.durationMs ?? 0;
    entry.compactionCount += span.compactions.length;
    entry.maxDepth = Math.max(entry.maxDepth, span.depth);
    breakdown.set(name, entry);
  }

  return {
    totalDurationMs: telemetry.totals.durationMs ?? 0,
    totalInvocations: telemetry.totals.subagents,
    maxDepth: Math.max(0, ...telemetry.spans.map((s) => s.depth)),
    totalPromptTokens: null,
    totalCompletionTokens: null,
    totalCachedTokens: null,
    compactionCount: telemetry.totals.compactions,
    agentBreakdown: [...breakdown.values()].sort((a, b) => b.totalDurationMs - a.totalDurationMs),
  };
}

/**
 * The run's tool calls as a timeline, for a run without a pre-tool.log (its hooks did not run): every timed
 * call of every span in call order, with the telemetry's duration and result. Arguments, outputs and skill
 * names are not in the telemetry, so the entries carry none.
 */
export function telemetryTimeline(telemetry: RunTelemetry): ToolCallEntry[] {
  const spansById = new Map(telemetry.spans.map((span) => [span.spanId, span]));
  const timed = telemetry.spans
    .flatMap((span) => span.toolCalls.flatMap((call) => (call.ts === undefined ? [] : [{ span, call, ts: call.ts }])))
    .sort((a, b) => a.ts - b.ts);

  return timed.map(({ span, call, ts }, index) => {
    const category = getToolCategory(call.tool);
    const spawned = call.spawnedSpanId === undefined ? undefined : spansById.get(call.spawnedSpanId);
    const status = resultStatus(call.isError);
    return {
      index,
      ts,
      tool: call.tool,
      args: {},
      toolUseId: call.toolUseId,
      ...(span.depth > 0 && { agent: agentDisplayName(span.agent) }),
      isSkill: category === "skill",
      isSubagent: spawned !== undefined || category === "subagent",
      ...(spawned && { subagentName: agentDisplayName(spawned.agent) }),
      ...(status && { status }),
      ...(call.durationMs !== undefined && { durationMs: call.durationMs }),
    };
  });
}

/**
 * Timeline entries with what the telemetry knows of the same call (matched by call id): its measured
 * duration in place of the gap to the next entry, its result in place of the tool-output.log status matched by
 * tool order, and the subagent it spawned when the audit record named none. Entries without a match are kept.
 */
export function applyTelemetryToTimeline(timeline: ToolCallEntry[], telemetry: RunTelemetry): ToolCallEntry[] {
  const calls = new Map(telemetry.spans.flatMap((span) => span.toolCalls.map((call) => [call.toolUseId, call])));
  const spansById = new Map(telemetry.spans.map((span) => [span.spanId, span]));
  return timeline.map((entry) => {
    const call = entry.toolUseId === undefined ? undefined : calls.get(entry.toolUseId);
    if (!call) return entry;
    const spawned = call.spawnedSpanId === undefined ? undefined : spansById.get(call.spawnedSpanId);
    const status = resultStatus(call.isError);
    return {
      ...entry,
      ...(call.durationMs !== undefined && { durationMs: call.durationMs }),
      ...(status && { status }),
      ...(entry.isSubagent && !entry.subagentName && spawned && { subagentName: agentDisplayName(spawned.agent) }),
    };
  });
}
