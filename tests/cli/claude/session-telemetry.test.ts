import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { extractClaudeTelemetry } from "../../../src/cli/claude/session-telemetry";
import {
  type ClaudeSession,
  type ClaudeSubagent,
  readClaudeSessions,
  SessionEventKind,
} from "../../../src/cli/claude/session-log";
import { RUN_TELEMETRY_SCHEMA_VERSION } from "../../../src/cli/telemetry/run-telemetry";
import { CliType } from "../../../src/config/types";

const SESSIONS = join(import.meta.dirname, "fixtures", "claude-sessions");
const MAIN = "11111111-2222-4333-8444-555555555555";
const LATER = "00000000-0000-4000-8000-000000000000";
const at = (time: string): number => Date.parse(`2026-10-07T${time}Z`);

/** A session with no events of its own and the given subagents. */
function sessionWith(subagents: ClaudeSubagent[]): ClaudeSession {
  return { sessionId: "s", events: [], malformedLines: 0, subagents };
}

describe("extractClaudeTelemetry", () => {
  describe("a run with subagents", () => {
    it("builds one span per main thread and subagent, as a tree per session", async () => {
      // Arrange
      const sessions = await readClaudeSessions(SESSIONS);

      // Act
      const telemetry = extractClaudeTelemetry(sessions);

      // Assert
      expect(telemetry.schemaVersion).toBe(RUN_TELEMETRY_SCHEMA_VERSION);
      expect(telemetry.cli).toBe(CliType.Claude);
      expect(telemetry.sessionIds).toEqual([MAIN, LATER]);
      expect(telemetry.spans.map((s) => [s.spanId, s.parentSpanId, s.agent, s.depth])).toEqual([
        [MAIN, undefined, "ralph", 0],
        [`${MAIN}/a1`, MAIN, "writer", 1],
        [`${MAIN}/a2`, `${MAIN}/a1`, "reviewer", 2],
        [`${MAIN}/a3`, MAIN, "unknown", 1],
        [LATER, undefined, "ralph-reviewer", 0],
      ]);
    });

    it("records each tool call's duration, error flag and the subagent it spawned", async () => {
      // Arrange
      const sessions = await readClaudeSessions(SESSIONS);

      // Act
      const [main, writer] = extractClaudeTelemetry(sessions).spans;

      // Assert
      expect(main.toolCalls).toEqual([
        { toolUseId: "toolu_bash", tool: "Bash", ts: at("06:00:03.000"), durationMs: 1500, isError: false },
        {
          toolUseId: "toolu_agent",
          tool: "Agent",
          ts: at("06:00:05.000"),
          durationMs: 60_000,
          isError: false,
          spawnedSpanId: `${MAIN}/a1`,
        },
      ]);
      expect(writer.toolCalls[0]).toMatchObject({ tool: "Write", durationMs: 250, isError: true });
    });

    it("records each span's models, model calls, time range, compactions and API errors", async () => {
      // Arrange
      const sessions = await readClaudeSessions(SESSIONS);

      // Act
      const spans = extractClaudeTelemetry(sessions).spans;

      // Assert
      expect(spans[0]).toMatchObject({
        models: ["claude-opus-5-5", "claude-sonnet-5-5"],
        modelCalls: 3,
        startTs: at("06:00:01.000"),
        endTs: at("06:01:10.000"),
        durationMs: 69_000,
        compactions: [{ ts: at("06:01:06.000"), trigger: "auto" }],
      });
      expect(spans[4]).toMatchObject({
        models: [],
        modelCalls: 0,
        apiErrors: [{ ts: at("06:05:01.000"), kind: "authentication_failed" }],
      });
    });

    it("totals the run", async () => {
      // Arrange
      const sessions = await readClaudeSessions(SESSIONS);

      // Act
      const { totals } = extractClaudeTelemetry(sessions);

      // Assert
      expect(totals).toEqual({
        sessions: 2,
        subagents: 3,
        toolCalls: 4,
        failedToolCalls: 1,
        modelCalls: 8,
        apiErrors: 1,
        compactions: 1,
        malformedLines: 1,
        durationMs: 300_000,
      });
    });

    it("holds no usage or cost figures", async () => {
      // Arrange
      const sessions = await readClaudeSessions(SESSIONS);

      // Act
      const json = JSON.stringify(extractClaudeTelemetry(sessions));

      // Assert
      expect(json).not.toMatch(/token|cost|usage|budget/i);
    });
  });

  describe("incomplete logs", () => {
    it("leaves out times and durations the log does not carry, and the result of a call that has none", () => {
      // Arrange
      const session: ClaudeSession = {
        sessionId: "s",
        events: [{ kind: SessionEventKind.ToolCall, toolUseId: "t1", tool: "Bash", input: {} }],
        malformedLines: 0,
        subagents: [],
      };

      // Act
      const telemetry = extractClaudeTelemetry([session]);

      // Assert
      expect(telemetry.spans[0]).toEqual({
        spanId: "s",
        sessionId: "s",
        agent: "unknown",
        depth: 0,
        models: [],
        modelCalls: 0,
        toolCalls: [{ toolUseId: "t1", tool: "Bash" }],
        apiErrors: [],
        compactions: [],
      });
      expect(telemetry.totals).not.toHaveProperty("durationMs");
    });

    it("places a subagent under the subagent its metadata names when no logged call spawned it", () => {
      // Arrange
      const subagent = (agentId: string, extra: Partial<ClaudeSubagent> = {}): ClaudeSubagent => ({
        agentId,
        agentType: "worker",
        events: [],
        malformedLines: 0,
        ...extra,
      });
      const session = sessionWith([
        subagent("p"),
        subagent("c", { toolUseId: "toolu_lost", parentAgentId: "p", spawnDepth: 2 }),
        subagent("o", { parentAgentId: "gone" }),
      ]);

      // Act
      const spans = extractClaudeTelemetry([session]).spans;

      // Assert
      expect(spans.map((s) => [s.spanId, s.parentSpanId, s.depth])).toEqual([
        ["s", undefined, 0],
        ["s/p", "s", 1],
        ["s/c", "s/p", 2],
        ["s/o", "s", 1],
      ]);
    });

    it("yields an empty run for no sessions", () => {
      // Act
      const telemetry = extractClaudeTelemetry([]);

      // Assert
      expect(telemetry.spans).toEqual([]);
      expect(telemetry.totals).toMatchObject({ sessions: 0, toolCalls: 0 });
    });
  });
});
