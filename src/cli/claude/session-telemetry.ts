import { CliType } from "../../config/types";
import {
  type AgentSpan,
  RUN_TELEMETRY_SCHEMA_VERSION,
  type RunTelemetry,
  type ToolCallSpan,
} from "../telemetry/run-telemetry";
import { type ClaudeSession, type SessionThread, SessionEventKind } from "./session-log";

/** Where a thread sits in its session's tree. */
interface SpanPlacement {
  readonly spanId: string;
  readonly sessionId: string;
  readonly agent: string;
  readonly depth: number;
  readonly parentSpanId?: string;
  readonly toolUseId?: string;
}

function subagentSpanId(sessionId: string, agentId: string): string {
  return `${sessionId}/${agentId}`;
}

/** Earliest and latest of `times`, or undefined when there are none; a long session has too many to spread. */
function timeRange(times: readonly number[]): { start: number; end: number } | undefined {
  if (times.length === 0) return undefined;
  return times.reduce((range, ts) => ({ start: Math.min(range.start, ts), end: Math.max(range.end, ts) }), {
    start: times[0],
    end: times[0],
  });
}

/** One thread's span; `spawned` maps a tool call id to the span of the subagent it started. */
function spanOf(thread: SessionThread, placement: SpanPlacement, spawned: ReadonlyMap<string, string>): AgentSpan {
  const results = new Map<string, { ts?: number; isError: boolean }>();
  for (const event of thread.events) {
    if (event.kind === SessionEventKind.ToolResult) results.set(event.toolUseId, event);
  }

  const models: string[] = [];
  const toolCalls: ToolCallSpan[] = [];
  const apiErrors: { ts?: number; kind: string }[] = [];
  const compactions: { ts?: number; trigger?: string }[] = [];
  const hookFeedback: { ts?: number; hook: string }[] = [];
  let modelCalls = 0;
  for (const event of thread.events) {
    switch (event.kind) {
      case SessionEventKind.ModelResponse:
        modelCalls++;
        if (event.model !== undefined && !models.includes(event.model)) models.push(event.model);
        break;
      case SessionEventKind.ToolCall: {
        const result = results.get(event.toolUseId);
        const spawnedSpanId = spawned.get(event.toolUseId);
        toolCalls.push({
          toolUseId: event.toolUseId,
          tool: event.tool,
          ...(event.ts === undefined ? {} : { ts: event.ts }),
          ...(result?.ts !== undefined && event.ts !== undefined ? { durationMs: result.ts - event.ts } : {}),
          ...(result === undefined ? {} : { isError: result.isError }),
          ...(spawnedSpanId === undefined ? {} : { spawnedSpanId }),
        });
        break;
      }
      case SessionEventKind.ApiError:
        apiErrors.push({ ...(event.ts === undefined ? {} : { ts: event.ts }), kind: event.error });
        break;
      case SessionEventKind.Compaction:
        compactions.push({
          ...(event.ts === undefined ? {} : { ts: event.ts }),
          ...(event.trigger === undefined ? {} : { trigger: event.trigger }),
        });
        break;
      case SessionEventKind.HookFeedback:
        hookFeedback.push({ ...(event.ts === undefined ? {} : { ts: event.ts }), hook: event.hook });
        break;
    }
  }

  const range = timeRange(thread.events.flatMap((e) => (e.ts === undefined ? [] : [e.ts])));
  return {
    ...placement,
    models,
    ...(range && { startTs: range.start, endTs: range.end, durationMs: range.end - range.start }),
    modelCalls,
    toolCalls,
    apiErrors,
    compactions,
    hookFeedback,
  };
}

/**
 * The spans of one session: its main thread, then its subagents. A subagent's parent is the thread that
 * holds the tool call which spawned it, else the subagent its metadata names, else the main thread.
 */
function sessionSpans(session: ClaudeSession): AgentSpan[] {
  const { sessionId } = session;
  const spawned = new Map(
    session.subagents.flatMap((s) =>
      s.toolUseId === undefined ? [] : [[s.toolUseId, subagentSpanId(sessionId, s.agentId)] as const],
    ),
  );
  const callingSpan = new Map<string, string>();
  const threads: { spanId: string; thread: SessionThread }[] = [
    { spanId: sessionId, thread: session },
    ...session.subagents.map((s) => ({ spanId: subagentSpanId(sessionId, s.agentId), thread: s })),
  ];
  for (const { spanId, thread } of threads) {
    for (const event of thread.events) {
      if (event.kind === SessionEventKind.ToolCall) callingSpan.set(event.toolUseId, spanId);
    }
  }
  const agentIds = new Set(session.subagents.map((s) => s.agentId));

  const spans = [
    spanOf(session, { spanId: sessionId, sessionId, agent: session.agent ?? "unknown", depth: 0 }, spawned),
  ];
  for (const subagent of session.subagents) {
    const parentSpanId =
      (subagent.toolUseId === undefined ? undefined : callingSpan.get(subagent.toolUseId)) ??
      (subagent.parentAgentId !== undefined && agentIds.has(subagent.parentAgentId)
        ? subagentSpanId(sessionId, subagent.parentAgentId)
        : sessionId);
    const placement: SpanPlacement = {
      spanId: subagentSpanId(sessionId, subagent.agentId),
      sessionId,
      agent: subagent.agentType,
      depth: subagent.spawnDepth ?? 1,
      parentSpanId,
      ...(subagent.toolUseId === undefined ? {} : { toolUseId: subagent.toolUseId }),
    };
    spans.push(spanOf(subagent, placement, spawned));
  }
  return spans;
}

/**
 * Telemetry of Claude Code sessions: one span per main thread and subagent, with its models, model calls,
 * tool calls and their durations and errors, API errors, compactions and hook feedback. Token usage and
 * cost are not recorded.
 */
export function extractClaudeTelemetry(sessions: readonly ClaudeSession[]): RunTelemetry {
  const spans = sessions.flatMap(sessionSpans);
  const sum = (count: (span: AgentSpan) => number): number => spans.reduce((total, span) => total + count(span), 0);
  const range = timeRange(spans.flatMap((s) => (s.startTs === undefined ? [] : [s.startTs, s.endTs ?? s.startTs])));
  const malformedLines = sessions.reduce(
    (total, s) => total + s.malformedLines + s.subagents.reduce((n, sub) => n + sub.malformedLines, 0),
    0,
  );

  return {
    schemaVersion: RUN_TELEMETRY_SCHEMA_VERSION,
    cli: CliType.Claude,
    sessionIds: sessions.map((s) => s.sessionId),
    totals: {
      sessions: sessions.length,
      subagents: sum((s) => (s.depth > 0 ? 1 : 0)),
      toolCalls: sum((s) => s.toolCalls.length),
      failedToolCalls: sum((s) => s.toolCalls.filter((c) => c.isError === true).length),
      modelCalls: sum((s) => s.modelCalls),
      apiErrors: sum((s) => s.apiErrors.length),
      compactions: sum((s) => s.compactions.length),
      hookFeedback: sum((s) => s.hookFeedback.length),
      malformedLines,
      ...(range && { durationMs: range.end - range.start }),
    },
    spans,
  };
}
