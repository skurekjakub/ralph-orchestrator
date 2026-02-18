import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OperationLedger, OperationStatus } from "../../src/services/operation-ledger.js";
import { TaskStatus } from "../../src/container/types.js";

let tempDir: string;
let ledger: OperationLedger;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  ledger = new OperationLedger(tempDir);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("OperationLedger", () => {
  describe("plan and query", () => {
    it("plans an operation and retrieves it", () => {
      const id = ledger.plan("DF-1", {
        variant: "ralph-docs:ralph",
        triggerCommentId: "C100",
        commentTimestamp: "2026-01-01T00:00:00Z",
      });

      const ops = ledger.getOperations("DF-1");
      expect(ops).toHaveLength(1);
      expect(ops[0].id).toBe(id);
      expect(ops[0].status).toBe(OperationStatus.Pending);
      expect(ops[0].variant).toBe("ralph-docs:ralph");
      expect(ops[0].triggerCommentId).toBe("C100");
    });

    it("returns empty for unknown issue", () => {
      expect(ledger.getOperations("NOPE-1")).toEqual([]);
    });

    it("plans multiple operations on the same issue", () => {
      ledger.plan("DF-1", { variant: "ralph-docs:ralph", triggerCommentId: "C100", commentTimestamp: "2026-01-01T00:00:00Z" });
      ledger.plan("DF-1", { variant: "ralph-docs:malph", triggerCommentId: "C101", commentTimestamp: "2026-01-01T01:00:00Z" });

      expect(ledger.getOperations("DF-1")).toHaveLength(2);
    });

    it("keeps operations separate across issues", () => {
      ledger.plan("DF-1", { variant: "ralph-docs:ralph", triggerCommentId: "C100", commentTimestamp: "2026-01-01T00:00:00Z" });
      ledger.plan("DF-2", { variant: "ralph-docs:ralph", triggerCommentId: "C200", commentTimestamp: "2026-01-01T00:00:00Z" });

      expect(ledger.getOperations("DF-1")).toHaveLength(1);
      expect(ledger.getOperations("DF-2")).toHaveLength(1);
    });
  });

  describe("lifecycle transitions", () => {
    it("transitions pending → active → completed", () => {
      const id = ledger.plan("DF-1", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });

      ledger.transition("DF-1", id, OperationStatus.Active);
      expect(ledger.getActive("DF-1")?.id).toBe(id);

      ledger.transition("DF-1", id, OperationStatus.Completed, { resultStatus: TaskStatus.Completed });
      expect(ledger.getActive("DF-1")).toBeUndefined();
      const ops = ledger.getOperations("DF-1");
      expect(ops[0].status).toBe(OperationStatus.Completed);
      expect(ops[0].completedAt).toBeDefined();
      expect(ops[0].resultStatus).toBe(TaskStatus.Completed);
    });

    it("transitions pending → active → error", () => {
      const id = ledger.plan("DF-1", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });

      ledger.transition("DF-1", id, OperationStatus.Active);
      ledger.transition("DF-1", id, OperationStatus.Error, { reason: "timeout" });

      const ops = ledger.getOperations("DF-1");
      expect(ops[0].status).toBe(OperationStatus.Error);
      expect(ops[0].reason).toBe("timeout");
      expect(ops[0].completedAt).toBeDefined();
    });
  });

  describe("reject", () => {
    it("records a rejected operation", () => {
      ledger.reject("DF-1", {
        variant: "ralph-docs:ralph",
        triggerCommentId: "C100",
        commentTimestamp: "2026-01-01T00:00:00Z",
        reason: "Invalid state",
      });

      const ops = ledger.getOperations("DF-1");
      expect(ops).toHaveLength(1);
      expect(ops[0].status).toBe(OperationStatus.Rejected);
      expect(ops[0].reason).toBe("Invalid state");
      expect(ops[0].completedAt).toBeDefined();
    });
  });

  describe("dedup queries", () => {
    it("isConsumed detects consumed triggers", () => {
      ledger.plan("DF-1", { variant: "v", triggerCommentId: "C100", commentTimestamp: "2026-01-01T00:00:00Z" });

      expect(ledger.isConsumed("DF-1", "v", "C100")).toBe(true);
      expect(ledger.isConsumed("DF-1", "v", "C200")).toBe(false);
      expect(ledger.isConsumed("DF-1", "other", "C100")).toBe(false);
    });

    it("getConsumedTriggerIds returns all consumed IDs for a variant", () => {
      ledger.plan("DF-1", { variant: "v", triggerCommentId: "C100", commentTimestamp: "2026-01-01T00:00:00Z" });
      ledger.plan("DF-1", { variant: "v", triggerCommentId: "C200", commentTimestamp: "2026-01-01T01:00:00Z" });
      ledger.plan("DF-1", { variant: "other", triggerCommentId: "C300", commentTimestamp: "2026-01-01T02:00:00Z" });

      const ids = ledger.getConsumedTriggerIds("DF-1", "v");
      expect(ids).toEqual(new Set(["C100", "C200"]));
    });

    it("hasPendingOrActive detects planned or running work", () => {
      expect(ledger.hasPendingOrActive("DF-1")).toBe(false);

      const id = ledger.plan("DF-1", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });
      expect(ledger.hasPendingOrActive("DF-1")).toBe(true);

      ledger.transition("DF-1", id, OperationStatus.Active);
      expect(ledger.hasPendingOrActive("DF-1")).toBe(true);

      ledger.transition("DF-1", id, OperationStatus.Completed);
      expect(ledger.hasPendingOrActive("DF-1")).toBe(false);
    });
  });

  describe("pending/active queries", () => {
    it("getPending returns pending ops sorted by comment timestamp", () => {
      ledger.plan("DF-1", { variant: "v", triggerCommentId: "C2", commentTimestamp: "2026-01-01T02:00:00Z" });
      ledger.plan("DF-1", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T01:00:00Z" });

      const pending = ledger.getPending("DF-1");
      expect(pending).toHaveLength(2);
      expect(pending[0].triggerCommentId).toBe("C1");
      expect(pending[1].triggerCommentId).toBe("C2");
    });

    it("getActive returns the active operation", () => {
      const id = ledger.plan("DF-1", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });
      expect(ledger.getActive("DF-1")).toBeUndefined();

      ledger.transition("DF-1", id, OperationStatus.Active);
      expect(ledger.getActive("DF-1")?.id).toBe(id);
    });
  });

  describe("crash recovery", () => {
    it("recovers active operations and marks them as error", () => {
      const id = ledger.plan("DF-1", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });
      ledger.transition("DF-1", id, OperationStatus.Active);

      const recovered = ledger.recoverActiveOperations();
      expect(recovered).toHaveLength(1);
      expect(recovered[0].issueKey).toBe("DF-1");
      expect(recovered[0].operation.status).toBe(OperationStatus.Error);

      expect(ledger.getOperations("DF-1")[0].status).toBe(OperationStatus.Error);
    });

    it("does not affect non-active operations", () => {
      ledger.plan("DF-1", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });
      const id2 = ledger.plan("DF-2", { variant: "v", triggerCommentId: "C2", commentTimestamp: "2026-01-01T00:00:00Z" });
      ledger.transition("DF-2", id2, OperationStatus.Active);
      ledger.transition("DF-2", id2, OperationStatus.Completed);

      const recovered = ledger.recoverActiveOperations();
      expect(recovered).toHaveLength(0);
      expect(ledger.getOperations("DF-1")[0].status).toBe(OperationStatus.Pending);
    });
  });

  describe("getAllPending", () => {
    it("returns pending ops across all issues sorted by timestamp", () => {
      ledger.plan("DF-2", { variant: "v", triggerCommentId: "C2", commentTimestamp: "2026-01-01T02:00:00Z" });
      ledger.plan("DF-1", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T01:00:00Z" });

      const all = ledger.getAllPending();
      expect(all).toHaveLength(2);
      expect(all[0].issueKey).toBe("DF-1");
      expect(all[1].issueKey).toBe("DF-2");
    });
  });

  describe("persistence", () => {
    it("survives re-instantiation", () => {
      ledger.plan("DF-1", { variant: "v", triggerCommentId: "C100", commentTimestamp: "2026-01-01T00:00:00Z" });

      const ledger2 = new OperationLedger(tempDir);
      expect(ledger2.getOperations("DF-1")).toHaveLength(1);
    });

    it("handles corrupt files gracefully", () => {
      writeFileSync(join(tempDir, "DF-BAD.json"), "not json at all");

      expect(ledger.getOperations("DF-BAD")).toEqual([]);
      ledger.plan("DF-BAD", { variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });
      expect(ledger.getOperations("DF-BAD")).toHaveLength(1);
    });
  });
});
