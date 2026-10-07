import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunArtifactsDeriver } from "../../src/services/run-artifacts-deriver";
import { CliRuntimeRegistry, type ICliRuntime } from "../../src/cli/cli-runtime";
import { ClaudeCodeRuntime } from "../../src/cli/claude/claude-runtime";
import { HookRulesRedactor, type ITextRedactor } from "../../src/logs/text-redactor";
import { RUN_TELEMETRY_SCHEMA_VERSION, type RunTelemetry } from "../../src/cli/telemetry/run-telemetry";
import { ClaudeAuthMode, CliType, StageMode } from "../../src/config/types";
import type { TaskContext } from "../../src/services/task-context";
import { makeProfile, makeResult, makeStage, makeTaskContext } from "../helpers/factories";
import { createMockCliRuntime, createMockLogger, createMockTextRedactor, type Mocked } from "../helpers/mocks";
import type { Logger } from "../../src/logger";

const SESSIONS = join(import.meta.dirname, "../cli/claude/fixtures/claude-sessions");
const ROOT_DIR = join(import.meta.dirname, "../..");

const TELEMETRY: RunTelemetry = {
  schemaVersion: RUN_TELEMETRY_SCHEMA_VERSION,
  cli: CliType.Claude,
  sessionIds: ["s-1"],
  totals: {
    sessions: 1,
    subagents: 0,
    toolCalls: 0,
    failedToolCalls: 0,
    modelCalls: 1,
    apiErrors: 0,
    compactions: 0,
    hookFeedback: 0,
    malformedLines: 0,
  },
  spans: [],
};

describe("RunArtifactsDeriver", () => {
  let outputDir: string;
  let logger: Logger;
  let redactor: Mocked<ITextRedactor>;
  let claude: ICliRuntime & Mocked<ICliRuntime>;
  let copilot: ICliRuntime & Mocked<ICliRuntime>;

  /** A task whose container stages run `clis`, writing into the test's output directory. */
  function taskOn(...clis: CliType[]): TaskContext {
    const stages = clis.map((cli, i) => makeStage({ role: `stage-${i}`, cli }));
    return makeTaskContext({ profile: makeProfile({ stages }), taskId: "DF-1-100", outputDir });
  }

  function deriver(runtimes: ICliRuntime[] = [claude, copilot], textRedactor: ITextRedactor = redactor) {
    return new RunArtifactsDeriver({ cliRuntimes: new CliRuntimeRegistry({ runtimes }), textRedactor, logger });
  }

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), "run-artifacts-"));
    logger = createMockLogger();
    redactor = createMockTextRedactor();
    claude = createMockCliRuntime(CliType.Claude, {
      deriveRunArtifacts: vi.fn().mockResolvedValue({ transcript: ["# T", "SECRET", ""], telemetry: TELEMETRY }),
    });
    copilot = createMockCliRuntime(CliType.Copilot);
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  describe("derived transcript and telemetry", () => {
    it("writes the redacted transcript as the attached transcript and the telemetry beside it", async () => {
      // Arrange
      const result = makeResult("DF-1", { collectedLogs: { "claude-sessions": "/logs/sessions" } });

      // Act
      await deriver().derive(taskOn(CliType.Claude), result);

      // Assert
      expect(claude.deriveRunArtifacts).toHaveBeenCalledWith({ "claude-sessions": "/logs/sessions" });
      expect(readFileSync(result.collectedLogs["transcript"], "utf-8")).toBe("# T\n[REDACTED]\n");
      expect(JSON.parse(readFileSync(result.collectedLogs["claude-run-telemetry"], "utf-8"))).toEqual(TELEMETRY);
      expect(result.collectedLogs["transcript"]).toMatch(/[/\\]DF-1-100-\d+-transcript\.md$/);
      expect(result.collectedLogs["claude-run-telemetry"]).toMatch(/[/\\]DF-1-100-\d+-claude-run-telemetry\.json$/);
    });

    it("asks only the runtimes of the CLIs the task's container stages run", async () => {
      // Arrange
      const profile = makeProfile({
        stages: [makeStage({ cli: CliType.Copilot }), makeStage({ cli: CliType.Claude, mode: StageMode.Local })],
      });

      // Act
      await deriver().derive(makeTaskContext({ profile, outputDir }), makeResult("DF-1"));

      // Assert
      expect(copilot.deriveRunArtifacts).toHaveBeenCalledOnce();
      expect(claude.deriveRunArtifacts).not.toHaveBeenCalled();
    });

    it("files the derived transcript under the CLI's name when another CLI's own transcript is attached", async () => {
      // Arrange
      const copilotTranscript = join(outputDir, "copilot-transcript.md");
      writeFileSync(copilotTranscript, "copilot says SECRET");
      const result = makeResult("DF-1", { collectedLogs: { transcript: copilotTranscript } });

      // Act
      await deriver().derive(taskOn(CliType.Copilot, CliType.Claude), result);

      // Assert
      expect(result.collectedLogs["transcript"]).toBe(copilotTranscript);
      expect(readFileSync(result.collectedLogs["claude-transcript"], "utf-8")).toBe("# T\n[REDACTED]\n");
    });

    it("writes nothing for a CLI that derives nothing", async () => {
      // Arrange
      const result = makeResult("DF-1");

      // Act
      await deriver().derive(taskOn(CliType.Copilot), result);

      // Assert
      expect(result.collectedLogs).toEqual({});
      expect(readdirSync(outputDir)).toEqual([]);
    });
  });

  describe("transcripts the CLIs wrote themselves", () => {
    it("redacts the attached transcript and each stage's transcript in place", async () => {
      // Arrange
      const transcript = join(outputDir, "transcript.md");
      const stageTranscript = join(outputDir, "primary-transcript.md");
      writeFileSync(transcript, "token SECRET");
      writeFileSync(stageTranscript, "stage SECRET");
      const result = makeResult("DF-1", {
        collectedLogs: { transcript, "primary-transcript": stageTranscript, proxy: join(outputDir, "proxy.log") },
      });

      // Act
      await deriver().derive(taskOn(CliType.Copilot), result);

      // Assert
      expect(readFileSync(transcript, "utf-8")).toBe("token [REDACTED]");
      expect(readFileSync(stageTranscript, "utf-8")).toBe("stage [REDACTED]");
      expect(redactor.redact).toHaveBeenCalledTimes(2);
    });
  });

  describe("failures", () => {
    it("drops a collected transcript it cannot redact, so it is never attached", async () => {
      // Arrange
      const transcript = join(outputDir, "transcript.md");
      writeFileSync(transcript, "token SECRET");
      redactor.redact.mockRejectedValue(new Error("perl: not found"));
      const result = makeResult("DF-1", { collectedLogs: { transcript } });

      // Act
      await deriver().derive(taskOn(CliType.Copilot), result);

      // Assert
      expect(result.collectedLogs).not.toHaveProperty("transcript");
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("perl: not found"));
    });

    it("drops a collected transcript that is missing on disk", async () => {
      // Arrange
      const result = makeResult("DF-1", { collectedLogs: { transcript: join(outputDir, "gone.md") } });

      // Act
      await deriver().derive(taskOn(CliType.Copilot), result);

      // Assert
      expect(result.collectedLogs).not.toHaveProperty("transcript");
      expect(redactor.redact).not.toHaveBeenCalled();
    });

    it("never writes a derived transcript it cannot redact, but still writes the telemetry", async () => {
      // Arrange
      redactor.redactEach.mockRejectedValue(new Error("redact.pl exited 255"));
      const result = makeResult("DF-1");

      // Act
      await deriver().derive(taskOn(CliType.Claude), result);

      // Assert
      expect(result.collectedLogs).not.toHaveProperty("transcript");
      expect(readdirSync(outputDir).some((f) => f.endsWith("-transcript.md"))).toBe(false);
      expect(existsSync(result.collectedLogs["claude-run-telemetry"])).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("is not attached"));
    });

    it("logs a runtime that cannot read its session logs and goes on with the other CLIs", async () => {
      // Arrange
      claude.deriveRunArtifacts.mockRejectedValue(new Error("ENOENT: claude-sessions"));
      copilot.deriveRunArtifacts.mockResolvedValue({ transcript: ["copilot SECRET"], telemetry: null });
      const result = makeResult("DF-1");

      // Act
      await deriver().derive(taskOn(CliType.Claude, CliType.Copilot), result);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("ENOENT: claude-sessions"));
      expect(readFileSync(result.collectedLogs["transcript"], "utf-8")).toBe("copilot [REDACTED]");
    });

    it("logs telemetry it cannot write and records no path for it", async () => {
      // Arrange
      const result = makeResult("DF-1");
      const ctx = makeTaskContext({
        profile: makeProfile({ stages: [makeStage({ cli: CliType.Claude })] }),
        outputDir: join(outputDir, "file-not-dir"),
      });
      writeFileSync(join(outputDir, "file-not-dir"), "");

      // Act
      await deriver().derive(ctx, result);

      // Assert
      expect(result.collectedLogs).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("run telemetry failed"));
    });
  });

  describe("with the Claude Code runtime and the hooks' redactor", () => {
    it("stores and records a transcript of the collected sessions with credentials scrubbed", async () => {
      // Arrange
      const runtime = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });
      const hookRules = new HookRulesRedactor({ rootDir: ROOT_DIR }, { PATH: process.env.PATH });
      const result = makeResult("DF-1", { collectedLogs: { "claude-sessions": SESSIONS } });

      // Act
      await deriver([runtime], hookRules).derive(taskOn(CliType.Claude), result);

      // Assert
      const stored = readFileSync(result.collectedLogs["transcript"], "utf-8");
      expect(stored).toContain("clean, remote token [REDACTED]");
      expect(stored).not.toContain("ghp_0123456789abcdefghijABCDEFGHIJ");
      const telemetry = JSON.parse(readFileSync(result.collectedLogs["claude-run-telemetry"], "utf-8"));
      expect(telemetry.totals.sessions).toBe(2);
    });

    it("scrubs a token the tool output cut would split before cutting, so none of it is stored", async () => {
      // Arrange
      const token = "ghp_0123456789abcdefghijABCDEFGHIJ";
      const output = `${"x".repeat(1980)} ${token}`;
      const project = join(outputDir, "claude-sessions", "-workspace");
      mkdirSync(project, { recursive: true });
      const entries = [
        {
          type: "assistant",
          message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }] },
        },
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: output }] } },
      ];
      writeFileSync(join(project, "s-1.jsonl"), entries.map((entry) => JSON.stringify(entry)).join("\n"));
      const runtime = new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken });
      const hookRules = new HookRulesRedactor({ rootDir: ROOT_DIR }, { PATH: process.env.PATH });
      const result = makeResult("DF-1", { collectedLogs: { "claude-sessions": join(outputDir, "claude-sessions") } });

      // Act
      await deriver([runtime], hookRules).derive(taskOn(CliType.Claude), result);

      // Assert
      const stored = readFileSync(result.collectedLogs["transcript"], "utf-8");
      expect(stored).toContain(`${"x".repeat(1980)} [REDACTED]\n`);
      expect(stored).not.toContain("ghp_");
    });
  });
});
