import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OperationLedger, OperationStatus } from "../../src/services/operation-ledger.js";
import { TaskStatus } from "../../src/container/types.js";

const DS = "jira";
const TS = "2026-01-01T00:00:00Z";

let tempDir: string;
let ledger: OperationLedger;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  ledger = new OperationLedger({ outputConfig: { logDir: tempDir, handoffDir: "" } });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("OperationLedger", () => {
  describe("plan and query", () => {
    it("plans an operation and retrieves it", () => {
      const id = ledger.plan("DF-1", {
        dataSource: DS,
        variant: "ralph-docs:ralph",
        triggerCommentId: "C100",
        commentTimestamp: TS,
      });

      const ops = ledger.getOperations(DS, "DF-1");
      expect(ops).toHaveLength(1);
      expect(ops[0].id).toBe(id);
      expect(ops[0].status).toBe(OperationStatus.Pending);
      expect(ops[0].variant).toBe("ralph-docs:ralph");
      expect(ops[0].triggerCommentId).toBe("C100");
    });

    it("returns empty for unknown issue", () => {
      expect(ledger.getOperations(DS, "NOPE-1")).toEqual([]);
    });

    it("plans multiple operations on the same issue", () => {
      ledger.plan("DF-1", { dataSource: DS, variant: "ralph-docs:ralph", triggerCommentId: "C100", commentTimestamp: TS });
      ledger.plan("DF-1", { dataSource: DS, variant: "ralph-docs:malph", triggerCommentId: "C101", commentTimestamp: "2026-01-01T01:00:00Z" });

      expect(ledger.getOperations(DS, "DF-1")).toHaveLength(2);
    });

    it("keeps operations separate across issues", () => {
      ledger.plan("DF-1", { dataSource: DS, variant: "ralph-docs:ralph", triggerCommentId: "C100", commentTimestamp: TS });
      ledger.plan("DF-2", { dataSource: DS, variant: "ralph-docs:ralph", triggerCommentId: "C200", commentTimestamp: TS });

      expect(ledger.getOperations(DS, "DF-1")).toHaveLength(1);
      expect(ledger.getOperations(DS, "DF-2")).toHaveLength(1);
    });
  });

  describe("lifecycle transitions", () => {
    it("rejects invalid transition: completed → active", () => {
      const id = ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });
      ledger.transition(DS, "DF-1", id, OperationStatus.Active);
      ledger.transition(DS, "DF-1", id, OperationStatus.Completed);

      expect(() => ledger.transition(DS, "DF-1", id, OperationStatus.Active))
        .toThrow("Invalid operation state transition: completed → active");
    });

    it("rejects invalid transition: pending → completed", () => {
      const id = ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });

      expect(() => ledger.transition(DS, "DF-1", id, OperationStatus.Completed))
        .toThrow("Invalid operation state transition: pending → completed");
    });

    it("rejects invalid transition: error → pending", () => {
      const id = ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });
      ledger.transition(DS, "DF-1", id, OperationStatus.Active);
      ledger.transition(DS, "DF-1", id, OperationStatus.Error);

      expect(() => ledger.transition(DS, "DF-1", id, OperationStatus.Pending))
        .toThrow("Invalid operation state transition: error → pending");
    });

    it("transitions pending → active → completed", () => {
      const id = ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });

      ledger.transition(DS, "DF-1", id, OperationStatus.Active);
      expect(ledger.getActive(DS, "DF-1")?.id).toBe(id);

      ledger.transition(DS, "DF-1", id, OperationStatus.Completed, { resultStatus: TaskStatus.Completed });
      expect(ledger.getActive(DS, "DF-1")).toBeUndefined();
      const ops = ledger.getOperations(DS, "DF-1");
      expect(ops[0].status).toBe(OperationStatus.Completed);
      expect(ops[0].completedAt).toBeDefined();
      expect(ops[0].resultStatus).toBe(TaskStatus.Completed);
    });

    it("transitions pending → active → error", () => {
      const id = ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });

      ledger.transition(DS, "DF-1", id, OperationStatus.Active);
      ledger.transition(DS, "DF-1", id, OperationStatus.Error, { reason: "timeout" });

      const ops = ledger.getOperations(DS, "DF-1");
      expect(ops[0].status).toBe(OperationStatus.Error);
      expect(ops[0].reason).toBe("timeout");
      expect(ops[0].completedAt).toBeDefined();
    });
  });

  describe("reject", () => {
    it("records a rejected operation", () => {
      ledger.reject("DF-1", {
        dataSource: DS,
        variant: "ralph-docs:ralph",
        triggerCommentId: "C100",
        commentTimestamp: TS,
        reason: "Invalid state",
      });

      const ops = ledger.getOperations(DS, "DF-1");
      expect(ops).toHaveLength(1);
      expect(ops[0].status).toBe(OperationStatus.Rejected);
      expect(ops[0].reason).toBe("Invalid state");
      expect(ops[0].completedAt).toBeDefined();
    });
  });

  describe("dedup queries", () => {
    it("isConsumed detects consumed triggers", () => {
      ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C100", commentTimestamp: TS });

      expect(ledger.isConsumed(DS, "DF-1", "v", "C100")).toBe(true);
      expect(ledger.isConsumed(DS, "DF-1", "v", "C200")).toBe(false);
      expect(ledger.isConsumed(DS, "DF-1", "other", "C100")).toBe(false);
    });

    it("getConsumedTriggerIds returns all consumed IDs for a variant", () => {
      ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C100", commentTimestamp: TS });
      ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C200", commentTimestamp: "2026-01-01T01:00:00Z" });
      ledger.plan("DF-1", { dataSource: DS, variant: "other", triggerCommentId: "C300", commentTimestamp: "2026-01-01T02:00:00Z" });

      const ids = ledger.getConsumedTriggerIds(DS, "DF-1", "v");
      expect(ids).toEqual(new Set(["C100", "C200"]));
    });

    it("hasPendingOrActive detects planned or running work", () => {
      expect(ledger.hasPendingOrActive(DS, "DF-1")).toBe(false);

      const id = ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });
      expect(ledger.hasPendingOrActive(DS, "DF-1")).toBe(true);

      ledger.transition(DS, "DF-1", id, OperationStatus.Active);
      expect(ledger.hasPendingOrActive(DS, "DF-1")).toBe(true);

      ledger.transition(DS, "DF-1", id, OperationStatus.Completed);
      expect(ledger.hasPendingOrActive(DS, "DF-1")).toBe(false);
    });
  });

  describe("pending/active queries", () => {
    it("getPending returns pending ops sorted by comment timestamp", () => {
      ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C2", commentTimestamp: "2026-01-01T02:00:00Z" });
      ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T01:00:00Z" });

      const pending = ledger.getPending(DS, "DF-1");
      expect(pending).toHaveLength(2);
      expect(pending[0].triggerCommentId).toBe("C1");
      expect(pending[1].triggerCommentId).toBe("C2");
    });

    it("getActive returns the active operation", () => {
      const id = ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });
      expect(ledger.getActive(DS, "DF-1")).toBeUndefined();

      ledger.transition(DS, "DF-1", id, OperationStatus.Active);
      expect(ledger.getActive(DS, "DF-1")?.id).toBe(id);
    });
  });

  describe("crash recovery", () => {
    it("recovers active operations and marks them as error", () => {
      const id = ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });
      ledger.transition(DS, "DF-1", id, OperationStatus.Active);

      const recovered = ledger.recoverActiveOperations();
      expect(recovered).toHaveLength(1);
      expect(recovered[0].issueKey).toBe("DF-1");
      expect(recovered[0].operation.status).toBe(OperationStatus.Error);

      expect(ledger.getOperations(DS, "DF-1")[0].status).toBe(OperationStatus.Error);
    });

    it("does not affect non-active operations", () => {
      ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });
      const id2 = ledger.plan("DF-2", { dataSource: DS, variant: "v", triggerCommentId: "C2", commentTimestamp: TS });
      ledger.transition(DS, "DF-2", id2, OperationStatus.Active);
      ledger.transition(DS, "DF-2", id2, OperationStatus.Completed);

      const recovered = ledger.recoverActiveOperations();
      expect(recovered).toHaveLength(0);
      expect(ledger.getOperations(DS, "DF-1")[0].status).toBe(OperationStatus.Pending);
    });
  });

  describe("getAllPending", () => {
    it("returns pending ops across all issues sorted by timestamp", () => {
      ledger.plan("DF-2", { dataSource: DS, variant: "v", triggerCommentId: "C2", commentTimestamp: "2026-01-01T02:00:00Z" });
      ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: "2026-01-01T01:00:00Z" });

      const all = ledger.getAllPending();
      expect(all).toHaveLength(2);
      expect(all[0].issueKey).toBe("DF-1");
      expect(all[1].issueKey).toBe("DF-2");
    });
  });

  describe("persistence", () => {
    it("survives re-instantiation", () => {
      ledger.plan("DF-1", { dataSource: DS, variant: "v", triggerCommentId: "C100", commentTimestamp: TS });

      const ledger2 = new OperationLedger({ outputConfig: { logDir: tempDir, handoffDir: "" } });
      expect(ledger2.getOperations(DS, "DF-1")).toHaveLength(1);
    });

    it("handles corrupt files gracefully", () => {
      const dsDir = join(tempDir, "history", DS);
      mkdirSync(dsDir, { recursive: true });
      writeFileSync(join(dsDir, "DF-999.json"), "not json at all");

      expect(ledger.getOperations(DS, "DF-999")).toEqual([]);
      ledger.plan("DF-999", { dataSource: DS, variant: "v", triggerCommentId: "C1", commentTimestamp: TS });
      expect(ledger.getOperations(DS, "DF-999")).toHaveLength(1);
    });
  });
});
