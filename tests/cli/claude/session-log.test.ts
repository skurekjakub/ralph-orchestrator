/**
 * Fixture `fixtures/claude-sessions/` is a hand-written collected sessions folder in the entry shapes of
 * Claude Code 2.1.292 session logs: a session whose main thread starts a writer subagent that starts a
 * reviewer, a subagent without metadata, a malformed line, a compaction and the result gate's feedback,
 * and a later session that failed to authenticate.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSessionLog, readClaudeSessions, SessionEventKind } from "../../../src/cli/claude/session-log";

const SESSIONS = join(import.meta.dirname, "fixtures", "claude-sessions");
const MAIN = "11111111-2222-4333-8444-555555555555";
const LATER = "00000000-0000-4000-8000-000000000000";

/** One session log line. */
const line = (entry: object): string => JSON.stringify(entry);

describe("readClaudeSessions", () => {
  it("reads every session in start order, each with its agent and subagents", async () => {
    // Act
    const sessions = await readClaudeSessions(SESSIONS);

    // Assert
    expect(sessions.map((s) => [s.sessionId, s.agent])).toEqual([
      [MAIN, "ralph"],
      [LATER, "ralph-reviewer"],
    ]);
    expect(sessions[0].subagents.map((s) => [s.agentId, s.agentType])).toEqual([
      ["a1", "writer"],
      ["a2", "reviewer"],
      ["a3", "unknown"],
    ]);
  });

  it("keeps the main thread's conversation and hook feedback, and skips attachments, other meta entries and compaction summaries", async () => {
    // Act
    const [main] = await readClaudeSessions(SESSIONS);

    // Assert
    expect(main.events.map((e) => e.kind)).toEqual([
      SessionEventKind.Prompt,
      SessionEventKind.ModelResponse,
      SessionEventKind.Text,
      SessionEventKind.ToolCall,
      SessionEventKind.ToolResult,
      SessionEventKind.ModelResponse,
      SessionEventKind.ToolCall,
      SessionEventKind.ToolResult,
      SessionEventKind.Compaction,
      SessionEventKind.HookFeedback,
      SessionEventKind.ModelResponse,
      SessionEventKind.Text,
    ]);
    expect(main.events[0]).toEqual({
      kind: SessionEventKind.Prompt,
      ts: Date.parse("2026-10-07T06:00:01.000Z"),
      text: "Document the widget for DF-1.",
    });
    expect(main.events[8]).toMatchObject({ kind: SessionEventKind.Compaction, trigger: "auto" });
    expect(main.events[9]).toEqual({
      kind: SessionEventKind.HookFeedback,
      ts: Date.parse("2026-10-07T06:01:08.002Z"),
      hook: "Stop",
      text: "You stopped before printing the Ralph result block.",
    });
  });

  it("counts the lines that are not JSON objects", async () => {
    // Act
    const [main] = await readClaudeSessions(SESSIONS);

    // Assert
    expect(main.malformedLines).toBe(1);
  });

  it("reads a subagent's metadata: task, spawning tool call, parent and depth", async () => {
    // Act
    const [{ subagents }] = await readClaudeSessions(SESSIONS);

    // Assert
    expect(subagents[0]).toMatchObject({
      agentId: "a1",
      description: "Draft the page",
      toolUseId: "toolu_agent",
      spawnDepth: 1,
    });
    expect(subagents[1]).toMatchObject({ agentId: "a2", toolUseId: "toolu_review", parentAgentId: "a1" });
    expect(subagents[2]).not.toHaveProperty("toolUseId");
  });

  it("reads an API error with its kind and leaves the synthetic response out of the model responses", async () => {
    // Act
    const [, later] = await readClaudeSessions(SESSIONS);

    // Assert
    expect(later.events).toEqual([
      { kind: SessionEventKind.Prompt, ts: Date.parse("2026-10-07T06:05:00.000Z"), text: "Review the change." },
      {
        kind: SessionEventKind.ApiError,
        ts: Date.parse("2026-10-07T06:05:01.000Z"),
        error: "authentication_failed",
        text: "Not logged in · Please run /login",
      },
    ]);
  });

  describe("unhappy paths", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "claude-sessions-"));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it("throws when the sessions folder does not exist", async () => {
      // Act & Assert
      await expect(readClaudeSessions(join(dir, "missing"))).rejects.toThrow(/ENOENT/);
    });

    it("returns no sessions for an empty folder", async () => {
      // Act & Assert
      await expect(readClaudeSessions(dir)).resolves.toEqual([]);
    });

    it("reads a subagent whose metadata is malformed as one of unknown type", async () => {
      // Arrange
      const subagents = join(dir, "-workspace", "s-1", "subagents");
      mkdirSync(subagents, { recursive: true });
      writeFileSync(join(dir, "-workspace", "s-1.jsonl"), "");
      writeFileSync(join(subagents, "agent-x.jsonl"), "");
      writeFileSync(join(subagents, "agent-x.meta.json"), "{ not json");

      // Act
      const [session] = await readClaudeSessions(dir);

      // Assert
      expect(session.subagents).toEqual([{ agentId: "x", agentType: "unknown", events: [], malformedLines: 0 }]);
    });

    it("throws when a subagent's metadata exists but cannot be read", async () => {
      // Arrange
      const subagents = join(dir, "-workspace", "s-1", "subagents");
      mkdirSync(join(subagents, "agent-x.meta.json"), { recursive: true });
      writeFileSync(join(dir, "-workspace", "s-1.jsonl"), "");
      writeFileSync(join(subagents, "agent-x.jsonl"), "");

      // Act & Assert
      await expect(readClaudeSessions(dir)).rejects.toThrow(/EISDIR/);
    });

    it("does not take other logs inside a session's folder for sessions", async () => {
      // Arrange
      mkdirSync(join(dir, "-workspace", "s-1", "notes"), { recursive: true });
      writeFileSync(join(dir, "-workspace", "s-1.jsonl"), "");
      writeFileSync(join(dir, "-workspace", "s-1", "notes", "other.jsonl"), "");

      // Act
      const sessions = await readClaudeSessions(dir);

      // Assert
      expect(sessions.map((s) => s.sessionId)).toEqual(["s-1"]);
    });
  });
});

describe("parseSessionLog", () => {
  it.each(["[1,2]", "42", "null", "{ broken"])("counts %s as a malformed line and keeps reading", (raw) => {
    // Arrange
    const jsonl = [raw, line({ type: "user", message: { content: "Go." } })].join("\n");

    // Act
    const thread = parseSessionLog(jsonl);

    // Assert
    expect(thread.malformedLines).toBe(1);
    expect(thread.events).toEqual([{ kind: SessionEventKind.Prompt, text: "Go." }]);
  });

  it("tolerates fields of unexpected types", () => {
    // Arrange
    const jsonl = [
      line({ type: "assistant", timestamp: 7, message: { id: 3, content: "not a list" } }),
      line({ type: "user", message: { content: [{ type: "tool_result", content: { text: 1 } }] } }),
      line({ type: "assistant", message: { content: [{ type: "tool_use", input: "raw" }] } }),
    ].join("\n");

    // Act
    const thread = parseSessionLog(jsonl);

    // Assert
    expect(thread.malformedLines).toBe(0);
    expect(thread.events).toEqual([
      { kind: SessionEventKind.ToolResult, toolUseId: "", text: "", isError: false },
      { kind: SessionEventKind.ToolCall, toolUseId: "", tool: "unknown", input: "raw" },
    ]);
  });

  it("emits one model response per message id, however many content lines the message spans", () => {
    // Arrange
    const message = (content: object[]) => ({ id: "msg_1", model: "claude-opus-5-5", content });
    const jsonl = [
      line({ type: "assistant", message: message([{ type: "text", text: "a" }]) }),
      line({ type: "assistant", message: message([{ type: "text", text: "b" }]) }),
    ].join("\n");

    // Act
    const { events } = parseSessionLog(jsonl);

    // Assert
    expect(events.filter((e) => e.kind === SessionEventKind.ModelResponse)).toEqual([
      { kind: SessionEventKind.ModelResponse, messageId: "msg_1", model: "claude-opus-5-5" },
    ]);
  });

  it("reads hook feedback from a meta entry and skips every other meta entry", () => {
    // Arrange
    const jsonl = [
      line({
        type: "user",
        isMeta: true,
        message: { content: "SubagentStop hook feedback:\nKeep going.\nThen stop." },
      }),
      line({ type: "user", isMeta: true, message: { content: "<system-reminder>injected</system-reminder>" } }),
      line({ type: "user", isMeta: true, message: { content: [{ type: "text", text: "Stop hook feedback:\nno" }] } }),
    ].join("\n");

    // Act
    const { events } = parseSessionLog(jsonl);

    // Assert
    expect(events).toEqual([
      { kind: SessionEventKind.HookFeedback, hook: "SubagentStop", text: "Keep going.\nThen stop." },
    ]);
  });

  it("skips blank assistant text and blank prompts", () => {
    // Arrange
    const jsonl = [
      line({ type: "user", message: { content: "  " } }),
      line({ type: "assistant", message: { content: [{ type: "text", text: "\n" }] } }),
    ].join("\n");

    // Act & Assert
    expect(parseSessionLog(jsonl).events).toEqual([]);
  });
});
