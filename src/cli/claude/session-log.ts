import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { asArray, asNumber, asRecord, asString, type JsonRecord } from "../../util/json";
import { toolResultText } from "./message-content";

/** What one entry of a Claude Code session log contributes to the conversation. */
export enum SessionEventKind {
  /** A prompt the session received as the user: the task or a continuation. */
  Prompt = "prompt",
  /** The first line of a model response; one response spans several lines, one per content block. */
  ModelResponse = "model-response",
  /** Assistant text. */
  Text = "text",
  ToolCall = "tool-call",
  ToolResult = "tool-result",
  /** A failed model request, such as a missing login. */
  ApiError = "api-error",
  /** The CLI compacted the context. */
  Compaction = "compaction",
  /** The reason a hook gave the model for blocking it, such as the result gate's when a stop lacks the result block. */
  HookFeedback = "hook-feedback",
}

/** Epoch milliseconds of the entry, when it carries a valid timestamp. */
interface TimedEvent {
  readonly ts?: number;
}

export interface PromptEvent extends TimedEvent {
  readonly kind: SessionEventKind.Prompt;
  readonly text: string;
}

export interface ModelResponseEvent extends TimedEvent {
  readonly kind: SessionEventKind.ModelResponse;
  readonly messageId: string;
  readonly model?: string;
}

export interface TextEvent extends TimedEvent {
  readonly kind: SessionEventKind.Text;
  readonly text: string;
}

export interface ToolCallEvent extends TimedEvent {
  readonly kind: SessionEventKind.ToolCall;
  readonly toolUseId: string;
  readonly tool: string;
  /** The tool input as the model sent it. */
  readonly input: unknown;
}

export interface ToolResultEvent extends TimedEvent {
  readonly kind: SessionEventKind.ToolResult;
  readonly toolUseId: string;
  readonly text: string;
  readonly isError: boolean;
}

export interface ApiErrorEvent extends TimedEvent {
  readonly kind: SessionEventKind.ApiError;
  /** The error kind the CLI reports, e.g. `authentication_failed`. */
  readonly error: string;
  readonly text: string;
}

export interface CompactionEvent extends TimedEvent {
  readonly kind: SessionEventKind.Compaction;
  readonly trigger?: string;
}

export interface HookFeedbackEvent extends TimedEvent {
  readonly kind: SessionEventKind.HookFeedback;
  /** The hook event whose hook gave the feedback, e.g. `Stop`. */
  readonly hook: string;
  readonly text: string;
}

/** One conversation event of a session log, in log order. */
export type SessionEvent =
  | PromptEvent
  | ModelResponseEvent
  | TextEvent
  | ToolCallEvent
  | ToolResultEvent
  | ApiErrorEvent
  | CompactionEvent
  | HookFeedbackEvent;

/** The events of one log file. */
export interface SessionThread {
  readonly events: readonly SessionEvent[];
  /** Lines that were not JSON objects, skipped. */
  readonly malformedLines: number;
}

/** One subagent run, from `<session id>/subagents/agent-<agent id>.jsonl` and its `.meta.json`. */
export interface ClaudeSubagent extends SessionThread {
  readonly agentId: string;
  /** The subagent's agent type; `unknown` when its metadata is missing. */
  readonly agentType: string;
  /** The task description the spawning tool call gave. */
  readonly description?: string;
  /** The tool call that spawned the subagent. */
  readonly toolUseId?: string;
  /** The subagent that spawned this one; absent when the main thread did. */
  readonly parentAgentId?: string;
  readonly spawnDepth?: number;
}

/** One Claude Code session: its main thread and the subagents it ran. */
export interface ClaudeSession extends SessionThread {
  readonly sessionId: string;
  /** The agent the session ran as, from the log's agent setting. */
  readonly agent?: string;
  /** Subagents in start order. */
  readonly subagents: readonly ClaudeSubagent[];
}

/** Model name Claude Code gives the responses it makes up itself, such as an API error. */
const SYNTHETIC_MODEL = "<synthetic>";

/**
 * How Claude Code 2.1.292 opens the meta user entry that hands a blocking hook's reason to the model
 * (`Stop hook feedback:` and the reason on the next line); its `hook_blocking_error` attachment repeats it.
 */
const HOOK_FEEDBACK_PREFIX = /^([A-Za-z]+) hook feedback:\n/;

function timestampOf(entry: JsonRecord): number | undefined {
  const parsed = Date.parse(asString(entry.timestamp) ?? "");
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Orders threads by their first timestamp; threads without one sort last, in their existing order. */
function byFirstTs(a: SessionThread, b: SessionThread): number {
  const first = (thread: SessionThread): number =>
    thread.events.find((e) => e.ts !== undefined)?.ts ?? Number.POSITIVE_INFINITY;
  return first(a) - first(b) || 0;
}

function assistantEvents(entry: JsonRecord, ts: number | undefined, seenMessages: Set<string>): SessionEvent[] {
  const message = asRecord(entry.message);
  const blocks = asArray(message?.content).map(asRecord);
  if (entry.isApiErrorMessage === true) {
    const text = blocks.map((b) => asString(b?.text) ?? "").join("\n");
    return [{ kind: SessionEventKind.ApiError, ts, error: asString(entry.error) ?? "unknown", text }];
  }

  const events: SessionEvent[] = [];
  const messageId = asString(message?.id);
  if (messageId !== undefined && !seenMessages.has(messageId)) {
    seenMessages.add(messageId);
    const model = asString(message?.model);
    events.push({
      kind: SessionEventKind.ModelResponse,
      ts,
      messageId,
      ...(model === undefined || model === SYNTHETIC_MODEL ? {} : { model }),
    });
  }
  for (const block of blocks) {
    if (block?.type === "text") {
      const text = asString(block.text) ?? "";
      if (text.trim() !== "") events.push({ kind: SessionEventKind.Text, ts, text });
    } else if (block?.type === "tool_use") {
      events.push({
        kind: SessionEventKind.ToolCall,
        ts,
        toolUseId: asString(block.id) ?? "",
        tool: asString(block.name) ?? "unknown",
        input: block.input,
      });
    }
  }
  return events;
}

/** The hook feedback a meta user entry carries; other meta entries, such as injected skill text, carry none. */
function hookFeedbackEvents(content: unknown, ts: number | undefined): SessionEvent[] {
  if (typeof content !== "string") return [];
  const match = HOOK_FEEDBACK_PREFIX.exec(content);
  if (match === null) return [];
  return [{ kind: SessionEventKind.HookFeedback, ts, hook: match[1], text: content.slice(match[0].length) }];
}

function userEvents(entry: JsonRecord, ts: number | undefined): SessionEvent[] {
  const content = asRecord(entry.message)?.content;
  if (entry.isMeta === true) return hookFeedbackEvents(content, ts);
  if (entry.isCompactSummary === true) return [];
  if (typeof content === "string") {
    return content.trim() === "" ? [] : [{ kind: SessionEventKind.Prompt, ts, text: content }];
  }

  const events: SessionEvent[] = [];
  for (const block of asArray(content).map(asRecord)) {
    if (block?.type === "tool_result") {
      events.push({
        kind: SessionEventKind.ToolResult,
        ts,
        toolUseId: asString(block.tool_use_id) ?? "",
        text: toolResultText(block.content),
        isError: block.is_error === true,
      });
    } else if (block?.type === "text") {
      const text = asString(block.text) ?? "";
      if (text.trim() !== "") events.push({ kind: SessionEventKind.Prompt, ts, text });
    }
  }
  return events;
}

/**
 * Parses one session log file. Entries without conversation content (attachments, queue and title entries,
 * meta entries other than hook feedback, system notes other than compactions) are skipped, and so are lines
 * that are not JSON objects, which are counted.
 *
 * @returns The thread, plus the agent the log's agent setting names.
 */
export function parseSessionLog(jsonl: string): SessionThread & { readonly agent?: string } {
  const events: SessionEvent[] = [];
  const seenMessages = new Set<string>();
  let malformedLines = 0;
  let agent: string | undefined;

  for (const line of jsonl.split("\n")) {
    if (line.trim() === "") continue;
    let entry: JsonRecord | undefined;
    try {
      entry = asRecord(JSON.parse(line));
    } catch {
      entry = undefined;
    }
    if (!entry) {
      malformedLines++;
      continue;
    }

    const ts = timestampOf(entry);
    switch (entry.type) {
      case "agent-setting":
        agent = asString(entry.agentSetting) ?? agent;
        break;
      case "assistant":
        events.push(...assistantEvents(entry, ts, seenMessages));
        break;
      case "user":
        events.push(...userEvents(entry, ts));
        break;
      case "system":
        if (entry.subtype === "compact_boundary") {
          const trigger = asString(asRecord(entry.compactMetadata)?.trigger);
          events.push({ kind: SessionEventKind.Compaction, ts, ...(trigger === undefined ? {} : { trigger }) });
        }
        break;
    }
  }
  return { events, malformedLines, ...(agent === undefined ? {} : { agent }) };
}

/** A subagent's `.meta.json`; missing or malformed metadata yields none. */
async function readSubagentMeta(path: string): Promise<JsonRecord> {
  try {
    return asRecord(JSON.parse(await readFile(path, "utf-8"))) ?? {};
  } catch {
    return {};
  }
}

async function readSubagent(logPath: string): Promise<ClaudeSubagent> {
  const agentId = basename(logPath, ".jsonl").replace(/^agent-/, "");
  const { events, malformedLines } = parseSessionLog(await readFile(logPath, "utf-8"));
  const meta = await readSubagentMeta(logPath.replace(/\.jsonl$/, ".meta.json"));
  const description = asString(meta.description);
  const toolUseId = asString(meta.toolUseId);
  const parentAgentId = asString(meta.parentAgentId);
  const spawnDepth = asNumber(meta.spawnDepth);
  return {
    agentId,
    agentType: asString(meta.agentType) ?? "unknown",
    events,
    malformedLines,
    ...(description === undefined ? {} : { description }),
    ...(toolUseId === undefined ? {} : { toolUseId }),
    ...(parentAgentId === undefined ? {} : { parentAgentId }),
    ...(spawnDepth === undefined ? {} : { spawnDepth }),
  };
}

/**
 * Reads every session of a collected Claude Code sessions folder (`$CLAUDE_CONFIG_DIR/projects`): each
 * `<project>/<session id>.jsonl` main thread and its `<project>/<session id>/subagents/agent-<id>.jsonl`
 * subagents, with their `.meta.json`. Sessions and subagents come in start order.
 *
 * @throws Error when the folder or one of its logs cannot be read.
 */
export async function readClaudeSessions(exportDir: string): Promise<ClaudeSession[]> {
  const logs = (await readdir(exportDir, { recursive: true })).filter((path) => path.endsWith(".jsonl")).sort();
  /** `<project>/<session id>/` of a main thread log, the folder its subagents and other files live in. */
  const sessionDirOf = (path: string): string => join(dirname(path), basename(path, ".jsonl")) + sep;
  const candidates = logs.filter((path) => basename(dirname(path)) !== "subagents");
  const mainLogs = candidates.filter((path) => !candidates.some((other) => path.startsWith(sessionDirOf(other))));

  const sessions: ClaudeSession[] = [];
  for (const path of mainLogs) {
    const subagentDir = join(sessionDirOf(path), "subagents") + sep;
    const subagents = await Promise.all(
      logs.filter((p) => dirname(p) + sep === subagentDir).map((p) => readSubagent(join(exportDir, p))),
    );
    const thread = parseSessionLog(await readFile(join(exportDir, path), "utf-8"));
    sessions.push({ sessionId: basename(path, ".jsonl"), ...thread, subagents: subagents.sort(byFirstTs) });
  }
  return sessions.sort(byFirstTs);
}
