import type { TranscriptLine } from "../../logs/transcript";
import { isClaudeSubagentTool } from "./claude-tools";
import { type ClaudeSession, type ClaudeSubagent, type SessionEvent, SessionEventKind } from "./session-log";

/** Longest tool input or tool result quoted in the transcript. */
const TOOL_IO_CHARS = 2000;

/** Longest prompt quoted in the transcript; the task prompt carries the whole issue. */
const PROMPT_CHARS = 20_000;

/** `HH:MM:SS` UTC of an epoch-ms timestamp. */
function timeOf(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19);
}

/** `YYYY-MM-DD HH:MM:SS UTC` of an epoch-ms timestamp. */
function dateTimeOf(ts: number): string {
  return `${new Date(ts).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** A heading for one event, with the event's time when the log carries one. */
function eventHeading(title: string, ts: number | undefined): string {
  return `#### ${title}${ts === undefined ? "" : ` · ${timeOf(ts)}`}`;
}

function toolInputText(input: unknown): string {
  if (input === undefined) return "";
  return typeof input === "string" ? input : JSON.stringify(input, null, 2);
}

/** How the transcript names a subagent: its type and agent id. */
function subagentLabel(subagent: ClaudeSubagent): string {
  return `subagent \`${subagent.agentType}\` (\`${subagent.agentId}\`)`;
}

/** The transcript lines of one thread's events; `spawned` maps a tool call id to the subagent it started. */
function renderEvents(events: readonly SessionEvent[], spawned: ReadonlyMap<string, ClaudeSubagent>): TranscriptLine[] {
  const toolNames = new Map<string, string>();
  const out: TranscriptLine[] = [];
  for (const event of events) {
    switch (event.kind) {
      case SessionEventKind.Prompt:
        out.push(eventHeading("User", event.ts), "", { quote: event.text, maxChars: PROMPT_CHARS, info: "text" }, "");
        break;
      case SessionEventKind.Text:
        out.push(eventHeading("Assistant", event.ts), "", event.text, "");
        break;
      case SessionEventKind.ToolCall: {
        toolNames.set(event.toolUseId, event.tool);
        out.push(eventHeading(`Tool call \`${event.tool}\``, event.ts), "");
        const subagent = spawned.get(event.toolUseId);
        if (subagent) out.push(`Starts ${subagentLabel(subagent)}, transcribed below.`, "");
        else if (isClaudeSubagentTool(event.tool)) out.push("Starts a subagent whose log was not collected.", "");
        const input = toolInputText(event.input);
        if (input !== "") out.push({ quote: input, maxChars: TOOL_IO_CHARS, info: "json" }, "");
        break;
      }
      case SessionEventKind.ToolResult: {
        const tool = toolNames.get(event.toolUseId) ?? "unknown";
        const title = `${event.isError ? "Tool error" : "Tool result"} \`${tool}\``;
        out.push(eventHeading(title, event.ts), "", { quote: event.text, maxChars: TOOL_IO_CHARS, info: "text" }, "");
        break;
      }
      case SessionEventKind.ApiError:
        out.push(eventHeading(`API error (${event.error})`, event.ts), "", event.text, "");
        break;
      case SessionEventKind.Compaction:
        out.push(eventHeading(`Context compacted${event.trigger ? ` (${event.trigger})` : ""}`, event.ts), "");
        break;
      case SessionEventKind.ModelResponse:
        break;
    }
  }
  return out;
}

function renderSession(session: ClaudeSession): TranscriptLine[] {
  const spawned = new Map(
    session.subagents.flatMap((s) => (s.toolUseId === undefined ? [] : [[s.toolUseId, s] as const])),
  );
  const byAgentId = new Map(session.subagents.map((s) => [s.agentId, s] as const));
  const start = session.events.find((e) => e.ts !== undefined)?.ts;
  const facts = [
    `- Agent: \`${session.agent ?? "unknown"}\``,
    ...(start === undefined ? [] : [`- Started: ${dateTimeOf(start)}`]),
    `- Subagents: ${session.subagents.length}`,
    ...(session.malformedLines > 0 ? [`- Unreadable log lines skipped: ${session.malformedLines}`] : []),
  ];
  const out: TranscriptLine[] = [
    `## Session \`${session.sessionId}\``,
    "",
    ...facts,
    "",
    `### Main thread`,
    "",
    ...renderEvents(session.events, spawned),
  ];

  for (const subagent of session.subagents) {
    const parent = subagent.parentAgentId === undefined ? undefined : byAgentId.get(subagent.parentAgentId);
    const subFacts = [
      `- Started by: ${parent ? subagentLabel(parent) : "the main thread"}`,
      ...(subagent.spawnDepth === undefined ? [] : [`- Depth: ${subagent.spawnDepth}`]),
      ...(subagent.description ? [`- Task: ${subagent.description}`] : []),
      ...(subagent.malformedLines > 0 ? [`- Unreadable log lines skipped: ${subagent.malformedLines}`] : []),
    ];
    out.push(
      `### Subagent \`${subagent.agentType}\` (\`${subagent.agentId}\`)`,
      "",
      ...subFacts,
      "",
      ...renderEvents(subagent.events, spawned),
    );
  }
  return out;
}

/**
 * Renders Claude Code sessions as the lines of one Markdown transcript: per session its main thread, then
 * each subagent in start order, with prompts, assistant text, tool calls and their results, API errors and
 * compactions. Prompts, tool input and tool output are quoted, to be cut once redacted. The text is the
 * agent's and the tools' own, so the lines become Markdown only through `redactTranscript`.
 */
export function renderClaudeTranscript(sessions: readonly ClaudeSession[]): TranscriptLine[] {
  const out: TranscriptLine[] = ["# Claude Code transcript", ""];
  for (const session of sessions) out.push(...renderSession(session));
  return out;
}
