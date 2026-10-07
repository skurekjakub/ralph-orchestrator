/**
 * TaskResultWriter unit tests.
 *
 * Tests log collection, derived artifacts, transcript attachment, and execution summary persistence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskStatus } from "../../src/container/types";
import { TaskResultWriter } from "../../src/services/task-result-writer";
import type { IRunArtifactsDeriver } from "../../src/services/run-artifacts-deriver";
import type { ILogCollector } from "../../src/logs/collector";
import type { IResourceManager } from "../../src/services/task-resource-manager";
import { makeWorkItem, makeProfile, makeResult, makeTaskContext } from "../helpers/factories";
import {
  createMockLogger,
  createMockContainer,
  createMockLogCollector,
  createMockResources,
  type Mocked,
} from "../helpers/mocks";

const DS = "jira";
const KEY = "DF-100";

function createMockRunArtifacts(): Mocked<IRunArtifactsDeriver> {
  return { derive: vi.fn().mockResolvedValue(undefined) };
}

describe("TaskResultWriter", () => {
  let logCollector: Mocked<ILogCollector>;
  let resources: Mocked<IResourceManager>;
  let runArtifacts: Mocked<IRunArtifactsDeriver>;
  let writer: TaskResultWriter;
  const ctx = makeTaskContext({
    workItem: makeWorkItem(KEY),
    profile: makeProfile({ agentName: "ralph" }),
    taskId: "DF-100-123",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    logCollector = createMockLogCollector();
    resources = createMockResources();
    runArtifacts = createMockRunArtifacts();
    writer = new TaskResultWriter({ logCollector, resources, runArtifacts, logger: createMockLogger() });
  });

  describe("collectLogs", () => {
    it("records collected log paths on the result", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([
        { id: "transcript", path: "/tmp/logs/transcript.md" },
        { id: "proxy", path: "/tmp/logs/proxy.log" },
      ]);
      const result = makeResult(KEY);

      // Act
      await writer.collectLogs(container, result);

      // Assert
      expect(result.collectedLogs["transcript"]).toBe("/tmp/logs/transcript.md");
      expect(result.collectedLogs["proxy"]).toBe("/tmp/logs/proxy.log");
    });

    it("skips entries with no path", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "transcript", path: null }]);
      const result = makeResult(KEY);

      // Act
      await writer.collectLogs(container, result);

      // Assert
      expect(result.collectedLogs["transcript"]).toBeUndefined();
    });

    it("swallows collectAll errors", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.collectAll.mockRejectedValue(new Error("collect failed"));
      const result = makeResult(KEY);

      // Act
      await writer.collectLogs(container, result);

      // Assert
      expect(Object.keys(result.collectedLogs)).toHaveLength(0);
    });
  });

  describe("collectResults", () => {
    it("attaches the collected transcript to the work item", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "transcript", path: "/tmp/logs/DF-100-transcript.md" }]);

      // Act
      await writer.collectResults(ctx, container, makeResult(KEY));

      // Assert
      expect(resources.attachTranscript).toHaveBeenCalledWith(DS, KEY, "/tmp/logs/DF-100-transcript.md", "ralph");
    });

    it("derives artifacts from the collected logs and attaches the transcript the derivation records", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "claude-sessions", path: "/tmp/logs/sessions" }]);
      runArtifacts.derive.mockImplementation(async (_ctx, result) => {
        result.collectedLogs["transcript"] = "/tmp/logs/derived-transcript.md";
      });
      const result = makeResult(KEY);

      // Act
      await writer.collectResults(ctx, container, result);

      // Assert
      expect(runArtifacts.derive).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          collectedLogs: { "claude-sessions": "/tmp/logs/sessions", transcript: expect.any(String) },
        }),
      );
      expect(resources.attachTranscript).toHaveBeenCalledWith(DS, KEY, "/tmp/logs/derived-transcript.md", "ralph");
    });

    it("does not attach a transcript the derivation dropped because it could not be redacted", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "transcript", path: "/tmp/logs/DF-100-transcript.md" }]);
      runArtifacts.derive.mockImplementation(async (_ctx, result) => {
        delete result.collectedLogs["transcript"];
      });

      // Act
      await writer.collectResults(ctx, container, makeResult(KEY));

      // Assert
      expect(resources.attachTranscript).not.toHaveBeenCalled();
    });

    it("does not attach transcript when not collected", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "proxy", path: "/tmp/logs/proxy.log" }]);

      // Act
      await writer.collectResults(ctx, container, makeResult(KEY));

      // Assert
      expect(resources.attachTranscript).not.toHaveBeenCalled();
    });

    it("saves the execution summary after the derived artifacts are recorded", async () => {
      // Arrange
      const { container } = createMockContainer();
      runArtifacts.derive.mockImplementation(async (_ctx, result) => {
        result.collectedLogs["claude-run-telemetry"] = "/tmp/logs/telemetry.json";
      });
      let summarisedLogs: Record<string, string> = {};
      logCollector.saveExecutionSummary.mockImplementation((summarised) => {
        summarisedLogs = { ...summarised.collectedLogs };
        return "/tmp/summary.json";
      });
      const result = makeResult(KEY);

      // Act
      await writer.collectResults(ctx, container, result);

      // Assert
      expect(logCollector.saveExecutionSummary).toHaveBeenCalledWith(result, undefined, "DF-100-123");
      expect(summarisedLogs["claude-run-telemetry"]).toBe("/tmp/logs/telemetry.json");
    });

    it("summarises a failed task with its error status and message, and derives its transcripts", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "transcript", path: "/tmp/logs/DF-100-transcript.md" }]);
      const failed = makeResult(KEY, { status: TaskStatus.Error, exitCode: 1, stderr: "Docker not running" });

      // Act
      await writer.collectResults(ctx, container, failed);

      // Assert
      expect(runArtifacts.derive).toHaveBeenCalledWith(ctx, failed);
      expect(logCollector.saveExecutionSummary).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.Error, stderr: "Docker not running" }),
        undefined,
        "DF-100-123",
      );
    });
  });
});
