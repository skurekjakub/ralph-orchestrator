/** Parsed tool call entry for the main timeline visualization. */
export interface ToolCallEntry {
  /** Index in the overall call sequence. */
  index: number;
  /** Epoch millisecond timestamp from pre-tool.log (when the call started). */
  ts: number;
  /** Tool name (e.g. "bash", "skill", "ralphchives-read-search_ralphchives"). */
  tool: string;
  /** Parsed args object. */
  args: Record<string, unknown>;
  /** Whether this is a skill invocation (tool === "skill"). */
  isSkill: boolean;
  /** Skill name if isSkill (extracted from args.skill). */
  skillName?: string;
  /** Whether this is a subagent invocation (tool === "task"). */
  isSubagent: boolean;
  /** Subagent name if isSubagent (extracted from args.agent_type, prefix-stripped). */
  subagentName?: string;
  /** Execution status from tool-output.log (e.g. "success"). */
  status?: string;
  /** Return value text from tool-output.log. */
  returnValue?: string;
  /** Duration in ms (computed from gap to next entry's timestamp). */
  durationMs?: number;
}

/** Raw pre-tool.log JSONL entry. */
export interface PreToolEntry {
  event: string;
  ts: number;
  session: string;
  tool: string;
  args: string;
}

/** Parsed tool-output.log entry. */
export interface ToolOutputEntry {
  tool: string;
  status: string;
  args: string;
  returnValue: string;
}

/** A single tool call made by a subagent, extracted from cli-debug.log. */
export interface SubagentToolCall {
  /** ISO timestamp string from the log line. */
  ts: string;
  /** Epoch millisecond timestamp. */
  tsMs: number;
  /** Tool name (e.g. "bash", "view", "ado-ado_list_pull_requests"). */
  tool: string;
  /** Tool arguments JSON string (from the model response). */
  argsJson?: string;
}

/** Parsed subagent lifecycle entry from cli-debug.log. */
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
}