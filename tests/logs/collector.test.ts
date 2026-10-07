import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FailureCategory, LogCollector } from "../../src/logs/collector";
import { FailureReason, TaskStatus } from "../../src/container/types";
import { makeResult } from "../helpers/factories";

describe("LogCollector", () => {
  let root: string;
  let collector: LogCollector;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "log-collector-"));
    collector = new LogCollector({
      outputConfig: { logDir: join(root, "logs") },
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("saveExecutionSummary", () => {
    it("flags the sessions that ran without Ralph's hooks", () => {
      // Arrange
      const result = makeResult("DF-1", { hooklessSessions: ["s-1"] });

      // Act
      const path = collector.saveExecutionSummary(result, undefined, "DF-1-100");

      // Assert
      expect(JSON.parse(readFileSync(path, "utf-8"))).toMatchObject({ taskId: "DF-1", hooklessSessions: ["s-1"] });
    });

    it("leaves the flag out when every session ran Ralph's hooks", () => {
      // Act
      const path = collector.saveExecutionSummary(makeResult("DF-1"), undefined, "DF-1-100");

      // Assert
      expect(JSON.parse(readFileSync(path, "utf-8"))).not.toHaveProperty("hooklessSessions");
    });

    it("records a failed run's reason, CLI error, session ids and the start of its agent text", () => {
      // Arrange
      const result = makeResult("DF-1", {
        status: TaskStatus.Error,
        exitCode: 0,
        stdout: '{"type":"system","subtype":"init"}',
        agentText: "a".repeat(6000),
        failureReason: FailureReason.MissingResultBlock,
        cliError: { subtype: "error_max_turns", message: "Reached max turns" },
        sessionIds: ["s-1", "s-2"],
      });

      // Act
      const path = collector.saveExecutionSummary(result, undefined, "DF-1-100");

      // Assert
      const summary = JSON.parse(readFileSync(path, "utf-8"));
      expect(summary).toMatchObject({
        status: TaskStatus.Error,
        failureCategory: FailureCategory.Contract,
        failureReason: FailureReason.MissingResultBlock,
        cliError: { subtype: "error_max_turns", message: "Reached max turns" },
        sessionIds: ["s-1", "s-2"],
        agentText: "a".repeat(5000),
      });
      expect(summary).not.toHaveProperty("stdout");
    });

    it("records the session ids of a completed run but no failure fields or agent text", () => {
      // Arrange
      const result = makeResult("DF-1", { agentText: "done", sessionIds: ["s-1"] });

      // Act
      const path = collector.saveExecutionSummary(result, undefined, "DF-1-100");

      // Assert
      const summary = JSON.parse(readFileSync(path, "utf-8"));
      expect(summary.sessionIds).toEqual(["s-1"]);
      for (const key of ["failureCategory", "failureReason", "cliError", "agentText"]) {
        expect(summary).not.toHaveProperty(key);
      }
    });
  });
});
