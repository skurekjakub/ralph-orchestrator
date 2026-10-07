/** Category a tool call is coloured and counted by in the timeline. */
export type ToolCategory = "skill" | "mcp" | "edit" | "shell" | "nav" | "subagent" | "other";

/** Kind of tool an audit v2 record names (`toolKind`, `shared/hooks/README.md`). */
export type AuditToolKind = "subagent" | "skill" | "shell" | "file" | "mcp" | "other";

/** Parsed tool call entry for the main timeline visualization. */
export interface ToolCallEntry {
  /** Index in the overall call sequence. */
  index: number;
  /** Epoch millisecond timestamp from pre-tool.log (when the call started). */
  ts: number;
  /** Tool name (e.g. "bash", "skill", "ralphchives-read-search_ralphchives", "Bash", "mcp__ado__ado_push_progress"). */
  tool: string;
  /** Parsed args object; empty when the source records no arguments (run telemetry). */
  args: Record<string, unknown>;
  /** Kind of tool from the audit v2 record; absent for older records. */
  toolKind?: AuditToolKind;
  /** The call's id; Claude Code audit records and run telemetry carry it. */
  toolUseId?: string;
  /** Display name of the subagent that made the call; absent for a main-thread call or when the log does not say. */
  agent?: string;
  /** Whether this is a skill invocation: audit v2 `toolKind`, else tool === "skill". */
  isSkill: boolean;
  /** Skill name if isSkill: audit v2 `skill`, else args.skill. */
  skillName?: string;
  /** Whether this is a subagent invocation: audit v2 `toolKind`, else tool === "task". */
  isSubagent: boolean;
  /** Subagent name if isSubagent, prefix-stripped: audit v2 `subagent`, else args.agent_type. */
  subagentName?: string;
  /** Execution status from tool-output.log or run telemetry (`success`, `failure`). */
  status?: string;
  /** Return value text from tool-output.log. */
  returnValue?: string;
  /** Duration in ms: from run telemetry when it has the call, else the gap to the next entry's timestamp. */
  durationMs?: number;
}

/** Raw pre-tool.log JSONL entry; the optional fields come only in audit v2 records (`schemaVersion: 2`). */
export interface PreToolEntry {
  event: string;
  ts: number;
  session: string;
  tool: string;
  args: string;
  schemaVersion?: number;
  /** The CLI that ran the call (`claude`, `copilot`). */
  cli?: string;
  /** The running agent's name; null on Copilot. */
  agent?: string | null;
  /** Set when a subagent made the call; null for a main-thread call and on Copilot. */
  agentId?: string | null;
  /** The call's id; null on Copilot. */
  toolUseId?: string | null;
  toolKind?: AuditToolKind;
  /** The subagent a `subagent` call starts. */
  subagent?: string | null;
  /** The skill a `skill` call loads. */
  skill?: string | null;
}

/** Parsed tool-output.log entry. */
export interface ToolOutputEntry {
  tool: string;
  status: string;
  args: string;
  returnValue: string;
}

/** A single tool call made by a subagent, extracted from cli-debug.log or run telemetry. */
export interface SubagentToolCall {
  /** ISO timestamp string from the log line; empty when the log has none. */
  ts: string;
  /** Epoch millisecond timestamp; 0 when the log has none. */
  tsMs: number;
  /** Tool name (e.g. "bash", "view", "ado-ado_list_pull_requests", "Write"). */
  tool: string;
  /** Tool arguments JSON string (from the model response). */
  argsJson?: string;
  /** Raw return value text from the cli-debug log. */
  returnValue?: string;
  /** From the call to its result (run telemetry). */
  durationMs?: number;
  /** Whether the result was an error (run telemetry). */
  isError?: boolean;
}

/** Parsed subagent lifecycle entry from cli-debug.log or run telemetry. */
export interface SubagentSpan {
  /** Subagent name (e.g. "malph-scout", stripped of "ralph." prefix). */
  name: string;
  /** Full agent identifier (e.g. "ralph.malph-scout"). */
  fullName: string;
  /** Model configured in the agent definition (may not match actual). */
  definitionModel?: string;
  /** Model actually used for inference. */
  resolvedModel: string;
  /** Whether the model fell back from definition to session model. */
  didFallback: boolean;
  /** ISO timestamp of subagent start. */
  startTs: string;
  /** ISO timestamp of subagent completion. */
  endTs?: string;
  /** Epoch ms start. */
  startMs: number;
  /** Epoch ms end. */
  endMs?: number;
  /** Duration in ms. */
  durationMs?: number;
  /** Total tool_call_executed events within this subagent span. */
  toolCallCount: number;
  /** Model call (LLM turn) count within this subagent span. */
  modelCallCount: number;
  /** Extracted tool calls with names and timestamps. */
  toolCalls: SubagentToolCall[];
  /** The tool call that spawned the subagent (run telemetry). */
  toolUseId?: string;
}

/** Context window utilization snapshot from CompactionProcessor log lines. */
export interface ContextWindowEntry {
  /** Epoch millisecond timestamp. */
  tsMs: number;
  /** Number of tokens currently used in context. */
  usedTokens: number;
  /** Maximum context window size in tokens. */
  maxTokens: number;
  /** Utilization percentage (0–100). */
  utilization: number;
}

/** Per-turn token usage from assistant_usage telemetry events. */
export interface AssistantUsageEntry {
  /** Epoch millisecond timestamp. */
  tsMs: number;
  /** Tokens in the prompt sent to the model. */
  promptTokens: number;
  /** Tokens generated by the model. */
  completionTokens: number;
  /** Prompt tokens served from cache. */
  cachedTokens: number;
  /** Total tokens (prompt + completion). */
  totalTokens: number;
}

/** Tree node representing a single subagent invocation with nesting. */
export interface SubagentTreeNode {
  /** Unique node ID (e.g. "node-0", "node-1"). */
  id: string;
  /** Nesting depth (0 = synthetic root). */
  depth: number;
  /** Parent node ID (null for root). */
  parentId: string | null;
  /** Child invocations. */
  children: SubagentTreeNode[];
  /** 1-based invocation index per agent name (e.g. content-writer #3). */
  invocationIndex: number;
  /** Context window entries attributed to this node. */
  contextWindowEntries: ContextWindowEntry[];
  /** Assistant usage entries attributed to this node. */
  assistantUsageEntries: AssistantUsageEntry[];
  /** True if this span never received a subagent_completed event. */
  unclosed?: boolean;
  /** All SubagentSpan fields inlined. */
  name: string;
  fullName: string;
  definitionModel?: string;
  resolvedModel: string;
  didFallback: boolean;
  startTs: string;
  endTs?: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  toolCallCount: number;
  modelCallCount: number;
  toolCalls: SubagentToolCall[];
}

/** Result of tree-based parsing. */
export interface ParsedTree {
  /** Synthetic root node (depth 0). */
  root: SubagentTreeNode;
  /** Flat array of all nodes including root for easy lookup. */
  allNodes: SubagentTreeNode[];
}

/** Per-agent-type breakdown row for run summary. */
export interface AgentBreakdownEntry {
  /** Agent display name. */
  name: string;
  /** Number of invocations. */
  count: number;
  /** Total duration across all invocations (ms). */
  totalDurationMs: number;
  /** Total tokens consumed; null when the logs record no token usage (Claude Code run telemetry). */
  totalTokens: number | null;
  /** Total compaction events detected across this agent type. */
  compactionCount: number;
  /** Max depth reached by this agent type. */
  maxDepth: number;
}

/** Aggregate statistics for an entire run. */
export interface RunSummary {
  /** Total wall-clock duration of the run (ms). */
  totalDurationMs: number;
  /** Total number of subagent invocations. */
  totalInvocations: number;
  /** Maximum nesting depth. */
  maxDepth: number;
  /** Total prompt tokens across all invocations; null when the logs record no token usage. */
  totalPromptTokens: number | null;
  /** Total completion tokens across all invocations; null when the logs record no token usage. */
  totalCompletionTokens: number | null;
  /** Total cached tokens across all invocations; null when the logs record no token usage. */
  totalCachedTokens: number | null;
  /** Number of compaction events detected. */
  compactionCount: number;
  /** Per-agent-type breakdown. */
  agentBreakdown: AgentBreakdownEntry[];
}

/** A run's subagent tree and summary, as the fractal explorer shows them. */
export interface RunAnalysis {
  tree: ParsedTree;
  summary: RunSummary;
}

/** Log files the tool timeline reads, relative to the log directory; it needs pre-tool.log or run telemetry. */
export interface TimelineFiles {
  preTool?: string;
  toolOutput?: string;
  /** Copilot CLI debug log, read for Copilot subagents and context-window charts. */
  cliDebug?: string;
  runTelemetry?: string;
}

/**
 * Telemetry the orchestrator derives on the host from an agent CLI's session logs
 * (`<taskId>-<ts>-<cli>-run-telemetry.json`), mirroring `RunTelemetry` at schema version 1 in the
 * orchestrator's `src/cli/telemetry/run-telemetry.ts`. Timestamps are epoch ms, left out when the logs carry
 * none. It records no token usage.
 */
export interface RunTelemetry {
  schemaVersion: 1;
  /** The CLI whose sessions it describes (`claude`). */
  cli: string;
  /** Session ids in start order. */
  sessionIds: string[];
  totals: RunTelemetryTotals;
  /** The main thread and every subagent of every session; `parentSpanId` makes them a tree per session. */
  spans: RunTelemetrySpan[];
}

/** Counts over every span of a run. */
export interface RunTelemetryTotals {
  sessions: number;
  subagents: number;
  toolCalls: number;
  /** Tool calls whose result was an error, a denied call included. */
  failedToolCalls: number;
  /** Model responses: distinct assistant messages. */
  modelCalls: number;
  apiErrors: number;
  compactions: number;
  /** Session log lines that were not JSON objects and were skipped. */
  malformedLines: number;
  /** From the first to the last timestamp of any session. */
  durationMs?: number;
}

/** One agent thread: a session's main thread or one subagent run. */
export interface RunTelemetrySpan {
  /** The session id for a main thread, `<session id>/<agent id>` for a subagent. */
  spanId: string;
  /** The span whose tool call spawned this subagent; absent for a main thread. */
  parentSpanId?: string;
  sessionId: string;
  /** The session's agent name, or the subagent type. */
  agent: string;
  /** 0 for a main thread, the spawn depth for a subagent. */
  depth: number;
  /** The tool call that spawned the subagent. */
  toolUseId?: string;
  /** Models that answered, in order of first use. */
  models: string[];
  startTs?: number;
  endTs?: number;
  durationMs?: number;
  /** Model responses: distinct assistant messages. */
  modelCalls: number;
  toolCalls: RunTelemetryToolCall[];
  /** API errors, such as a failed authentication, by the kind the CLI reports. */
  apiErrors: { ts?: number; kind: string }[];
  /** Context compactions and what triggered them (`auto`, `manual`). */
  compactions: { ts?: number; trigger?: string }[];
}

/** One tool call of a span. */
export interface RunTelemetryToolCall {
  toolUseId: string;
  tool: string;
  /** When the model asked for the call. */
  ts?: number;
  /** From the call to its result; absent when the log holds no result. */
  durationMs?: number;
  /** Whether the result was an error; absent when the log holds no result. */
  isError?: boolean;
  /** The span of the subagent the call spawned. */
  spawnedSpanId?: string;
}
