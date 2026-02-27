import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OperationLedger, OperationStatus } from "../../src/services/operation-ledger.js";
import { TaskStatus } from "../../src/container/types.js";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { extractAdfText } from "../../src/jira/adf-converter.js";
import { makeProfile, makeWorkItem, makeMatch, makeWorkItemComment } from "../helpers/factories.js";

const DS = "jira";
const TS = "2026-01-01T00:00:00Z";
const VARIANT = "ralph-docs:ralph";
const KEY = "DF-1";
const CID = "C1";
let tempDir: string;
let ledger: OperationLedger;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "comment-flow-"));
  ledger = new OperationLedger({ outputConfig: { logDir: tempDir, handoffDir: "" } });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});


describe("Comment-driven orchestration flow", () => {
  describe("trigger discovery", () => {
    it("discovers unconsumed trigger comments", () => {
      const profile = makeProfile({
        id: "ralph-docs",
        match: makeMatch({ statuses: ["New"], commentTrigger: "@RalphDocs" }),
      });
      const variant = profile.variantKey;

      const comments = [
        makeWorkItemComment(CID, "Regular comment", "2026-01-01T00:00:00Z"),
        makeWorkItemComment("C2", "@RalphDocs please handle this", "2026-01-01T01:00:00Z"),
        makeWorkItemComment("C3", "Another regular comment", "2026-01-01T02:00:00Z"),
      ];

      const trigger = profile.match.commentTrigger!;
      const consumedIds = ledger.getConsumedTriggerIds(DS, KEY, variant);

      const unconsumed = comments.filter((c) => {
        if (consumedIds.has(c.id)) return false;
        const text = typeof c.body === "string" ? c.body : extractAdfText(c.body);
        return text.toLowerCase().includes(trigger.toLowerCase());
      });

      expect(unconsumed).toHaveLength(1);
      expect(unconsumed[0].id).toBe("C2");
    });

    it("marks consumed triggers as consumed", () => {
      const variant = VARIANT;

      ledger.plan(KEY, {
        dataSource: DS,
        variant,
        triggerCommentId: "C2",
        commentTimestamp: "2026-01-01T01:00:00Z",
      });

      expect(ledger.isConsumed(DS, KEY, variant, "C2")).toBe(true);
      expect(ledger.isConsumed(DS, KEY, variant, "C3")).toBe(false);
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

      ledger.plan(KEY, { dataSource: DS, variant: ralphVariant, triggerCommentId: CID, commentTimestamp: TS });
      ledger.plan(KEY, { dataSource: DS, variant: malphVariant, triggerCommentId: CID, commentTimestamp: TS });

      expect(ledger.isConsumed(DS, KEY, ralphVariant, CID)).toBe(true);
      expect(ledger.isConsumed(DS, KEY, malphVariant, CID)).toBe(true);
      expect(ledger.getOperations(DS, KEY)).toHaveLength(2);
    });
  });

  describe("status validation before execution", () => {
    it("matchesProjectAndStatus validates before execution", () => {
      const profile = makeProfile({
        match: makeMatch({ statuses: ["New"], commentTrigger: "@ralph" }),
      });
      const router = new ProfileRouter({ profiles: [profile] });

      const validIssue = makeWorkItem(KEY, "task", "New");
      expect(router.matchesProjectAndStatus(validIssue, profile)).toBe(true);

      const staleIssue = makeWorkItem(KEY, "task", "In Progress");
      expect(router.matchesProjectAndStatus(staleIssue, profile)).toBe(false);
    });
  });

  describe("lifecycle: plan → active → complete", () => {
    it("full lifecycle creates proper audit trail", () => {
      const variant = VARIANT;

      const opId = ledger.plan(KEY, {
        dataSource: DS,
        variant,
        triggerCommentId: "C100",
        commentTimestamp: TS,
      });

      expect(ledger.getPending(DS, KEY)).toHaveLength(1);
      expect(ledger.getActive(DS, KEY)).toBeUndefined();

      ledger.transition(DS, KEY, opId, OperationStatus.Active);
      expect(ledger.getPending(DS, KEY)).toHaveLength(0);
      expect(ledger.getActive(DS, KEY)?.id).toBe(opId);

      ledger.transition(DS, KEY, opId, OperationStatus.Completed, { resultStatus: TaskStatus.Completed });
      expect(ledger.getPending(DS, KEY)).toHaveLength(0);
      expect(ledger.getActive(DS, KEY)).toBeUndefined();

      const ops = ledger.getOperations(DS, KEY);
      expect(ops).toHaveLength(1);
      expect(ops[0].status).toBe(OperationStatus.Completed);
      expect(ops[0].resultStatus).toBe(TaskStatus.Completed);
      expect(ops[0].completedAt).toBeDefined();
    });

    it("rejected operations consume the trigger", () => {
      const variant = VARIANT;

      ledger.reject(KEY, {
        dataSource: DS,
        variant,
        triggerCommentId: "C100",
        commentTimestamp: TS,
        reason: "Status changed",
      });

      expect(ledger.isConsumed(DS, KEY, variant, "C100")).toBe(true);
      expect(ledger.getPending(DS, KEY)).toHaveLength(0);
    });
  });

  describe("crash recovery", () => {
    it("active operations from previous session are marked as errors", () => {
      const opId = ledger.plan(KEY, {
        dataSource: DS,
        variant: VARIANT,
        triggerCommentId: CID,
        commentTimestamp: TS,
      });
      ledger.transition(DS, KEY, opId, OperationStatus.Active);

      const newLedger = new OperationLedger({ outputConfig: { logDir: tempDir, handoffDir: "" } });
      const recovered = newLedger.recoverActiveOperations();

      expect(recovered).toHaveLength(1);
      expect(recovered[0].issueKey).toBe(KEY);
      expect(newLedger.getOperations(DS, KEY)[0].status).toBe(OperationStatus.Error);
    });

    it("pending operations survive restart", () => {
      ledger.plan(KEY, {
        dataSource: DS,
        variant: VARIANT,
        triggerCommentId: CID,
        commentTimestamp: TS,
      });

      const newLedger = new OperationLedger({ outputConfig: { logDir: tempDir, handoffDir: "" } });
      const pending = newLedger.getAllPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].issueKey).toBe(KEY);
    });
  });

  describe("duplicate trigger suppression", () => {
    it("same trigger comment on same variant is only planned once", () => {
      const variant = VARIANT;

      ledger.plan(KEY, { dataSource: DS, variant, triggerCommentId: CID, commentTimestamp: TS });

      expect(ledger.isConsumed(DS, KEY, variant, CID)).toBe(true);
    });

    it("new trigger comment after completion triggers new operation", () => {
      const variant = VARIANT;

      const opId = ledger.plan(KEY, { dataSource: DS, variant, triggerCommentId: CID, commentTimestamp: TS });
      ledger.transition(DS, KEY, opId, OperationStatus.Active);
      ledger.transition(DS, KEY, opId, OperationStatus.Completed, { resultStatus: TaskStatus.Completed });

      expect(ledger.isConsumed(DS, KEY, variant, CID)).toBe(true);
      expect(ledger.isConsumed(DS, KEY, variant, "C2")).toBe(false);

      ledger.plan(KEY, { dataSource: DS, variant, triggerCommentId: "C2", commentTimestamp: "2026-01-01T02:00:00Z" });
      expect(ledger.isConsumed(DS, KEY, variant, "C2")).toBe(true);
      expect(ledger.getOperations(DS, KEY)).toHaveLength(2);
    });
  });
});
