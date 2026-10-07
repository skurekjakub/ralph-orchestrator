import type { CliType } from "../../config/types";

/** Version of the {@link RunTelemetry} layout; it changes with any change a reader must know about. */
export const RUN_TELEMETRY_SCHEMA_VERSION = 1;

/**
 * Telemetry of the agent CLI sessions of one task, derived on the host from the CLI's session logs and
 * written as `<taskId>-<ts>-<cli>-run-telemetry.json`. Timestamps are epoch milliseconds (UTC); one that
 * the logs do not carry is left out. Holds no free text, so it needs no redaction.
 */
export interface RunTelemetry {
  readonly schemaVersion: typeof RUN_TELEMETRY_SCHEMA_VERSION;
  readonly cli: CliType;
  /** Session ids in start order. */
  readonly sessionIds: readonly string[];
  readonly totals: RunTelemetryTotals;
  /** The main thread and every subagent of every session; `parentSpanId` makes them a tree per session. */
  readonly spans: readonly AgentSpan[];
}

/** Counts over every span of the run. */
export interface RunTelemetryTotals {
  readonly sessions: number;
  readonly subagents: number;
  readonly toolCalls: number;
  /** Tool calls whose result was an error, a denied call included. */
  readonly failedToolCalls: number;
  /** Model responses: distinct assistant messages. */
  readonly modelCalls: number;
  readonly apiErrors: number;
  readonly compactions: number;
  /** Session log lines that were not JSON objects and were skipped. */
  readonly malformedLines: number;
  /** From the first to the last timestamp of any session. */
  readonly durationMs?: number;
}

/** One agent thread: a session's main thread or one subagent run. */
export interface AgentSpan {
  /** The session id for a main thread, `<session id>/<agent id>` for a subagent. */
  readonly spanId: string;
  /** The span whose tool call spawned this subagent; absent for a main thread. */
  readonly parentSpanId?: string;
  readonly sessionId: string;
  /** The agent that ran: the session's agent name, or the subagent type. */
  readonly agent: string;
  /** 0 for a main thread, the spawn depth for a subagent. */
  readonly depth: number;
  /** The tool call that spawned the subagent. */
  readonly toolUseId?: string;
  /** Models that answered, in order of first use. */
  readonly models: readonly string[];
  readonly startTs?: number;
  readonly endTs?: number;
  readonly durationMs?: number;
  /** Model responses: distinct assistant messages. */
  readonly modelCalls: number;
  readonly toolCalls: readonly ToolCallSpan[];
  /** API errors, such as a failed authentication, by the kind the CLI reports. */
  readonly apiErrors: readonly { readonly ts?: number; readonly kind: string }[];
  /** Context compactions and what triggered them (`auto`, `manual`). */
  readonly compactions: readonly { readonly ts?: number; readonly trigger?: string }[];
}

/** One tool call of a span. */
export interface ToolCallSpan {
  readonly toolUseId: string;
  readonly tool: string;
  /** When the model asked for the call. */
  readonly ts?: number;
  /** From the call to its result; absent when the log holds no result. */
  readonly durationMs?: number;
  /** Whether the result was an error; absent when the log holds no result. */
  readonly isError?: boolean;
  /** The span of the subagent the call spawned. */
  readonly spawnedSpanId?: string;
}
