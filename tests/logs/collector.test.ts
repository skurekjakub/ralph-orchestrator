import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LogCollector } from "../../src/logs/collector";
import { makeResult } from "../helpers/factories";

describe("LogCollector", () => {
  let root: string;
  let collector: LogCollector;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "log-collector-"));
    collector = new LogCollector({
      outputConfig: { logDir: join(root, "logs"), handoffDir: join(root, "handoffs") },
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
  });
});
