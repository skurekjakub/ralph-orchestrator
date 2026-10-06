/**
 * TaskResultWriter unit tests.
 *
 * Tests log collection, transcript attachment, and execution summary persistence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskResultWriter } from "../../src/services/task-result-writer.js";
import { makeWorkItem, makeProfile, makeResult, makeTaskContext } from "../helpers/factories.js";
import {
  createMockLogger,
  createMockContainer,
  createMockLogCollector,
  createMockResources,
} from "../helpers/mocks.js";

const DS = "jira";
const KEY = "DF-100";

describe("TaskResultWriter", () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  describe("collectLogs", () => {
    it("records collected log paths on the result", async () => {
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([
        { id: "transcript", path: "/tmp/logs/transcript.md" },
        { id: "proxy", path: "/tmp/logs/proxy.log" },
      ]);
      const writer = new TaskResultWriter({
        logCollector: createMockLogCollector(),
        resources: createMockResources(),
        logger,
      });
      const result = makeResult(KEY);

      await writer.collectLogs(container, result);

      expect(result.collectedLogs["transcript"]).toBe("/tmp/logs/transcript.md");
      expect(result.collectedLogs["proxy"]).toBe("/tmp/logs/proxy.log");
    });

    it("skips entries with no path", async () => {
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "transcript", path: null }]);
      const writer = new TaskResultWriter({
        logCollector: createMockLogCollector(),
        resources: createMockResources(),
        logger,
      });
      const result = makeResult(KEY);

      await writer.collectLogs(container, result);

      expect(result.collectedLogs["transcript"]).toBeUndefined();
    });

    it("swallows collectAll errors", async () => {
      const { container, spies } = createMockContainer();
      spies.collectAll.mockRejectedValue(new Error("collect failed"));
      const writer = new TaskResultWriter({
        logCollector: createMockLogCollector(),
        resources: createMockResources(),
        logger,
      });
      const result = makeResult(KEY);

      await writer.collectLogs(container, result);

      expect(Object.keys(result.collectedLogs)).toHaveLength(0);
    });
  });

  describe("collectResults", () => {
    it("attaches transcript to JIRA when collected", async () => {
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "transcript", path: "/tmp/logs/DF-100-transcript.md" }]);
      const resources = createMockResources();
      const writer = new TaskResultWriter({ logCollector: createMockLogCollector(), resources, logger });
      const ctx = makeTaskContext({
        workItem: makeWorkItem(KEY),
        profile: makeProfile({ agentName: "ralph" }),
        taskId: "DF-100-123",
      });
      const result = makeResult(KEY);

      await writer.collectResults(ctx, container, result);

      expect(resources.attachTranscript).toHaveBeenCalledWith(DS, KEY, "/tmp/logs/DF-100-transcript.md", "ralph");
    });

    it("does not attach transcript when not collected", async () => {
      const { container, spies } = createMockContainer();
      spies.collectAll.mockResolvedValue([{ id: "proxy", path: "/tmp/logs/proxy.log" }]);
      const resources = createMockResources();
      const writer = new TaskResultWriter({ logCollector: createMockLogCollector(), resources, logger });
      const ctx = makeTaskContext({
        workItem: makeWorkItem(KEY),
        profile: makeProfile({ agentName: "ralph" }),
        taskId: "DF-100-123",
      });
      const result = makeResult(KEY);

      await writer.collectResults(ctx, container, result);

      expect(resources.attachTranscript).not.toHaveBeenCalled();
    });

    it("saves execution summary", async () => {
      const { container } = createMockContainer();
      const logCollector = createMockLogCollector();
      const writer = new TaskResultWriter({ logCollector, resources: createMockResources(), logger });
      const ctx = makeTaskContext({
        workItem: makeWorkItem(KEY),
        profile: makeProfile(),
        taskId: "DF-100-123",
      });
      const result = makeResult(KEY);

      await writer.collectResults(ctx, container, result);

      expect(logCollector.saveExecutionSummary).toHaveBeenCalledWith(result, undefined, "DF-100-123");
    });
  });
});
