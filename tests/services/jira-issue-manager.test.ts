import { describe, it, expect, beforeEach } from "vitest";
import { JiraIssueManager } from "../../src/services/jira-issue-manager.js";
import { TransitionPhase } from "../../src/orchestrator-types.js";
import { createMockJiraClient, createMockLogger } from "../helpers/mocks.js";

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
});
