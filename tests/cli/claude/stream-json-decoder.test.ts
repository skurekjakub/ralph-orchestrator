/**
 * Fixtures:
 * - `not-logged-in.jsonl` is Claude Code 2.1.292 output captured in the ralph-vscode agent image, run as `vscode`
 *   with no credential and no network.
 * - `subagent-session.jsonl` is hand-written in the event shapes of captured 2.1.292 runs: a subagent, a denied
 *   tool call, a failed hook and the result block in the final message.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ClaudeStreamJsonDecoder } from "../../../src/cli/claude/stream-json-decoder";
import type { DecodedLine } from "../../../src/cli/output-decoder";

const FIXTURES = join(import.meta.dirname, "fixtures");

/** Decodes every line of a fixture, returning the decoder and each line's decoding. */
function decodeFixture(name: string): { decoder: ClaudeStreamJsonDecoder; decoded: DecodedLine[] } {
  const decoder = new ClaudeStreamJsonDecoder();
  const lines = readFileSync(join(FIXTURES, name), "utf-8").split("\n");
  return { decoder, decoded: lines.map((l) => decoder.decodeLine(l)) };
}

const allLogLines = (decoded: DecodedLine[]): string[] => decoded.flatMap((d) => d.logLines);
const allWarnings = (decoded: DecodedLine[]): string[] => decoded.flatMap((d) => d.warnings ?? []);

/** One stream-json line. */
const line = (event: object): string => JSON.stringify(event);

const BLOCK = "===RALPH_RESULT_START===\nSTATUS: completed\n===RALPH_RESULT_END===";

describe("ClaudeStreamJsonDecoder", () => {
  describe("a session with a subagent", () => {
    it("logs the session start, main-thread text, tool calls and the subagent's lifecycle", () => {
      // Act
      const { decoded } = decodeFixture("subagent-session.jsonl");

      // Assert
      expect(allLogLines(decoded)).toEqual([
        "session 11111111-2222-4333-8444-555555555555: Claude Code 2.1.292, model claude-opus-5-5, permission mode " +
          "bypassPermissions, auth ANTHROPIC_API_KEY, 4 tools, 2 agents, 1 skills, 2 MCP servers",
        "I'll delegate the draft.",
        "The marker ===RALPH_RESULT_END=== comes last.",
        "tool Agent writer: Draft the page",
        "[writer] started (depth 1): Draft the page",
        "[writer] tool Write /workspace/docs/page.md",
        "[writer] Drafted docs/page.md",
        "[writer] completed: Drafted docs/page.md",
        "tool Bash curl https://example.com",
        "===RALPH_RESULT_START===",
        "PR_URL: https://dev.azure.com/org/p/_git/r/pullrequest/7",
        "STATUS: completed",
        "===RALPH_RESULT_END===",
        "result: success, 5 turns, $0.0382, ended by completed, 1 permission denials",
      ]);
    });

    it("warns about a failed MCP server, a failed tool call and a failed hook", () => {
      // Act
      const { decoded } = decodeFixture("subagent-session.jsonl");

      // Assert
      expect(allWarnings(decoded)).toEqual([
        "MCP server ado: failed",
        "tool error: PreToolUse:Bash hook error: RALPH-GUARD: curl is disabled in this environment",
        "hook PostToolUse:Bash error (exit 1)",
      ]);
    });

    it("hands back only main-thread text as agent text, line by line", () => {
      // Act
      const { decoded } = decodeFixture("subagent-session.jsonl");

      // Assert
      expect(decoded.map((d) => d.agentText).filter((t) => t !== undefined)).toEqual([
        "I'll delegate the draft.\nThe marker ===RALPH_RESULT_END=== comes last.",
        "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/org/p/_git/r/pullrequest/7\nSTATUS: completed\n===RALPH_RESULT_END===",
      ]);
    });

    it("finishes with the final message, the session id and usage summed over every model", () => {
      // Arrange
      const { decoder } = decodeFixture("subagent-session.jsonl");

      // Act
      const outcome = decoder.finish();

      // Assert
      expect(outcome.agentText).toBe(
        "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/org/p/_git/r/pullrequest/7\nSTATUS: completed\n===RALPH_RESULT_END===",
      );
      expect(outcome.sessionId).toBe("11111111-2222-4333-8444-555555555555");
      expect(outcome.cliError).toBeUndefined();
      expect(outcome.usage).toEqual({
        costUsd: 0.0382258,
        numTurns: 5,
        durationApiMs: 9747,
        inputTokens: 50,
        outputTokens: 700,
        cacheReadTokens: 24846,
        cacheCreationTokens: 16115,
        byModel: {
          "claude-opus-5-5": {
            inputTokens: 46,
            outputTokens: 694,
            cacheReadTokens: 24838,
            cacheCreationTokens: 16113,
            costUsd: 0.03,
          },
          "claude-haiku-4-5-20251001": {
            inputTokens: 4,
            outputTokens: 6,
            cacheReadTokens: 8,
            cacheCreationTokens: 2,
            costUsd: 0.0082258,
          },
        },
        permissionDenials: 1,
        subagentsSpawned: 1,
        terminalReason: "completed",
      });
    });
  });

  describe("a session that cannot authenticate", () => {
    it("reports the API error kind and message, with no agent text", () => {
      // Arrange
      const { decoder, decoded } = decodeFixture("not-logged-in.jsonl");

      // Act
      const outcome = decoder.finish();

      // Assert
      expect(outcome.cliError).toEqual({
        subtype: "authentication_failed",
        message: "Not logged in · Please run /login",
      });
      expect(outcome.agentText).toBe("");
      expect(outcome.sessionId).toBe("6c94794c-bed5-4750-9f7c-9cd9183780db");
      expect(allWarnings(decoded)).toEqual([
        "API error (authentication_failed): Not logged in · Please run /login",
        expect.stringContaining(
          "result: success, 1 turns, $0.0000, ended by api_error (error authentication_failed: Not",
        ),
      ]);
    });
  });

  describe("agent text", () => {
    it("falls back to all main-thread text when the final message holds no result block", () => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();
      decoder.decodeLine(
        line({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: BLOCK }] } }),
      );
      decoder.decodeLine(
        line({ type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: "Bye." }] } }),
      );
      decoder.decodeLine(line({ type: "result", subtype: "success", is_error: false, result: "Bye." }));

      // Act & Assert
      expect(decoder.finish().agentText).toBe(`${BLOCK}\nBye.`);
    });

    it("ignores a result block that only appears inside a tool call or a subagent", () => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();

      // Act
      const toolCall = decoder.decodeLine(
        line({
          type: "assistant",
          parent_tool_use_id: null,
          message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "/x", content: BLOCK } }] },
        }),
      );
      const subagent = decoder.decodeLine(
        line({
          type: "assistant",
          parent_tool_use_id: "toolu_1",
          message: { content: [{ type: "text", text: BLOCK }] },
        }),
      );

      // Assert
      expect(toolCall.agentText).toBeUndefined();
      expect(subagent.agentText).toBeUndefined();
      expect(decoder.finish().agentText).toBe("");
    });

    it("keeps the last result when the CLI reports several", () => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();
      decoder.decodeLine(
        line({ type: "result", subtype: "success", is_error: false, result: "Waiting…", num_turns: 3 }),
      );

      // Act
      decoder.decodeLine(line({ type: "result", subtype: "success", is_error: false, result: BLOCK, num_turns: 1 }));

      // Assert
      const outcome = decoder.finish();
      expect(outcome.agentText).toBe(BLOCK);
      expect(outcome.usage?.numTurns).toBe(1);
    });
  });

  describe("failed sessions", () => {
    it.each([
      ["error_max_budget_usd", { subtype: "error_max_budget_usd", is_error: true, errors: ["Budget of $5 exceeded"] }],
      ["error_max_turns", { subtype: "error_max_turns", is_error: true, errors: ["Reached max turns"] }],
      ["error_during_execution", { subtype: "error_during_execution" }],
    ])("reports subtype %s as the CLI error", (subtype, result) => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();

      // Act
      decoder.decodeLine(line({ type: "result", ...result }));

      // Assert
      expect(decoder.finish().cliError?.subtype).toBe(subtype);
    });

    it("joins the errors list when the result carries no message", () => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();

      // Act
      decoder.decodeLine(line({ type: "result", subtype: "error_max_turns", is_error: true, errors: ["a", "b"] }));

      // Assert
      expect(decoder.finish().cliError).toEqual({ subtype: "error_max_turns", message: "a; b" });
    });

    it("reports no usage, session or error when the CLI died before its result", () => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();
      decoder.decodeLine(
        line({
          type: "assistant",
          parent_tool_use_id: null,
          message: { content: [{ type: "text", text: "halfway" }] },
        }),
      );

      // Act
      const outcome = decoder.finish();

      // Assert
      expect(outcome).toEqual({ agentText: "halfway", usage: undefined, sessionId: undefined, cliError: undefined });
    });
  });

  describe("malformed output", () => {
    it("warns with a line that is not JSON and keeps decoding", () => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();

      // Act
      const decoded = decoder.decodeLine("Error: something broke {");
      decoder.decodeLine(line({ type: "result", subtype: "success", is_error: false, result: BLOCK }));

      // Assert
      expect(decoded).toEqual({ logLines: [], warnings: ["unparsable output: Error: something broke {"] });
      expect(decoder.finish().agentText).toBe(BLOCK);
    });

    it.each(["[1,2]", "42", "null"])("warns with JSON %s that is not an event object", (raw) => {
      // Act & Assert
      expect(new ClaudeStreamJsonDecoder().decodeLine(raw).warnings).toEqual([`unexpected output: ${raw}`]);
    });

    it("skips blank lines and unknown events without output", () => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();

      // Act & Assert
      expect(decoder.decodeLine("   ")).toEqual({ logLines: [] });
      expect(decoder.decodeLine(line({ type: "stream_event", event: {} }))).toEqual({ logLines: [] });
      expect(decoder.decodeLine(line({ type: "system", subtype: "thinking_tokens" }))).toEqual({ logLines: [] });
    });

    it("tolerates fields of unexpected types", () => {
      // Arrange
      const decoder = new ClaudeStreamJsonDecoder();

      // Act
      const decoded = decoder.decodeLine(line({ type: "assistant", message: { content: "not a list" } }));
      decoder.decodeLine(
        line({ type: "result", subtype: 7, is_error: false, modelUsage: [1], permission_denials: "x" }),
      );

      // Assert
      expect(decoded).toEqual({ logLines: [] });
      expect(decoder.finish().usage).toMatchObject({ inputTokens: 0, permissionDenials: 0, byModel: {} });
    });
  });

  describe("context compaction", () => {
    it("logs the compaction trigger and the tokens before it", () => {
      // Act
      const decoded = new ClaudeStreamJsonDecoder().decodeLine(
        line({
          type: "system",
          subtype: "compact_boundary",
          compact_metadata: { trigger: "auto", pre_tokens: 150000 },
        }),
      );

      // Assert
      expect(decoded.logLines).toEqual(["context compacted (auto, 150000 tokens before)"]);
    });
  });
});
