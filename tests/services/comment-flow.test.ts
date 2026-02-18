import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OperationLedger, OperationStatus } from "../../src/services/operation-ledger.js";
import { TaskStatus } from "../../src/container/types.js";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { extractAdfText } from "../../src/jira/field-extractor.js";
import { makeProfile, makeIssue, makeMatch } from "../helpers.js";
import type { JiraComment } from "../../src/jira/types.js";

let tempDir: string;
let ledger: OperationLedger;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "comment-flow-"));
  ledger = new OperationLedger(tempDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeComment(id: string, body: string, created: string): JiraComment {
  return {
    id,
    author: { displayName: "Test User" },
    body,
    created,
  };
}

describe("Comment-driven orchestration flow", () => {
  describe("trigger discovery", () => {
    it("discovers unconsumed trigger comments", () => {
      const profile = makeProfile({
        id: "ralph-docs",
        match: makeMatch({ statuses: ["New"], commentTrigger: "@RalphDocs" }),
      });
      const variant = profile.variantKey;

      const comments = [
        makeComment("C1", "Regular comment", "2026-01-01T00:00:00Z"),
        makeComment("C2", "@RalphDocs please handle this", "2026-01-01T01:00:00Z"),
        makeComment("C3", "Another regular comment", "2026-01-01T02:00:00Z"),
      ];

      const trigger = profile.match.commentTrigger!;
      const consumedIds = ledger.getConsumedTriggerIds("DF-1", variant);

      const unconsumed = comments.filter((c) => {
        if (consumedIds.has(c.id)) return false;
        const text = typeof c.body === "string" ? c.body : extractAdfText(c.body);
        return text.toLowerCase().includes(trigger.toLowerCase());
      });

      expect(unconsumed).toHaveLength(1);
      expect(unconsumed[0].id).toBe("C2");
    });

    it("marks consumed triggers as consumed", () => {
      const variant = "ralph-docs:ralph";

      ledger.plan("DF-1", {
        variant,
        triggerCommentId: "C2",
        commentTimestamp: "2026-01-01T01:00:00Z",
      });

      expect(ledger.isConsumed("DF-1", variant, "C2")).toBe(true);
      expect(ledger.isConsumed("DF-1", variant, "C3")).toBe(false);
    });

    it("case-insensitive trigger matching", () => {
      const trigger = "@RalphDocs";
      const comment = "hey @RALPHDOCS do this";
      expect(comment.toLowerCase().includes(trigger.toLowerCase())).toBe(true);
    });
  });

  describe("multi-variant on same issue", () => {
    it("same comment triggers multiple variants independently", () => {
      const ralph = makeProfile({
        id: "docs",
        agentName: "ralph",
        match: makeMatch({ statuses: ["New"], commentTrigger: "@RalphDocs" }),
      });
      const malph = makeProfile({
        id: "docs",
        agentName: "malph",
        match: makeMatch({ statuses: ["Ready for Review"], commentTrigger: "@Malph" }),
      });

      const ralphVariant = ralph.variantKey;
      const malphVariant = malph.variantKey;

      ledger.plan("DF-1", { variant: ralphVariant, triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });
      ledger.plan("DF-1", { variant: malphVariant, triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });

      expect(ledger.isConsumed("DF-1", ralphVariant, "C1")).toBe(true);
      expect(ledger.isConsumed("DF-1", malphVariant, "C1")).toBe(true);
      expect(ledger.getOperations("DF-1")).toHaveLength(2);
    });
  });

  describe("status validation before execution", () => {
    it("matchesProjectAndStatus validates before execution", () => {
      const profile = makeProfile({
        match: makeMatch({ statuses: ["New"], commentTrigger: "@ralph" }),
      });
      const router = new ProfileRouter([profile]);

      const validIssue = makeIssue("DF-1", "task", "New");
      expect(router.matchesProjectAndStatus(validIssue, profile)).toBe(true);

      const staleIssue = makeIssue("DF-1", "task", "In Progress");
      expect(router.matchesProjectAndStatus(staleIssue, profile)).toBe(false);
    });
  });

  describe("lifecycle: plan → active → complete", () => {
    it("full lifecycle creates proper audit trail", () => {
      const variant = "ralph-docs:ralph";

      const opId = ledger.plan("DF-1", {
        variant,
        triggerCommentId: "C100",
        commentTimestamp: "2026-01-01T00:00:00Z",
      });

      expect(ledger.getPending("DF-1")).toHaveLength(1);
      expect(ledger.getActive("DF-1")).toBeUndefined();

      ledger.transition("DF-1", opId, OperationStatus.Active);
      expect(ledger.getPending("DF-1")).toHaveLength(0);
      expect(ledger.getActive("DF-1")?.id).toBe(opId);

      ledger.transition("DF-1", opId, OperationStatus.Completed, { resultStatus: TaskStatus.Completed });
      expect(ledger.getPending("DF-1")).toHaveLength(0);
      expect(ledger.getActive("DF-1")).toBeUndefined();

      const ops = ledger.getOperations("DF-1");
      expect(ops).toHaveLength(1);
      expect(ops[0].status).toBe(OperationStatus.Completed);
      expect(ops[0].resultStatus).toBe(TaskStatus.Completed);
      expect(ops[0].completedAt).toBeDefined();
    });

    it("rejected operations consume the trigger", () => {
      const variant = "ralph-docs:ralph";

      ledger.reject("DF-1", {
        variant,
        triggerCommentId: "C100",
        commentTimestamp: "2026-01-01T00:00:00Z",
        reason: "Status changed",
      });

      expect(ledger.isConsumed("DF-1", variant, "C100")).toBe(true);
      expect(ledger.getPending("DF-1")).toHaveLength(0);
    });
  });

  describe("crash recovery", () => {
    it("active operations from previous session are marked as errors", () => {
      const opId = ledger.plan("DF-1", {
        variant: "ralph-docs:ralph",
        triggerCommentId: "C1",
        commentTimestamp: "2026-01-01T00:00:00Z",
      });
      ledger.transition("DF-1", opId, OperationStatus.Active);

      const newLedger = new OperationLedger(tempDir);
      const recovered = newLedger.recoverActiveOperations();

      expect(recovered).toHaveLength(1);
      expect(recovered[0].issueKey).toBe("DF-1");
      expect(newLedger.getOperations("DF-1")[0].status).toBe(OperationStatus.Error);
    });

    it("pending operations survive restart", () => {
      ledger.plan("DF-1", {
        variant: "ralph-docs:ralph",
        triggerCommentId: "C1",
        commentTimestamp: "2026-01-01T00:00:00Z",
      });

      const newLedger = new OperationLedger(tempDir);
      const pending = newLedger.getAllPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].issueKey).toBe("DF-1");
    });
  });

  describe("duplicate trigger suppression", () => {
    it("same trigger comment on same variant is only planned once", () => {
      const variant = "ralph-docs:ralph";

      ledger.plan("DF-1", { variant, triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });

      expect(ledger.isConsumed("DF-1", variant, "C1")).toBe(true);
    });

    it("new trigger comment after completion triggers new operation", () => {
      const variant = "ralph-docs:ralph";

      const opId = ledger.plan("DF-1", { variant, triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });
      ledger.transition("DF-1", opId, OperationStatus.Active);
      ledger.transition("DF-1", opId, OperationStatus.Completed, { resultStatus: TaskStatus.Completed });

      expect(ledger.isConsumed("DF-1", variant, "C1")).toBe(true);
      expect(ledger.isConsumed("DF-1", variant, "C2")).toBe(false);

      ledger.plan("DF-1", { variant, triggerCommentId: "C2", commentTimestamp: "2026-01-01T02:00:00Z" });
      expect(ledger.isConsumed("DF-1", variant, "C2")).toBe(true);
      expect(ledger.getOperations("DF-1")).toHaveLength(2);
    });
  });
});
