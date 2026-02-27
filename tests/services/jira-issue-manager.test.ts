import { describe, it, expect, beforeEach } from "vitest";
import { JiraIssueManager } from "../../src/services/jira-issue-manager.js";
import { TransitionPhase } from "../../src/orchestrator-types.js";
import { createMockJiraClient, createMockLogger } from "../helpers/mocks.js";
import { makeIssue } from "../helpers/factories.js";
const KEY = "DF-100";

describe("JiraIssueManager", () => {
  let jira: ReturnType<typeof createMockJiraClient>;
  let logger: ReturnType<typeof createMockLogger>;
  let manager: JiraIssueManager;

  beforeEach(() => {
    jira = createMockJiraClient();
    logger = createMockLogger();
    manager = new JiraIssueManager({ jiraClient: jira, logger });
    manager.retryOptions = { delayMs: 1 };
  });

  describe("transitionIssue", () => {
    it("finds and executes the transition", async () => {
      await manager.transitionIssue(KEY, "In Progress", TransitionPhase.BeforeAgent);

      expect(jira.findTransitionId).toHaveBeenCalledWith(KEY, "In Progress");
      expect(jira.transitionIssue).toHaveBeenCalledWith(KEY, "99");
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('transitioned (beforeAgent → "In Progress")'),
      );
    });

    it("skips when targetStatus is undefined", async () => {
      await manager.transitionIssue(KEY, undefined, TransitionPhase.AfterAgent);

      expect(jira.findTransitionId).not.toHaveBeenCalled();
      expect(jira.transitionIssue).not.toHaveBeenCalled();
    });

    it("posts failure comment when transition fails", async () => {
      jira.findTransitionId.mockResolvedValue(undefined);

      await manager.transitionIssue(KEY, "Done", TransitionPhase.AfterAgent);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to transition"),
      );
      expect(jira.addComment).toHaveBeenCalledWith(
        KEY,
        expect.stringContaining("Done"),
      );
    });

    it("uses phase label in log messages", async () => {
      await manager.transitionIssue(KEY, "Ready for Review", TransitionPhase.AfterAgent);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("afterAgent"),
      );
    });
  });

  describe("postStartComment", () => {
    it("posts a start comment with agent name", async () => {
      await manager.postStartComment(KEY, "ralph", "ralph-docs");

      expect(jira.addComment).toHaveBeenCalledWith(KEY, expect.any(String));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Start comment posted"),
      );
    });

    it("logs warning when comment fails", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA down"));

      await manager.postStartComment(KEY, "ralph", "ralph-docs");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to comment"),
      );
    });
  });

  describe("postErrorComment", () => {
    it("posts formatted error to JIRA", async () => {
      await manager.postErrorComment(KEY, "Connection refused");

      expect(jira.addComment).toHaveBeenCalledWith(
        KEY,
        expect.stringContaining("Connection refused"),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Error comment posted"),
      );
    });

    it("logs warning when comment fails", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA down"));

      await manager.postErrorComment(KEY, "some error");

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
      await manager.postCrashRecoveryComment(KEY, "ralph-docs:ralph");

      expect(jira.addComment).toHaveBeenCalledWith(
        KEY,
        expect.any(String),
      );
    });

    it("logs warning on failure without throwing", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA unreachable"));

      await manager.postCrashRecoveryComment(KEY, "ralph-docs:ralph");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post crash-recovery comment"),
      );
    });
  });

  describe("postStaleStatusComment", () => {
    it("posts stale-status comment to JIRA", async () => {
      await manager.postStaleStatusComment(KEY, "ralph", "Done");

      expect(jira.addComment).toHaveBeenCalledWith(
        KEY,
        expect.any(String),
      );
    });

    it("logs warning on failure without throwing", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA unreachable"));

      await manager.postStaleStatusComment(KEY, "ralph", "Done");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post stale-status comment"),
      );
    });
  });

  describe("postAckComment", () => {
    it("posts ack comment to JIRA", async () => {
      await manager.postAckComment(KEY, "ralph");

      expect(jira.addComment).toHaveBeenCalledWith(
        KEY,
        expect.any(String),
      );
    });

    it("logs warning on failure without throwing", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA unreachable"));

      await manager.postAckComment(KEY, "ralph");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post ack comment"),
      );
    });
  });

  describe("postComment", () => {
    it("posts arbitrary comment body to JIRA", async () => {
      await manager.postComment(KEY, "Custom message");

      expect(jira.addComment).toHaveBeenCalledWith(KEY, "Custom message");
    });

    it("logs warning on failure without throwing", async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA unreachable"));

      await manager.postComment(KEY, "Custom message");

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to post comment"),
      );
    });
  });
});
