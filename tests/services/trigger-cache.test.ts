import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TriggerScanner } from "../../src/services/trigger-scanner.js";
import { OperationLedger } from "../../src/services/operation-ledger.js";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { makeProfile, makeIssue, makeMatch, makeComment } from "../helpers/factories.js";
import { createMockLogger } from "../helpers/mocks.js";
import { makeMockIssueManager } from "./trigger-test-helpers.js";

let tempDir: string;
let ledger: OperationLedger;

const silentLogger = createMockLogger();

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "trigger-cache-"));
  ledger = new OperationLedger(tempDir);
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
    const router = new ProfileRouter([profile]);
    const mgr = makeMockIssueManager([makeComment("C1", "@go")]);

    const scanner1 = new TriggerScanner(mgr, router, ledger, silentLogger, cachePath);
    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");
    await scanner1.scan([issue], [profile]);

    expect(mgr.getComments).toHaveBeenCalledTimes(1);

    // Create a new scanner instance loading from the same cache file
    const mgr2 = makeMockIssueManager([makeComment("C1", "@go")]);
    const scanner2 = new TriggerScanner(mgr2, router, ledger, silentLogger, cachePath);

    // Same issue, same updated timestamp — should be skipped
    await scanner2.scan([issue], [profile]);
    expect(mgr2.getComments).not.toHaveBeenCalled();
  });

  it("re-scans issues when updated timestamp changes after cache restore", async () => {
    const cachePath = join(tempDir, "trigger-cache.json");
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const mgr = makeMockIssueManager([makeComment("C1", "@go")]);

    const scanner1 = new TriggerScanner(mgr, router, ledger, silentLogger, cachePath);
    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");
    await scanner1.scan([issue], [profile]);

    // New instance, but issue has a newer updated timestamp
    const mgr2 = makeMockIssueManager([makeComment("C1", "@go")]);
    const scanner2 = new TriggerScanner(mgr2, router, ledger, silentLogger, cachePath);

    const updatedIssue = makeIssue("DF-100", "Test", "New", "2026-02-15T11:00:00Z");
    await scanner2.scan([updatedIssue], [profile]);

    expect(mgr2.getComments).toHaveBeenCalledTimes(1);
  });

  it("works without cache path (in-memory only)", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const mgr = makeMockIssueManager([makeComment("C1", "@go")]);

    // No cachePath — should not throw, works in-memory only
    const scanner = new TriggerScanner(mgr, router, ledger, silentLogger);
    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");
    await scanner.scan([issue], [profile]);
    expect(mgr.getComments).toHaveBeenCalledTimes(1);
  });

  it("uses atomic write (temp file + rename) for cache persistence", async () => {
    const cachePath = join(tempDir, "trigger-cache.json");
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const mgr = makeMockIssueManager([makeComment("C1", "no trigger")]);

    const scanner = new TriggerScanner(mgr, router, ledger, silentLogger, cachePath);
    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");
    await scanner.scan([issue], [profile]);

    // Cache file should exist and be valid JSON
    expect(existsSync(cachePath)).toBe(true);
    const data = JSON.parse(readFileSync(cachePath, "utf-8"));
    expect(data["DF-100"]).toBe("2026-02-15T10:00:00Z");

    // Temp file should NOT linger after successful write
    expect(existsSync(`${cachePath}.tmp`)).toBe(false);
  });
});
