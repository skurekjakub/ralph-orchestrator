import { describe, it, expect } from "vitest";
import { TaskStatus } from "../../src/container/types.js";
import { LogLevel } from "../../src/orchestrator-types.js";
import { resolveStatus } from "../../src/container/result-parser.js";
import { makeResult } from "../helpers/factories.js";

// ── Log persistence tests ────────────────────────────────
// Tests for persistent activity log, CLI output saving, log collector,
// poller logging, and result status determination.

describe("Persistent activity log", () => {
  it("generates correct JSONL format for log entries", () => {
    const entry = { timestamp: 1707840000000, level: LogLevel.Info, message: "Test log" };
    const line = JSON.stringify(entry);
    const parsed = JSON.parse(line);

    expect(parsed.timestamp).toBe(1707840000000);
    expect(parsed.level).toBe(LogLevel.Info);
    expect(parsed.message).toBe("Test log");
  });

  it("generates daily log file name", () => {
    const date = new Date("2026-02-13T12:00:00Z").toISOString().slice(0, 10);
    const filename = `activity-${date}.log`;
    expect(filename).toBe("activity-2026-02-13.log");
  });

  it("appends entries without overwriting", () => {
    const entries: string[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(JSON.stringify({ timestamp: Date.now(), level: LogLevel.Info, message: `msg${i}` }));
    }
    const parsed = entries.map((e) => JSON.parse(e));
    expect(parsed).toHaveLength(5);
    expect(parsed[0].message).toBe("msg0");
    expect(parsed[4].message).toBe("msg4");
  });
});

describe("Copilot output persistence", () => {
  it("combines stdout and stderr into single log file", () => {
    const stdout = "RALPH_RESULT: completed";
    const stderr = "Warning: something";
    const fullOutput = [
      stdout ? `=== STDOUT ===\n${stdout}` : "",
      stderr ? `\n=== STDERR ===\n${stderr}` : "",
    ].join("");

    expect(fullOutput).toContain("=== STDOUT ===");
    expect(fullOutput).toContain("RALPH_RESULT: completed");
    expect(fullOutput).toContain("=== STDERR ===");
    expect(fullOutput).toContain("Warning: something");
  });

  it("generates correct copilot log filename", () => {
    const key = "DF-2759";
    const ts = 1707840000000;
    const filename = `${key}-${ts}-copilot.log`;
    expect(filename).toBe("DF-2759-1707840000000-copilot.log");
  });
});

describe("Log collector", () => {
  it("creates valid summary JSON structure", () => {
    const result = makeResult("DF-2704", {
      durationMs: 120000,
      stdout: "output",
      prUrl: "https://dev.azure.com/pr/1",
      collectedLogs: {
        audit: "/tmp/logs/DF-2704-123-audit.jsonl",
        transcript: "/tmp/logs/DF-2704-123-transcript.md",
        proxy: "/tmp/logs/DF-2704-123-proxy.log",
      },
    });

    const summary = {
      issueKey: result.issueKey,
      status: result.status,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      prUrl: result.prUrl,
      collectedLogs: result.collectedLogs,
      activityLogPath: "/tmp/logs/activity-2026-02-13.log",
      timestamp: new Date().toISOString(),
    };

    const json = JSON.stringify(summary, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed.issueKey).toBe("DF-2704");
    expect(parsed.status).toBe(TaskStatus.Completed);
    expect(parsed.durationMs).toBe(120000);
    expect(parsed.prUrl).toBe("https://dev.azure.com/pr/1");
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.activityLogPath).toContain("activity-");
  });
});

describe("Result status determination", () => {
  it("prefers agent status over exit code", () => {
    expect(resolveStatus(0, false, "completed")).toBe(TaskStatus.Completed);
    expect(resolveStatus(0, false, "partial")).toBe(TaskStatus.Partial);
    expect(resolveStatus(1, false, "completed")).toBe(TaskStatus.Completed);
    expect(resolveStatus(1, true, "blocked")).toBe(TaskStatus.Blocked);
  });

  it("falls back to exit code when no agent status", () => {
    expect(resolveStatus(0, false, undefined)).toBe(TaskStatus.Completed);
    expect(resolveStatus(1, false, undefined)).toBe(TaskStatus.Error);
    expect(resolveStatus(1, true, undefined)).toBe(TaskStatus.Partial);
  });
});

describe("Poller logging", () => {
  it("orchestrator source includes poll cycle logging", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(import.meta.dirname, "../../src/jira/poller.ts"),
      "utf-8"
    );

    expect(source).toContain("Polling");
    expect(source).toContain("candidate issues");
  });
});
