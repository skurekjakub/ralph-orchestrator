import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { renderClaudeTranscript } from "../../../src/cli/claude/transcript-renderer";
import { redactTranscript } from "../../../src/logs/transcript";
import {
  type ClaudeSession,
  readClaudeSessions,
  type SessionEvent,
  SessionEventKind,
} from "../../../src/cli/claude/session-log";
import { createMockTextRedactor } from "../../helpers/mocks";

const SESSIONS = join(import.meta.dirname, "fixtures", "claude-sessions");
const T0 = Date.parse("2026-10-07T06:00:00.000Z");

/** The Markdown of the rendered transcript, through a redactor that scrubs only the word SECRET. */
function markdownOf(sessions: readonly ClaudeSession[]): Promise<string> {
  return redactTranscript(renderClaudeTranscript(sessions), createMockTextRedactor());
}

/** A session holding `events` on its main thread and no subagents. */
function session(events: SessionEvent[], overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return { sessionId: "s-1", agent: "ralph", events, malformedLines: 0, subagents: [], ...overrides };
}

describe("renderClaudeTranscript", () => {
  it("renders a session's prompt, text, tool call and result under timed headings", async () => {
    // Arrange
    const events: SessionEvent[] = [
      { kind: SessionEventKind.Prompt, ts: T0, text: "Do it." },
      { kind: SessionEventKind.ModelResponse, ts: T0 + 1000, messageId: "m1", model: "claude-opus-5-5" },
      { kind: SessionEventKind.Text, ts: T0 + 1000, text: "On it." },
      { kind: SessionEventKind.ToolCall, ts: T0 + 2000, toolUseId: "t1", tool: "Bash", input: { command: "ls" } },
      { kind: SessionEventKind.ToolResult, ts: T0 + 3000, toolUseId: "t1", text: "README.md", isError: false },
    ];

    // Act
    const markdown = await markdownOf([session(events)]);

    // Assert
    expect(markdown).toBe(
      [
        "# Claude Code transcript",
        "",
        "## Session `s-1`",
        "",
        "- Agent: `ralph`",
        "- Started: 2026-10-07 06:00:00 UTC",
        "- Subagents: 0",
        "",
        "### Main thread",
        "",
        "#### User · 06:00:00",
        "",
        "```text\nDo it.\n```",
        "",
        "#### Assistant · 06:00:01",
        "",
        "On it.",
        "",
        "#### Tool call `Bash` · 06:00:02",
        "",
        '```json\n{\n  "command": "ls"\n}\n```',
        "",
        "#### Tool result `Bash` · 06:00:03",
        "",
        "```text\nREADME.md\n```",
        "",
      ].join("\n"),
    );
  });

  it("transcribes each subagent after the main thread and links it to the call that started it", async () => {
    // Arrange
    const sessions = await readClaudeSessions(SESSIONS);

    // Act
    const markdown = await markdownOf(sessions);

    // Assert
    expect(markdown).toContain(
      "#### Tool call `Agent` · 06:00:05\n\nStarts subagent `writer` (`a1`), transcribed below.",
    );
    expect(markdown).toContain(
      "### Subagent `writer` (`a1`)\n\n- Started by: the main thread\n- Depth: 1\n- Task: Draft the page",
    );
    expect(markdown).toContain("### Subagent `reviewer` (`a2`)\n\n- Started by: subagent `writer` (`a1`)\n- Depth: 2");
    expect(markdown).toContain("### Subagent `unknown` (`a3`)\n\n- Started by: the main thread\n\n");
    expect(markdown.indexOf("## Session `11111111-2222-4333-8444-555555555555`")).toBeLessThan(
      markdown.indexOf("## Session `00000000-0000-4000-8000-000000000000`"),
    );
  });

  it("marks failed tool calls, API errors, compactions and skipped log lines", async () => {
    // Arrange
    const sessions = await readClaudeSessions(SESSIONS);

    // Act
    const markdown = await markdownOf(sessions);

    // Assert
    expect(markdown).toContain("#### Tool error `Write` · 06:00:07\n\n```text\nPermission denied\n```");
    expect(markdown).toContain(
      "#### API error (authentication_failed) · 06:05:01\n\nNot logged in · Please run /login",
    );
    expect(markdown).toContain("#### Context compacted (auto) · 06:01:06");
    expect(markdown).toContain("- Unreadable log lines skipped: 1");
  });

  it("notes a subagent call whose subagent log was not collected", async () => {
    // Arrange
    const events: SessionEvent[] = [
      { kind: SessionEventKind.ToolCall, toolUseId: "t1", tool: "Agent", input: { subagent_type: "writer" } },
    ];

    // Act
    const markdown = await markdownOf([session(events)]);

    // Assert
    expect(markdown).toContain("#### Tool call `Agent`\n\nStarts a subagent whose log was not collected.");
  });

  it("cuts long tool output and fences text that holds backtick runs", async () => {
    // Arrange
    const events: SessionEvent[] = [
      { kind: SessionEventKind.ToolResult, toolUseId: "t1", text: "x".repeat(2500), isError: false },
      { kind: SessionEventKind.ToolResult, toolUseId: "t2", text: "a ```` fence", isError: false },
    ];

    // Act
    const markdown = await markdownOf([session(events)]);

    // Assert
    expect(markdown).toContain(`\`\`\`text\n${"x".repeat(2000)}…\n\`\`\``);
    expect(markdown).toContain("`````text\na ```` fence\n`````");
  });

  it("renders only the title when there are no sessions", async () => {
    // Act & Assert
    expect(await markdownOf([])).toBe("# Claude Code transcript\n");
  });
});
