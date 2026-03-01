import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TriggerScanner } from "../../src/services/trigger-scanner.js";
import { OperationLedger, type IOperationLedger } from "../../src/services/operation-ledger.js";
import { ProfileRouter, type IProfileRouter } from "../../src/services/profile-router.js";
import { makeProfile, makeWorkItem, makeMatch, makeWorkItemComment } from "../helpers/factories.js";
import { createMockLogger, createMockConnector } from "../helpers/mocks.js";
import { makeMockIssueManager } from "./trigger-test-helpers.js";
import type { IDataSourceConnector } from "../../src/datasource/connector.js";
import type { IIssueManager } from "../../src/services/issue-manager.js";
import type { Logger } from "../../src/logger.js";

function makeCacheScanner(
  mgr: IIssueManager,
  router: IProfileRouter,
  ledger: IOperationLedger,
  logger: Logger,
  cachePath: string | null = null,
) {
  const scanner = new TriggerScanner({
    issueManager: mgr,
    router,
    ledger,
    logger,
    connectors: new Map<string, IDataSourceConnector>([["jira", createMockConnector({ sourceKey: "jira" })]]),
  });
  scanner.cachePath = cachePath;
  return scanner;
}

let tempDir: string;
let ledger: OperationLedger;

const silentLogger = createMockLogger();
const KEY = "DF-100";
const CID = "C1";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "trigger-cache-"));
  ledger = new OperationLedger({ outputConfig: { logDir: tempDir, handoffDir: "" } });
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("TriggerScanner cache persistence", () => {
  it("persists cache to disk and restores on new instance", async () => {
    const cachePath = join(tempDir, "trigger-cache.json");
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go")]);

    const scanner1 = makeCacheScanner(mgr, router, ledger, silentLogger, cachePath);
    const issue = makeWorkItem(KEY, "Test", "New", "2026-02-15T10:00:00Z");
    await scanner1.scan([issue], [profile]);

    expect(mgr.getComments).toHaveBeenCalledTimes(1);

    // Create a new scanner instance loading from the same cache file
    const mgr2 = makeMockIssueManager([makeWorkItemComment(CID, "@go")]);
    const scanner2 = makeCacheScanner(mgr2, router, ledger, silentLogger, cachePath);

    // Same issue, same updated timestamp — should be skipped
    await scanner2.scan([issue], [profile]);
    expect(mgr2.getComments).not.toHaveBeenCalled();
  });

  it("re-scans issues when updated timestamp changes after cache restore", async () => {
    const cachePath = join(tempDir, "trigger-cache.json");
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go")]);

    const scanner1 = makeCacheScanner(mgr, router, ledger, silentLogger, cachePath);
    const issue = makeWorkItem(KEY, "Test", "New", "2026-02-15T10:00:00Z");
    await scanner1.scan([issue], [profile]);

    // New instance, but issue has a newer updated timestamp
    const mgr2 = makeMockIssueManager([makeWorkItemComment(CID, "@go")]);
    const scanner2 = makeCacheScanner(mgr2, router, ledger, silentLogger, cachePath);

    const updatedIssue = makeWorkItem(KEY, "Test", "New", "2026-02-15T11:00:00Z");
    await scanner2.scan([updatedIssue], [profile]);

    expect(mgr2.getComments).toHaveBeenCalledTimes(1);
  });

  it("works without cache path (in-memory only)", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "@go")]);

    // No cachePath — should not throw, works in-memory only
    const scanner = makeCacheScanner(mgr, router, ledger, silentLogger);
    const issue = makeWorkItem(KEY, "Test", "New", "2026-02-15T10:00:00Z");
    await scanner.scan([issue], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);
  });

  it("uses atomic write (temp file + rename) for cache persistence", async () => {
    const cachePath = join(tempDir, "trigger-cache.json");
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter({ profiles: [profile] });
    const mgr = makeMockIssueManager([makeWorkItemComment(CID, "no trigger")]);

    const scanner = makeCacheScanner(mgr, router, ledger, silentLogger, cachePath);
    const issue = makeWorkItem(KEY, "Test", "New", "2026-02-15T10:00:00Z");
    await scanner.scan([issue], [profile]);

    // Cache file should exist and be valid JSON
    expect(existsSync(cachePath)).toBe(true);
    const data = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(data[KEY]).toBe("2026-02-15T10:00:00Z");

    // Temp file should NOT linger after successful write
    expect(existsSync(`${cachePath}.tmp`)).toBe(false);
  });
});
