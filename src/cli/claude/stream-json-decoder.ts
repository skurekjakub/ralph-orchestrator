import type {
  CliError,
  CliModelUsage,
  CliRunOutcome,
  CliRunUsage,
  DecodedLine,
  ICliOutputDecoder,
} from "../output-decoder";
import { hasResultBlock } from "../../container/result-parser";
import { truncate } from "../../util/text";

/** A parsed JSON object from one stream-json line. Every field is untrusted and checked before use. */
type JsonRecord = Readonly<Record<string, unknown>>;

/** Longest tool-input preview in a log line. */
const TOOL_INPUT_PREVIEW_CHARS = 160;

/** Longest tool-error, task-summary or result-message preview in a log line. */
const MESSAGE_PREVIEW_CHARS = 300;

/** Tool-input fields that name what a tool call acts on, in preference order. */
const TOOL_SUBJECT_FIELDS = ["command", "file_path", "path", "skill", "pattern", "url", "query"] as const;

/** Claude Code tool names that spawn a subagent. */
const SUBAGENT_TOOLS = new Set(["Agent", "Task"]);

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `text` on one line, cut to `max` characters. */
function preview(text: string, max: number): string {
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

/** What a tool call acts on: the subagent and task for a spawn, else the first subject field, else the input as JSON. */
function toolSubject(name: string, input: JsonRecord | undefined): string {
  if (!input) return "";
  if (SUBAGENT_TOOLS.has(name)) {
    const type = asString(input.subagent_type) ?? "?";
    const description = asString(input.description);
    return description ? `${type}: ${description}` : type;
  }
  for (const field of TOOL_SUBJECT_FIELDS) {
    const value = asString(input[field]);
    if (value) return value;
  }
  return JSON.stringify(input);
}

/** Text of a tool result, whose `content` is a string or a list of text blocks. */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  return asArray(content)
    .map((block) => asString(asRecord(block)?.text) ?? "")
    .join(" ");
}

/** Per-model usage from a `result` event's cumulative `modelUsage`. */
function modelUsageOf(result: JsonRecord): Record<string, CliModelUsage> {
  const byModel: Record<string, CliModelUsage> = {};
  for (const [model, raw] of Object.entries(asRecord(result.modelUsage) ?? {})) {
    const usage = asRecord(raw);
    if (!usage) continue;
    byModel[model] = {
      inputTokens: asNumber(usage.inputTokens) ?? 0,
      outputTokens: asNumber(usage.outputTokens) ?? 0,
      cacheReadTokens: asNumber(usage.cacheReadInputTokens) ?? 0,
      cacheCreationTokens: asNumber(usage.cacheCreationInputTokens) ?? 0,
      costUsd: asNumber(usage.costUSD),
    };
  }
  return byModel;
}

/** Session usage from a `result` event: token totals over every model, else the event's own `usage`. */
function usageOf(result: JsonRecord): CliRunUsage {
  const byModel = modelUsageOf(result);
  const models = Object.values(byModel);
  const turnUsage = asRecord(result.usage) ?? {};
  const total = (pick: (u: CliModelUsage) => number, fallback: unknown): number =>
    models.length > 0 ? models.reduce((sum, u) => sum + pick(u), 0) : (asNumber(fallback) ?? 0);

  return {
    costUsd: asNumber(result.total_cost_usd),
    numTurns: asNumber(result.num_turns),
    durationApiMs: asNumber(result.duration_api_ms),
    inputTokens: total((u) => u.inputTokens, turnUsage.input_tokens),
    outputTokens: total((u) => u.outputTokens, turnUsage.output_tokens),
    cacheReadTokens: total((u) => u.cacheReadTokens, turnUsage.cache_read_input_tokens),
    cacheCreationTokens: total((u) => u.cacheCreationTokens, turnUsage.cache_creation_input_tokens),
    byModel,
    permissionDenials: asArray(result.permission_denials).length,
    subagentsSpawned: asNumber(asRecord(result.subagent_stats)?.spawned),
    terminalReason: asString(result.terminal_reason),
  };
}

/** Whether a `result` event reports a failed session: flagged `is_error`, or an `error_*` subtype. */
function isErrorResult(result: JsonRecord): boolean {
  return result.is_error === true || (asString(result.subtype)?.startsWith("error") ?? false);
}

/**
 * The session error a failed `result` event reports. A failure Claude Code files under subtype `success`
 * (an API error such as a missing login) takes the API error kind, else the terminal reason.
 */
function cliErrorOf(result: JsonRecord, apiErrorKind: string | undefined): CliError {
  const subtype = asString(result.subtype);
  const errors = asArray(result.errors).filter((e): e is string => typeof e === "string");
  return {
    subtype:
      subtype !== undefined && subtype !== "success"
        ? subtype
        : (apiErrorKind ?? asString(result.terminal_reason) ?? "error"),
    message: asString(result.result) ?? (errors.length > 0 ? errors.join("; ") : undefined),
  };
}

/**
 * Decodes Claude Code `--output-format stream-json --verbose` stdout, one JSON event per line.
 *
 * Main-thread assistant text becomes agent text; subagent output, tool calls, subagent lifecycle and the
 * session result become log lines, subagent lines prefixed with `[<subagent type>]`. Unknown events are
 * skipped, so a newer CLI that adds events still decodes.
 */
export class ClaudeStreamJsonDecoder implements ICliOutputDecoder {
  private readonly agentTexts: string[] = [];
  /** Subagent type of each running task, for task notifications, which do not carry it. */
  private readonly subagentTypes = new Map<string, string>();
  private sessionId: string | undefined;
  private apiErrorKind: string | undefined;
  private lastResult: JsonRecord | undefined;

  decodeLine(rawLine: string): DecodedLine {
    const line = rawLine.trim();
    if (!line) return { logLines: [] };

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return { logLines: [], warnings: [`unparsable output: ${line}`] };
    }
    const event = asRecord(parsed);
    if (!event) return { logLines: [], warnings: [`unexpected output: ${line}`] };

    switch (event.type) {
      case "system":
        return this.decodeSystem(event);
      case "assistant":
        return this.decodeAssistant(event);
      case "user":
        return this.decodeUser(event);
      case "result":
        return this.decodeResult(event);
      default:
        return { logLines: [] };
    }
  }

  /**
   * The agent text is the last `result` event's `result` (the session's final assistant message) when that
   * holds a result block, otherwise all main-thread assistant text joined. Ralph's result gate checks the
   * same two texts in the same order (`last_assistant_message`, then the transcript's main-thread assistant
   * text), so a stop the gate allows is one whose result block the orchestrator also finds.
   */
  finish(): CliRunOutcome {
    const result = this.lastResult;
    const failed = result !== undefined && isErrorResult(result);
    const finalMessage = result && !failed ? asString(result.result) : undefined;
    return {
      agentText: finalMessage !== undefined && hasResultBlock(finalMessage) ? finalMessage : this.agentTexts.join("\n"),
      usage: result ? usageOf(result) : undefined,
      sessionId: this.sessionId,
      cliError: failed ? cliErrorOf(result, this.apiErrorKind) : undefined,
    };
  }

  /** `[<subagent type>] ` for an event inside a subagent, empty on the main thread. */
  private labelOf(event: JsonRecord): string {
    if (event.parent_tool_use_id === null || event.parent_tool_use_id === undefined) return "";
    return `[${asString(event.subagent_type) ?? "subagent"}] `;
  }

  private decodeSystem(event: JsonRecord): DecodedLine {
    switch (event.subtype) {
      case "init": {
        this.sessionId = asString(event.session_id) ?? this.sessionId;
        const servers = asArray(event.mcp_servers).map(asRecord);
        const failed = servers.filter((s) => s && s.status !== "connected" && s.status !== "pending");
        const summary =
          `session ${this.sessionId ?? "?"}: Claude Code ${asString(event.claude_code_version) ?? "?"}, ` +
          `model ${asString(event.model) ?? "?"}, permission mode ${asString(event.permissionMode) ?? "?"}, ` +
          `auth ${asString(event.apiKeySource) ?? "?"}, ${asArray(event.tools).length} tools, ` +
          `${asArray(event.agents).length} agents, ${asArray(event.skills).length} skills, ` +
          `${servers.length} MCP servers`;
        return {
          logLines: [summary],
          warnings: failed.map((s) => `MCP server ${asString(s?.name) ?? "?"}: ${asString(s?.status) ?? "?"}`),
        };
      }
      case "task_started": {
        const type = asString(event.subagent_type) ?? "subagent";
        const taskId = asString(event.task_id);
        if (taskId) this.subagentTypes.set(taskId, type);
        const depth = asNumber(event.spawn_depth);
        const description = asString(event.description) ?? "";
        return { logLines: [`[${type}] started${depth === undefined ? "" : ` (depth ${depth})`}: ${description}`] };
      }
      case "task_notification": {
        const taskId = asString(event.task_id);
        const type = (taskId && this.subagentTypes.get(taskId)) ?? "subagent";
        const summary = preview(asString(event.summary) ?? "", MESSAGE_PREVIEW_CHARS);
        return { logLines: [`[${type}] ${asString(event.status) ?? "finished"}: ${summary}`] };
      }
      case "hook_response": {
        if (event.outcome === "success") return { logLines: [] };
        const exit = asNumber(event.exit_code);
        return {
          logLines: [],
          warnings: [
            `hook ${asString(event.hook_name) ?? "?"} ${asString(event.outcome) ?? "failed"}` +
              (exit === undefined ? "" : ` (exit ${exit})`),
          ],
        };
      }
      case "compact_boundary": {
        const metadata = asRecord(event.compact_metadata);
        const trigger = asString(metadata?.trigger);
        const preTokens = asNumber(metadata?.pre_tokens);
        const details = [trigger, preTokens === undefined ? undefined : `${preTokens} tokens before`].filter(Boolean);
        return { logLines: [`context compacted${details.length > 0 ? ` (${details.join(", ")})` : ""}`] };
      }
      default:
        return { logLines: [] };
    }
  }

  private decodeAssistant(event: JsonRecord): DecodedLine {
    const message = asRecord(event.message);
    const blocks = asArray(message?.content).map(asRecord);
    const label = this.labelOf(event);

    if (event.is_api_error_message === true) {
      this.apiErrorKind = asString(event.error) ?? this.apiErrorKind;
      const text = blocks.map((b) => asString(b?.text) ?? "").join(" ");
      return { logLines: [], warnings: [`${label}API error (${this.apiErrorKind ?? "unknown"}): ${text}`] };
    }

    const logLines: string[] = [];
    const texts: string[] = [];
    for (const block of blocks) {
      if (!block) continue;
      if (block.type === "text") {
        const text = asString(block.text) ?? "";
        if (label === "") texts.push(text);
        logLines.push(...text.split("\n").map((l) => `${label}${l}`));
      } else if (block.type === "tool_use") {
        const name = asString(block.name) ?? "?";
        const subject = preview(toolSubject(name, asRecord(block.input)), TOOL_INPUT_PREVIEW_CHARS);
        logLines.push(`${label}tool ${name}${subject ? ` ${subject}` : ""}`);
      }
    }

    if (texts.length === 0) return { logLines };
    const agentText = texts.join("\n");
    this.agentTexts.push(agentText);
    return { logLines, agentText };
  }

  private decodeUser(event: JsonRecord): DecodedLine {
    const message = asRecord(event.message);
    const label = this.labelOf(event);
    const warnings: string[] = [];
    for (const block of asArray(message?.content).map(asRecord)) {
      if (block?.type === "tool_result" && block.is_error === true) {
        warnings.push(`${label}tool error: ${preview(toolResultText(block.content), MESSAGE_PREVIEW_CHARS)}`);
      }
    }
    return { logLines: [], warnings };
  }

  private decodeResult(event: JsonRecord): DecodedLine {
    this.lastResult = event;
    this.sessionId = asString(event.session_id) ?? this.sessionId;

    const usage = usageOf(event);
    const parts = [
      `result: ${asString(event.subtype) ?? "?"}`,
      `${usage.numTurns ?? "?"} turns`,
      usage.costUsd === undefined ? undefined : `$${usage.costUsd.toFixed(4)}`,
      usage.terminalReason === undefined ? undefined : `ended by ${usage.terminalReason}`,
      usage.permissionDenials > 0 ? `${usage.permissionDenials} permission denials` : undefined,
    ].filter(Boolean);
    const summary = parts.join(", ");

    if (!isErrorResult(event)) return { logLines: [summary] };
    const { subtype, message } = cliErrorOf(event, this.apiErrorKind);
    return {
      logLines: [],
      warnings: [`${summary} (error ${subtype}${message ? `: ${preview(message, MESSAGE_PREVIEW_CHARS)}` : ""})`],
    };
  }
}
