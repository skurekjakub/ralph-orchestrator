import { describe, it, expect, beforeEach } from "vitest";
import { IssueManager } from "../../src/services/issue-manager.js";
import { TransitionPhase } from "../../src/orchestrator-types.js";
import { createMockConnector, createMockLogger } from "../helpers/mocks.js";
import { makeWorkItem } from "../helpers/factories.js";

describe("IssueManager", () => {
  let connector: ReturnType<typeof createMockConnector>;
  let logger: ReturnType<typeof createMockLogger>;
  let manager: IssueManager;

  beforeEach(() => {
    connector = createMockConnector();
    logger = createMockLogger();
    manager = new IssueManager({ connector, logger });
    manager.retryOptions = { delayMs: 1 };
  });

  describe("transitionWorkItem", () => {
    it("delegates to connector and logs success", async () => {
      await manager.transitionWorkItem("DF-100", "In Progress", TransitionPhase.BeforeAgent);

      expect(connector.transitionWorkItem).toHaveBeenCalledWith("DF-100", "In Progress");
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('transitioned (beforeAgent → "In Progress")'),
      );
    });

    it("skips when targetStatus is undefined", async () => {
      await manager.transitionWorkItem("DF-100", undefined, TransitionPhase.AfterAgent);

      expect(connector.transitionWorkItem).not.toHaveBeenCalled();
    });

    it("posts failure comment when connector throws", async () => {
      connector.transitionWorkItem.mockRejectedValue(
        new Error('No transition to "Done" available for DF-100'),
      );

      await manager.transitionWorkItem("DF-100", "Done", TransitionPhase.AfterAgent);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to transition"),
      );
      expect(connector.addComment).toHaveBeenCalledWith(
        "DF-100",
        expect.stringContaining("Done"),
      );
    });

    it("uses phase label in log messages", async () => {
      await manager.transitionWorkItem("DF-100", "Ready for Review", TransitionPhase.AfterAgent);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("afterAgent"),
      );
    });
  });

  describe("postStartComment", () => {
    it("posts a start comment with agent name", async () => {
      await manager.postStartComment("DF-100", "ralph", "ralph-docs");

      expect(connector.addComment).toHaveBeenCalledWith("DF-100", expect.any(String));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Start comment posted"),
      );
    });

    it("logs warning when comment fails", async () => {
      connector.addComment.mockRejectedValue(new Error("Connector down"));

      await manager.postStartComment("DF-100", "ralph", "ralph-docs");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to comment"),
      );
    });
  });

  describe("postErrorComment", () => {
    it("posts formatted error comment", async () => {
      await manager.postErrorComment("DF-100", "Connection refused");

      expect(connector.addComment).toHaveBeenCalledWith(
        "DF-100",
        expect.stringContaining("Connection refused"),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Error comment posted"),
      );
    });

    it("logs warning when comment fails", async () => {
      connector.addComment.mockRejectedValue(new Error("Connector down"));

      await manager.postErrorComment("DF-100", "some error");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post error comment"),
      );
    });
  });

  describe("refreshWorkItem", () => {
    it("returns the work item from connector", async () => {
      const workItem = makeWorkItem("DF-200");
      connector.refreshWorkItem.mockResolvedValue(workItem);

      const result = await manager.refreshWorkItem("DF-200");

      expect(result).toBe(workItem);
      expect(connector.refreshWorkItem).toHaveBeenCalledWith("DF-200");
    });

    it("returns null when connector throws not-found", async () => {
      connector.refreshWorkItem.mockRejectedValue(new Error("Work item DF-200 not found"));

      const result = await manager.refreshWorkItem("DF-200");

      expect(result).toBeNull();
    });

    it("returns null and logs warning on error", async () => {
      connector.refreshWorkItem.mockRejectedValue(new Error("timeout"));

      const result = await manager.refreshWorkItem("DF-200");

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to refresh"),
      );
    });
  });

  describe("getComments", () => {
    it("returns comments from connector", async () => {
      const comments = [
        { id: "c1", authorId: "u1", authorName: "Alice", body: "Hello", created: "2026-01-01T00:00:00Z" },
      ];
      connector.getComments.mockResolvedValue(comments);

      const result = await manager.getComments("DF-100");

      expect(result).toEqual(comments);
    });
  });
});
