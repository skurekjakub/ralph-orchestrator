import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OperationLedger, OperationStatus } from "../../src/services/operation-ledger.js";
import { TaskStatus } from "../../src/container/types.js";

const DS = "jira";
const TS = "2026-01-01T00:00:00Z";
const VARIANT = "v";
const VARIANT_FULL = "ralph-docs:ralph";
const KEY = "DF-1";
const CID = "C1";
const CID100 = "C100";

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
      const id = ledger.plan(KEY, {
        dataSource: DS,
        variant: VARIANT_FULL,
        triggerCommentId: CID100,
        commentTimestamp: TS,
      });

      const ops = ledger.getOperations(DS, KEY);
      expect(ops).toHaveLength(1);
      expect(ops[0].id).toBe(id);
      expect(ops[0].status).toBe(OperationStatus.Pending);
      expect(ops[0].variant).toBe(VARIANT_FULL);
      expect(ops[0].triggerCommentId).toBe(CID100);
    });

    it("returns empty for unknown issue", () => {
      expect(ledger.getOperations(DS, "NOPE-1")).toEqual([]);
    });

    it("plans multiple operations on the same issue", () => {
      ledger.plan(KEY, { dataSource: DS, variant: VARIANT_FULL, triggerCommentId: CID100, commentTimestamp: TS });
      ledger.plan(KEY, {
        dataSource: DS,
        variant: "ralph-docs:malph",
        triggerCommentId: "C101",
        commentTimestamp: "2026-01-01T01:00:00Z",
      });

      expect(ledger.getOperations(DS, KEY)).toHaveLength(2);
    });

    it("keeps operations separate across issues", () => {
      ledger.plan(KEY, { dataSource: DS, variant: VARIANT_FULL, triggerCommentId: CID100, commentTimestamp: TS });
      ledger.plan("DF-2", { dataSource: DS, variant: VARIANT_FULL, triggerCommentId: "C200", commentTimestamp: TS });

      expect(ledger.getOperations(DS, KEY)).toHaveLength(1);
      expect(ledger.getOperations(DS, "DF-2")).toHaveLength(1);
    });
  });

  describe("lifecycle transitions", () => {
    it("rejects invalid transition: completed → active", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });
      ledger.transition(DS, KEY, id, OperationStatus.Active);
      ledger.transition(DS, KEY, id, OperationStatus.Completed);

      expect(() => ledger.transition(DS, KEY, id, OperationStatus.Active)).toThrow(
        "Invalid operation state transition: completed → active",
      );
    });

    it("rejects invalid transition: pending → completed", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });

      expect(() => ledger.transition(DS, KEY, id, OperationStatus.Completed)).toThrow(
        "Invalid operation state transition: pending → completed",
      );
    });

    it("rejects invalid transition: error → pending", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });
      ledger.transition(DS, KEY, id, OperationStatus.Active);
      ledger.transition(DS, KEY, id, OperationStatus.Error);

      expect(() => ledger.transition(DS, KEY, id, OperationStatus.Pending)).toThrow(
        "Invalid operation state transition: error → pending",
      );
    });

    it("transitions pending → active → completed", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });

      ledger.transition(DS, KEY, id, OperationStatus.Active);
      expect(ledger.getActive(DS, KEY)?.id).toBe(id);

      ledger.transition(DS, KEY, id, OperationStatus.Completed, { resultStatus: TaskStatus.Completed });
      expect(ledger.getActive(DS, KEY)).toBeUndefined();
      const ops = ledger.getOperations(DS, KEY);
      expect(ops[0].status).toBe(OperationStatus.Completed);
      expect(ops[0].completedAt).toBeDefined();
      expect(ops[0].resultStatus).toBe(TaskStatus.Completed);
    });

    it("transitions pending → active → error", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });

      ledger.transition(DS, KEY, id, OperationStatus.Active);
      ledger.transition(DS, KEY, id, OperationStatus.Error, { reason: "timeout" });

      const ops = ledger.getOperations(DS, KEY);
      expect(ops[0].status).toBe(OperationStatus.Error);
      expect(ops[0].reason).toBe("timeout");
      expect(ops[0].completedAt).toBeDefined();
    });

    it("transitions pending → error when the operation fails before activation", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });

      ledger.transition(DS, KEY, id, OperationStatus.Error, { reason: "Profile v no longer exists" });

      const [op] = ledger.getOperations(DS, KEY);
      expect(op.status).toBe(OperationStatus.Error);
      expect(op.reason).toBe("Profile v no longer exists");
      expect(op.completedAt).toBeDefined();
      expect(op.resultStatus).toBeUndefined();
    });

    it("treats a pre-activation error as terminal: not pending, not recoverable, trigger still consumed", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });

      ledger.transition(DS, KEY, id, OperationStatus.Error, { reason: "Work item not found or unreachable" });

      expect(ledger.getAllPending()).toEqual([]);
      expect(ledger.hasPendingOrActive(DS, KEY)).toBe(false);
      expect(ledger.recoverActiveOperations()).toEqual([]);
      expect(ledger.isConsumed(DS, KEY, VARIANT, CID)).toBe(true);
      expect(() => ledger.transition(DS, KEY, id, OperationStatus.Active)).toThrow(
        "Invalid operation state transition: error → active",
      );
    });
  });

  describe("reject", () => {
    it("records a rejected operation", () => {
      ledger.reject(KEY, {
        dataSource: DS,
        variant: VARIANT_FULL,
        triggerCommentId: CID100,
        commentTimestamp: TS,
        reason: "Invalid state",
      });

      const ops = ledger.getOperations(DS, KEY);
      expect(ops).toHaveLength(1);
      expect(ops[0].status).toBe(OperationStatus.Rejected);
      expect(ops[0].reason).toBe("Invalid state");
      expect(ops[0].completedAt).toBeDefined();
    });
  });

  describe("dedup queries", () => {
    it("isConsumed detects consumed triggers", () => {
      ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID100, commentTimestamp: TS });

      expect(ledger.isConsumed(DS, KEY, VARIANT, CID100)).toBe(true);
      expect(ledger.isConsumed(DS, KEY, VARIANT, "C200")).toBe(false);
      expect(ledger.isConsumed(DS, KEY, "other", CID100)).toBe(false);
    });

    it("getConsumedTriggerIds returns all consumed IDs for a variant", () => {
      ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID100, commentTimestamp: TS });
      ledger.plan(KEY, {
        dataSource: DS,
        variant: VARIANT,
        triggerCommentId: "C200",
        commentTimestamp: "2026-01-01T01:00:00Z",
      });
      ledger.plan(KEY, {
        dataSource: DS,
        variant: "other",
        triggerCommentId: "C300",
        commentTimestamp: "2026-01-01T02:00:00Z",
      });

      const ids = ledger.getConsumedTriggerIds(DS, KEY, VARIANT);
      expect(ids).toEqual(new Set([CID100, "C200"]));
    });

    it("hasPendingOrActive detects planned or running work", () => {
      expect(ledger.hasPendingOrActive(DS, KEY)).toBe(false);

      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });
      expect(ledger.hasPendingOrActive(DS, KEY)).toBe(true);

      ledger.transition(DS, KEY, id, OperationStatus.Active);
      expect(ledger.hasPendingOrActive(DS, KEY)).toBe(true);

      ledger.transition(DS, KEY, id, OperationStatus.Completed);
      expect(ledger.hasPendingOrActive(DS, KEY)).toBe(false);
    });
  });

  describe("pending/active queries", () => {
    it("getPending returns pending ops sorted by comment timestamp", () => {
      ledger.plan(KEY, {
        dataSource: DS,
        variant: VARIANT,
        triggerCommentId: "C2",
        commentTimestamp: "2026-01-01T02:00:00Z",
      });
      ledger.plan(KEY, {
        dataSource: DS,
        variant: VARIANT,
        triggerCommentId: CID,
        commentTimestamp: "2026-01-01T01:00:00Z",
      });

      const pending = ledger.getPending(DS, KEY);
      expect(pending).toHaveLength(2);
      expect(pending[0].triggerCommentId).toBe(CID);
      expect(pending[1].triggerCommentId).toBe("C2");
    });

    it("getActive returns the active operation", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });
      expect(ledger.getActive(DS, KEY)).toBeUndefined();

      ledger.transition(DS, KEY, id, OperationStatus.Active);
      expect(ledger.getActive(DS, KEY)?.id).toBe(id);
    });
  });

  describe("crash recovery", () => {
    it("recovers active operations and marks them as error", () => {
      const id = ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });
      ledger.transition(DS, KEY, id, OperationStatus.Active);

      const recovered = ledger.recoverActiveOperations();
      expect(recovered).toHaveLength(1);
      expect(recovered[0].issueKey).toBe(KEY);
      expect(recovered[0].operation.status).toBe(OperationStatus.Error);

      expect(ledger.getOperations(DS, KEY)[0].status).toBe(OperationStatus.Error);
    });

    it("does not affect non-active operations", () => {
      ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });
      const id2 = ledger.plan("DF-2", {
        dataSource: DS,
        variant: VARIANT,
        triggerCommentId: "C2",
        commentTimestamp: TS,
      });
      ledger.transition(DS, "DF-2", id2, OperationStatus.Active);
      ledger.transition(DS, "DF-2", id2, OperationStatus.Completed);

      const recovered = ledger.recoverActiveOperations();
      expect(recovered).toHaveLength(0);
      expect(ledger.getOperations(DS, KEY)[0].status).toBe(OperationStatus.Pending);
    });
  });

  describe("getAllPending", () => {
    it("returns pending ops across all issues sorted by timestamp", () => {
      ledger.plan("DF-2", {
        dataSource: DS,
        variant: VARIANT,
        triggerCommentId: "C2",
        commentTimestamp: "2026-01-01T02:00:00Z",
      });
      ledger.plan(KEY, {
        dataSource: DS,
        variant: VARIANT,
        triggerCommentId: CID,
        commentTimestamp: "2026-01-01T01:00:00Z",
      });

      const all = ledger.getAllPending();
      expect(all).toHaveLength(2);
      expect(all[0].issueKey).toBe(KEY);
      expect(all[1].issueKey).toBe("DF-2");
    });
  });

  describe("persistence", () => {
    it("survives re-instantiation", () => {
      ledger.plan(KEY, { dataSource: DS, variant: VARIANT, triggerCommentId: CID100, commentTimestamp: TS });

      const ledger2 = new OperationLedger({ outputConfig: { logDir: tempDir, handoffDir: "" } });
      expect(ledger2.getOperations(DS, KEY)).toHaveLength(1);
    });

    it("handles corrupt files gracefully", () => {
      const dsDir = join(tempDir, "history", DS);
      mkdirSync(dsDir, { recursive: true });
      writeFileSync(join(dsDir, "DF-999.json"), "not json at all");

      expect(ledger.getOperations(DS, "DF-999")).toEqual([]);
      ledger.plan("DF-999", { dataSource: DS, variant: VARIANT, triggerCommentId: CID, commentTimestamp: TS });
      expect(ledger.getOperations(DS, "DF-999")).toHaveLength(1);
    });
  });
});
