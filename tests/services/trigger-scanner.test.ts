import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TriggerScanner } from "../../src/services/trigger-scanner.js";
import { OperationLedger, type IOperationLedger } from "../../src/services/operation-ledger.js";
import { ProfileRouter, type IProfileRouter } from "../../src/services/profile-router.js";
import { makeProfile, makeWorkItem, makeMatch, makeWorkItemComment } from "../helpers/factories.js";
import { createMockLogger, createMockConnector } from "../helpers/mocks.js";
import { makeMockIssueManager } from "./trigger-test-helpers.js";
import type { IIssueManager } from "../../src/services/issue-manager.js";
import type { Logger } from "../../src/logger.js";
import type { IDataSourceConnector } from "../../src/datasource/connector.js";

const DS = "jira";
const TS = "2026-01-01T00:00:00Z";

function makeConnectorsMap(allowedUsers: string[] = []): ReadonlyMap<string, IDataSourceConnector> {
  return new Map([[DS, createMockConnector({ getAllowedUsers: vi.fn().mockReturnValue(allowedUsers) })]]);
}

function makeScanner(
  mgr: IIssueManager,
  router: IProfileRouter,
  ledger: IOperationLedger,
  logger: Logger,
  opts?: { allowedUsers?: string[] },
) {
  const scanner = new TriggerScanner({
    issueManager: mgr,
    router,
    ledger,
    logger,
    connectors: makeConnectorsMap(opts?.allowedUsers ?? []),
  });
  scanner.cachePath = null;
  return scanner;
}

let tempDir: string;
let ledger: OperationLedger;

const silentLogger = createMockLogger();
const KEY = "DF-100";
const CID = "C1";
const PID = "ralph-docs";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "trigger-scanner-"));
  ledger = new OperationLedger({ outputConfig: { logDir: tempDir, handoffDir: "" } });
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("TriggerScanner", () => {
  it("plans operations for matching trigger comments", async () => {
    const profile = makeProfile({
      id: PID,
      match: makeMatch({ commentTrigger: "@RalphDocs" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([
      makeWorkItemComment(CID, "Regular comment"),
      makeWorkItemComment("C2", "@RalphDocs please handle this"),
    ]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(planned).toBe(1);
    expect(ledger.getAllPending()).toHaveLength(1);
    expect(ledger.getAllPending()[0].operation.variant).toBe("ralph-docs:ralph:@RalphDocs");
  });

  it("skips already-consumed trigger comments", async () => {
    const profile = makeProfile({
      id: PID,
      match: makeMatch({ commentTrigger: "@RalphDocs" }),
    });
    const variant = profile.variantKey;
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@RalphDocs handle this")]);

    ledger.plan(KEY, { dataSource: DS, variant, triggerCommentId: CID, commentTimestamp: TS });

    const scanner = makeScanner(mgr, router, ledger, silentLogger);
    const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(planned).toBe(0);
  });

  it("posts ack comment for each new trigger", async () => {
    const profile = makeProfile({
      id: PID,
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([
      makeWorkItemComment(CID, "@docs do it"),
      makeWorkItemComment("C2", "@docs again"),
    ]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(mgr.postAckComment).toHaveBeenCalledTimes(2);
    expect(mgr.postAckComment.mock.calls[0][1]).toBe(KEY);
  });

  it("passes trigger params to ack comment when present", async () => {
    const profile = makeProfile({
      id: PID,
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@docs(codesamples, branch=xyz) review")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(mgr.postAckComment).toHaveBeenCalledWith(DS, KEY, "ralph", ["codesamples", "branch=xyz"]);
  });

  it("passes empty trigger params array to ack when no params in trigger", async () => {
    const profile = makeProfile({
      id: PID,
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@docs please review")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(mgr.postAckComment).toHaveBeenCalledWith(DS, KEY, "ralph", []);
  });

  it("skips profiles that don't match the issue project", async () => {
    const profile = makeProfile({
      id: "ralph-vscode",
      match: makeMatch({ projects: ["DOC"], commentTrigger: "@vscode" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@vscode go")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(planned).toBe(0);
    expect(mgr.getComments).not.toHaveBeenCalled();
  });

  it("skips profiles that don't match the issue status", async () => {
    const profile = makeProfile({
      match: makeMatch({ statuses: ["In Progress"], commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go now")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY, "Task", "New")], [profile]);

    expect(planned).toBe(0);
  });

  it("fetches comments only once per issue across multiple profiles", async () => {
    const profile1 = makeProfile({
      id: PID,
      agentName: "writer",
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const profile2 = makeProfile({
      id: "ralph-review",
      agentName: "reviewer",
      match: makeMatch({ commentTrigger: "@review" }),
    });
    const router = new ProfileRouter({ profiles: [profile1, profile2] });
    const mgr = makeMockIssueManager([
      makeWorkItemComment(CID, "@docs please"),
      makeWorkItemComment("C2", "@review please"),
    ]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY)], [profile1, profile2]);

    expect(planned).toBe(2);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);
  });

  it("handles comment fetch failure gracefully", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager();
    mgr.getComments.mockRejectedValue(new Error("Network error"));
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(planned).toBe(0);
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  it("handles ack comment failure without aborting", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go now")]);
    mgr.postAckComment.mockRejectedValue(new Error("Post failed"));
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(planned).toBe(1);
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  it("matches trigger in plain text comment body", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@docs please handle this")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(planned).toBe(1);
  });

  it("trigger matching is case-insensitive", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@RalphDocs" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@ralphdocs please handle")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(planned).toBe(1);
  });

  it("stores trigger params from callsign in the operation", async () => {
    const profile = makeProfile({
      id: PID,
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@docs(codesamples, verbose) please review")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

    expect(planned).toBe(1);
    const ops = ledger.getOperations(DS, KEY);
    expect(ops).toHaveLength(1);
    expect(ops[0].triggerParams).toEqual(["codesamples", "verbose"]);
  });

  it("omits triggerParams when callsign has no parentheses", async () => {
    const profile = makeProfile({
      id: PID,
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@docs please review")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    await scanner.scan([makeWorkItem(KEY)], [profile]);

    const ops = ledger.getOperations(DS, KEY);
    expect(ops[0].triggerParams).toBeUndefined();
  });

  it("returns 0 for empty issue list", async () => {
    const profile = makeProfile();
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager();
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([], [profile]);

    expect(planned).toBe(0);
  });

  it("scans multiple issues in a single batch", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager();
    mgr.getComments
      .mockResolvedValueOnce([makeWorkItemComment(CID, "@go issue 1")])
      .mockResolvedValueOnce([makeWorkItemComment("C2", "@go issue 2")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const planned = await scanner.scan([makeWorkItem(KEY), makeWorkItem("DF-200")], [profile]);

    expect(planned).toBe(2);
    expect(mgr.getComments).toHaveBeenCalledTimes(2);
  });

  it("logs scan summary with stats", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go now")]);
    const logger = createMockLogger();
    const scanner = makeScanner(mgr, router, ledger, logger);

    await scanner.scan([makeWorkItem(KEY)], [profile]);

    const summaryCall = vi.mocked(logger.info).mock.calls.find((c: any[]) => c[0].startsWith("Trigger scan:"));
    expect(summaryCall).toBeDefined();
    expect(summaryCall![0]).toContain("1 issues");
    expect(summaryCall![0]).toContain("1 scanned");
    expect(summaryCall![0]).toContain("0 unchanged");
    expect(summaryCall![0]).toContain("1 planned");
    expect(summaryCall![0]).toContain("1 API calls");
  });

  it("skips issues whose updated timestamp has not changed since last scan", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "no trigger here")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const issueV1 = makeWorkItem(KEY, "Test", "New", "2026-02-15T10:00:00Z");

    // First scan — fetches comments
    await scanner.scan([issueV1], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);

    mgr.getComments.mockClear();

    // Second scan with same updated timestamp — skips comment fetch
    await scanner.scan([issueV1], [profile]);
    expect(mgr.getComments).not.toHaveBeenCalled();
  });

  it("re-scans issues whose updated timestamp changed", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "nothing relevant")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    await scanner.scan([makeWorkItem(KEY, "Test", "New", "2026-02-15T10:00:00Z")], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);

    mgr.getComments.mockClear();
    mgr.getComments.mockResolvedValue([makeWorkItemComment("C2", "@go now")]);

    // Issue updated (new comment added in JIRA)
    await scanner.scan([makeWorkItem(KEY, "Test", "New", "2026-02-15T10:05:00Z")], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);
  });

  it("always scans issues without an updated field", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "no trigger")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const issueNoUpdated = makeWorkItem(KEY);

    await scanner.scan([issueNoUpdated], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);

    mgr.getComments.mockClear();

    // Without updated field, never cached — always fetches
    await scanner.scan([issueNoUpdated], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);
  });

  it("clearCache forces re-scan of all issues", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "no trigger")]);
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const issue = makeWorkItem(KEY, "Test", "New", "2026-02-15T10:00:00Z");

    await scanner.scan([issue], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);

    mgr.getComments.mockClear();
    scanner.clearCache();

    await scanner.scan([issue], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);
  });

  it("does not cache issues that matched no profiles", async () => {
    const profile = makeProfile({
      match: makeMatch({ projects: ["DOC"], commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager();
    const scanner = makeScanner(mgr, router, ledger, silentLogger);

    const issue = makeWorkItem(KEY, "Test", "New", "2026-02-15T10:00:00Z");

    // Issue project DF doesn't match profile project DOC — no comments fetched
    await scanner.scan([issue], [profile]);
    expect(mgr.getComments).not.toHaveBeenCalled();

    // If later a profile is added for DF, the issue must be scanned
    const profile2 = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router2 = new ProfileRouter({ profiles: [profile2] });
    const mgr2 = makeMockIssueManager([makeWorkItemComment(CID, "@go")]);
    const scanner2 = makeScanner(mgr2, router2, ledger, silentLogger);

    const planned = await scanner2.scan([issue], [profile2]);
    expect(planned).toBe(1);
  });

  describe("allowedUsers filtering", () => {
    it("rejects triggers from users not in allowedUsers and records in ledger", async () => {
      const profile = makeProfile({
        match: makeMatch({ commentTrigger: "@go" }),
      });
      const router = new ProfileRouter({ profiles: [profile] });
      const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go please", TS, "blocked-user")]);
      const scanner = makeScanner(mgr, router, ledger, silentLogger, { allowedUsers: ["allowed-user"] });

      const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

      expect(planned).toBe(0);
      expect(ledger.getAllPending()).toHaveLength(0);

      const ops = ledger.getOperations(DS, KEY);
      expect(ops).toHaveLength(1);
      expect(ops[0].status).toBe("rejected");
      expect(ops[0].reason).toContain("blocked-user");
      expect(ops[0].reason).toContain("not in allowedUsers");
    });

    it("posts a rejection comment on JIRA for unauthorized users", async () => {
      const profile = makeProfile({
        match: makeMatch({ commentTrigger: "@go" }),
      });
      const router = new ProfileRouter({ profiles: [profile] });
      const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go please", TS, "blocked-user")]);
      const scanner = makeScanner(mgr, router, ledger, silentLogger, { allowedUsers: ["allowed-user"] });

      await scanner.scan([makeWorkItem(KEY)], [profile]);

      expect(mgr.postComment).toHaveBeenCalledTimes(1);
      expect(mgr.postComment.mock.calls[0][0]).toBe(DS);
      expect(mgr.postComment.mock.calls[0][1]).toBe(KEY);
      expect(mgr.postComment.mock.calls[0][2]).toContain("not authorized");
      expect(mgr.postComment.mock.calls[0][2]).toContain("Test User");
    });

    it("does not re-reject already-consumed trigger comments", async () => {
      const profile = makeProfile({
        match: makeMatch({ commentTrigger: "@go" }),
      });
      const router = new ProfileRouter({ profiles: [profile] });
      const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go please", TS, "blocked-user")]);
      const scanner = makeScanner(mgr, router, ledger, silentLogger, { allowedUsers: ["allowed-user"] });

      await scanner.scan([makeWorkItem(KEY)], [profile]);
      expect(ledger.getOperations(DS, KEY)).toHaveLength(1);

      mgr.postComment.mockClear();

      // Second scan — comment C1 is already consumed (rejected), should not re-reject
      await scanner.scan([makeWorkItem(KEY, "Test", "New", "2026-02-01T00:00:00Z")], [profile]);
      expect(ledger.getOperations(DS, KEY)).toHaveLength(1);
      expect(mgr.postComment).not.toHaveBeenCalled();
    });

    it("allows triggers from whitelisted users", async () => {
      const profile = makeProfile({
        match: makeMatch({ commentTrigger: "@go" }),
      });
      const router = new ProfileRouter({ profiles: [profile] });
      const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go please", TS, "allowed-user")]);
      const scanner = makeScanner(mgr, router, ledger, silentLogger, { allowedUsers: ["allowed-user"] });

      const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

      expect(planned).toBe(1);
    });

    it("allows all users when allowedUsers is empty", async () => {
      const profile = makeProfile({
        match: makeMatch({ commentTrigger: "@go" }),
      });
      const router = new ProfileRouter({ profiles: [profile] });
      const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go please", TS, "any-random-user")]);
      const scanner = makeScanner(mgr, router, ledger, silentLogger, { allowedUsers: [] });

      const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

      expect(planned).toBe(1);
    });

    it("supports multiple allowed users", async () => {
      const profile = makeProfile({
        match: makeMatch({ commentTrigger: "@go" }),
      });
      const router = new ProfileRouter({ profiles: [profile] });
      const mgr = makeMockIssueManager([
        makeWorkItemComment(CID, "@go first", TS, "user-a"),
        makeWorkItemComment("C2", "@go second", "2026-01-01T01:00:00Z", "user-b"),
        makeWorkItemComment("C3", "@go third", "2026-01-01T02:00:00Z", "user-c"),
      ]);
      const scanner = makeScanner(mgr, router, ledger, silentLogger, { allowedUsers: ["user-a", "user-c"] });

      const planned = await scanner.scan([makeWorkItem(KEY)], [profile]);

      expect(planned).toBe(2);
      // user-b should be rejected
      const rejected = ledger.getOperations(DS, KEY).filter((op) => op.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toContain("user-b");
    });
  });
});
