import { describe, it, expect, beforeEach } from "vitest";
import { JiraIssueManager } from "../../src/services/jira-issue-manager.js";
import { TransitionPhase } from "../../src/orchestrator-types.js";
import { createMockJiraClient, createMockLogger } from "../helpers/mocks.js";
import { makeIssue } from "../helpers/factories.js";

describe("JiraIssueManager", () => {
  let jira: ReturnType<typeof createMockJiraClient>;
  let logger: ReturnType<typeof createMockLogger>;
  let manager: JiraIssueManager;

  beforeEach(() => {
    jira = createMockJiraClient();
    logger = createMockLogger();
    manager = new JiraIssueManager(jira, logger, { delayMs: 1 });
  });

  describe("transitionIssue", () => {
    it("finds and executes the transition", async () => {
      await manager.transitionIssue("DF-100", "In Progress", TransitionPhase.BeforeAgent);

      expect(jira.findTransitionId).toHaveBeenCalledWith("DF-100", "In Progress");
      expect(jira.transitionIssue).toHaveBeenCalledWith("DF-100", "99");
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('transitioned (beforeAgent → "In Progress")'),
      );
    });

    it("skips when targetStatus is undefined", async () => {
      await manager.transitionIssue("DF-100", undefined, TransitionPhase.AfterAgent);

      expect(jira.findTransitionId).not.toHaveBeenCalled();
      expect(jira.transitionIssue).not.toHaveBeenCalled();
    });

    it("posts failure comment when transition fails", async () => {
      jira.findTransitionId.mockResolvedValue(undefined);

      await manager.transitionIssue("DF-100", "Done", TransitionPhase.AfterAgent);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to transition"),
      );
      expect(jira.addComment).toHaveBeenCalledWith(
        "DF-100",
        expect.stringContaining("Done"),
      );
    });

    it("uses phase label in log messages", async () => {
      await manager.transitionIssue("DF-100", "Ready for Review", TransitionPhase.AfterAgent);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("afterAgent"),
      );
    });
  });

  describe("postStartComment", () => {
    it("posts a start comment with agent name", async () => {
      await manager.postStartComment("DF-100", "ralph", "ralph-docs");

      expect(jira.addComment).toHaveBeenCalledWith("DF-100", expect.any(String));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Start comment posted"),
      );
    });

    it("logs warning when comment fails", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA down"));

      await manager.postStartComment("DF-100", "ralph", "ralph-docs");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to comment"),
      );
    });
  });

  describe("postErrorComment", () => {
    it("posts formatted error to JIRA", async () => {
      await manager.postErrorComment("DF-100", "Connection refused");

      expect(jira.addComment).toHaveBeenCalledWith(
        "DF-100",
        expect.stringContaining("Connection refused"),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Error comment posted"),
      );
    });

    it("logs warning when comment fails", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA down"));

      await manager.postErrorComment("DF-100", "some error");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post error comment"),
      );
    });
  });

  describe("refreshIssue", () => {
    it("returns the first search result", async () => {
      const issue = makeIssue("DF-200");
      jira.searchIssues.mockResolvedValue([issue]);

      const result = await manager.refreshIssue("DF-200");

      expect(result).toBe(issue);
      expect(jira.searchIssues).toHaveBeenCalledWith("key = DF-200", 1);
    });

    it("returns null when no results", async () => {
      jira.searchIssues.mockResolvedValue([]);

      const result = await manager.refreshIssue("DF-200");

      expect(result).toBeNull();
    });

    it("returns null and logs warning on error", async () => {
      jira.searchIssues.mockRejectedValue(new Error("timeout"));

      const result = await manager.refreshIssue("DF-200");

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to refresh DF-200"),
      );
    });
  });

  describe("postCrashRecoveryComment", () => {
    it("posts crash-recovery comment to JIRA", async () => {
      await manager.postCrashRecoveryComment("DF-100", "ralph-docs:ralph");

      expect(jira.addComment).toHaveBeenCalledWith(
        "DF-100",
        expect.any(String),
      );
    });

    it("logs warning on failure without throwing", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA unreachable"));

      await manager.postCrashRecoveryComment("DF-100", "ralph-docs:ralph");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post crash-recovery comment"),
      );
    });
  });

  describe("postStaleStatusComment", () => {
    it("posts stale-status comment to JIRA", async () => {
      await manager.postStaleStatusComment("DF-100", "ralph", "Done");

      expect(jira.addComment).toHaveBeenCalledWith(
        "DF-100",
        expect.any(String),
      );
    });

    it("logs warning on failure without throwing", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA unreachable"));

      await manager.postStaleStatusComment("DF-100", "ralph", "Done");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post stale-status comment"),
      );
    });
  });

  describe("postAckComment", () => {
    it("posts ack comment to JIRA", async () => {
      await manager.postAckComment("DF-100", "ralph");

      expect(jira.addComment).toHaveBeenCalledWith(
        "DF-100",
        expect.any(String),
      );
    });

    it("logs warning on failure without throwing", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA unreachable"));

      await manager.postAckComment("DF-100", "ralph");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post ack comment"),
      );
    });
  });

  describe("postComment", () => {
    it("posts arbitrary comment body to JIRA", async () => {
      await manager.postComment("DF-100", "Custom message");

      expect(jira.addComment).toHaveBeenCalledWith("DF-100", "Custom message");
    });

    it("logs warning on failure without throwing", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA unreachable"));

      await manager.postComment("DF-100", "Custom message");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post comment"),
      );
    });
  });
});
