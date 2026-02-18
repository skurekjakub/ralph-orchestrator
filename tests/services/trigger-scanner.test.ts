import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TriggerScanner } from "../../src/services/trigger-scanner.js";
import { OperationLedger } from "../../src/services/operation-ledger.js";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { makeProfile, makeIssue, makeMatch, makeComment, createMockLogger, createMockJiraClient } from "../helpers.js";
import type { JiraComment } from "../../src/jira/types.js";

let tempDir: string;
let ledger: OperationLedger;

const silentLogger = createMockLogger();

function makeJiraClient(comments: JiraComment[] = []) {
  return createMockJiraClient({
    getComments: vi.fn().mockResolvedValue(comments),
  });
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "trigger-scanner-"));
  ledger = new OperationLedger(tempDir);
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("TriggerScanner", () => {
  it("plans operations for matching trigger comments", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      match: makeMatch({ commentTrigger: "@RalphDocs" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      makeComment("C1", "Regular comment"),
      makeComment("C2", "@RalphDocs please handle this"),
    ]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([makeIssue("DF-100")], [profile]);

    expect(planned).toBe(1);
    expect(ledger.getAllPending()).toHaveLength(1);
    expect(ledger.getAllPending()[0].operation.variant).toBe("ralph-docs:ralph:@RalphDocs");
  });

  it("skips already-consumed trigger comments", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      match: makeMatch({ commentTrigger: "@RalphDocs" }),
    });
    const variant = profile.variantKey;
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      makeComment("C1", "@RalphDocs handle this"),
    ]);

    ledger.plan("DF-100", { variant, triggerCommentId: "C1", commentTimestamp: "2026-01-01T00:00:00Z" });

    const scanner = new TriggerScanner(client, router, ledger, silentLogger);
    const planned = await scanner.scan([makeIssue("DF-100")], [profile]);

    expect(planned).toBe(0);
  });

  it("posts ack comment for each new trigger", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      makeComment("C1", "@docs do it"),
      makeComment("C2", "@docs again"),
    ]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    await scanner.scan([makeIssue("DF-100")], [profile]);

    expect(client.addComment).toHaveBeenCalledTimes(2);
    expect(client.addComment.mock.calls[0][0]).toBe("DF-100");
  });

  it("skips profiles that don't match the issue project", async () => {
    const profile = makeProfile({
      id: "ralph-vscode",
      match: makeMatch({ projects: ["DOC"], commentTrigger: "@vscode" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([makeComment("C1", "@vscode go")]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([makeIssue("DF-100")], [profile]);

    expect(planned).toBe(0);
    expect(client.getComments).not.toHaveBeenCalled();
  });

  it("skips profiles that don't match the issue status", async () => {
    const profile = makeProfile({
      match: makeMatch({ statuses: ["In Progress"], commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([makeComment("C1", "@go now")]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([makeIssue("DF-100", "Task", "New")], [profile]);

    expect(planned).toBe(0);
  });

  it("fetches comments only once per issue across multiple profiles", async () => {
    const profile1 = makeProfile({
      id: "ralph-docs",
      agentName: "writer",
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const profile2 = makeProfile({
      id: "ralph-review",
      agentName: "reviewer",
      match: makeMatch({ commentTrigger: "@review" }),
    });
    const router = new ProfileRouter([profile1, profile2]);
    const client = makeJiraClient([
      makeComment("C1", "@docs please"),
      makeComment("C2", "@review please"),
    ]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([makeIssue("DF-100")], [profile1, profile2]);

    expect(planned).toBe(2);
    expect(client.getComments).toHaveBeenCalledTimes(1);
  });

  it("handles comment fetch failure gracefully", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient();
    client.getComments.mockRejectedValue(new Error("Network error"));
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([makeIssue("DF-100")], [profile]);

    expect(planned).toBe(0);
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  it("handles ack comment failure without aborting", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([makeComment("C1", "@go now")]);
    client.addComment.mockRejectedValue(new Error("Post failed"));
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([makeIssue("DF-100")], [profile]);

    expect(planned).toBe(1);
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  it("handles ADF comment bodies", async () => {
    const adfBody = {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "@docs please handle this" },
          ],
        },
      ],
    };
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@docs" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      { id: "C1", author: { displayName: "User" }, body: adfBody, created: "2026-01-01T00:00:00Z" } as any,
    ]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([makeIssue("DF-100")], [profile]);

    expect(planned).toBe(1);
  });

  it("trigger matching is case-insensitive", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@RalphDocs" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      makeComment("C1", "@ralphdocs please handle"),
    ]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([makeIssue("DF-100")], [profile]);

    expect(planned).toBe(1);
  });

  it("returns 0 for empty issue list", async () => {
    const profile = makeProfile();
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient();
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan([], [profile]);

    expect(planned).toBe(0);
  });

  it("scans multiple issues in a single batch", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient();
    client.getComments
      .mockResolvedValueOnce([makeComment("C1", "@go issue 1")])
      .mockResolvedValueOnce([makeComment("C2", "@go issue 2")]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const planned = await scanner.scan(
      [makeIssue("DF-100"), makeIssue("DF-200")],
      [profile],
    );

    expect(planned).toBe(2);
    expect(client.getComments).toHaveBeenCalledTimes(2);
  });

  it("logs scan summary with stats", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      makeComment("C1", "@go now"),
    ]);
    const logger = createMockLogger();
    const scanner = new TriggerScanner(client, router, ledger, logger);

    await scanner.scan([makeIssue("DF-100")], [profile]);

    const summaryCall = (logger.info as any).mock.calls.find((c: any[]) =>
      c[0].startsWith("Trigger scan:")
    );
    expect(summaryCall).toBeDefined();
    expect(summaryCall[0]).toContain("1 issues");
    expect(summaryCall[0]).toContain("1 scanned");
    expect(summaryCall[0]).toContain("0 unchanged");
    expect(summaryCall[0]).toContain("1 planned");
    expect(summaryCall[0]).toContain("1 API calls");
  });

  it("skips issues whose updated timestamp has not changed since last scan", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      makeComment("C1", "no trigger here"),
    ]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const issueV1 = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");

    // First scan — fetches comments
    await scanner.scan([issueV1], [profile]);
    expect(client.getComments).toHaveBeenCalledTimes(1);

    client.getComments.mockClear();

    // Second scan with same updated timestamp — skips comment fetch
    await scanner.scan([issueV1], [profile]);
    expect(client.getComments).not.toHaveBeenCalled();
  });

  it("re-scans issues whose updated timestamp changed", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      makeComment("C1", "nothing relevant"),
    ]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    await scanner.scan(
      [makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z")],
      [profile],
    );
    expect(client.getComments).toHaveBeenCalledTimes(1);

    client.getComments.mockClear();
    client.getComments.mockResolvedValue([makeComment("C2", "@go now")]);

    // Issue updated (new comment added in JIRA)
    await scanner.scan(
      [makeIssue("DF-100", "Test", "New", "2026-02-15T10:05:00Z")],
      [profile],
    );
    expect(client.getComments).toHaveBeenCalledTimes(1);
  });

  it("always scans issues without an updated field", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([
      makeComment("C1", "no trigger"),
    ]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const issueNoUpdated = makeIssue("DF-100");

    await scanner.scan([issueNoUpdated], [profile]);
    expect(client.getComments).toHaveBeenCalledTimes(1);

    client.getComments.mockClear();

    // Without updated field, never cached — always fetches
    await scanner.scan([issueNoUpdated], [profile]);
    expect(client.getComments).toHaveBeenCalledTimes(1);
  });

  it("clearCache forces re-scan of all issues", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([makeComment("C1", "no trigger")]);
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");

    await scanner.scan([issue], [profile]);
    expect(client.getComments).toHaveBeenCalledTimes(1);

    client.getComments.mockClear();
    scanner.clearCache();

    await scanner.scan([issue], [profile]);
    expect(client.getComments).toHaveBeenCalledTimes(1);
  });

  it("does not cache issues that matched no profiles", async () => {
    const profile = makeProfile({
      match: makeMatch({ projects: ["DOC"], commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient();
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);

    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");

    // Issue project DF doesn't match profile project DOC — no comments fetched
    await scanner.scan([issue], [profile]);
    expect(client.getComments).not.toHaveBeenCalled();

    // If later a profile is added for DF, the issue must be scanned
    const profile2 = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router2 = new ProfileRouter([profile2]);
    const client2 = makeJiraClient([makeComment("C1", "@go")]);
    const scanner2 = new TriggerScanner(client2, router2, ledger, silentLogger);

    const planned = await scanner2.scan([issue], [profile2]);
    expect(planned).toBe(1);
  });
});

describe("TriggerScanner cache persistence", () => {
  it("persists cache to disk and restores on new instance", async () => {
    const cachePath = join(tempDir, "trigger-cache.json");
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([makeComment("C1", "@go")]);

    const scanner1 = new TriggerScanner(client, router, ledger, silentLogger, cachePath);
    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");
    await scanner1.scan([issue], [profile]);

    expect(client.getComments).toHaveBeenCalledTimes(1);

    // Create a new scanner instance loading from the same cache file
    const client2 = makeJiraClient([makeComment("C1", "@go")]);
    const scanner2 = new TriggerScanner(client2, router, ledger, silentLogger, cachePath);

    // Same issue, same updated timestamp — should be skipped
    await scanner2.scan([issue], [profile]);
    expect(client2.getComments).not.toHaveBeenCalled();
  });

  it("re-scans issues when updated timestamp changes after cache restore", async () => {
    const cachePath = join(tempDir, "trigger-cache.json");
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([makeComment("C1", "@go")]);

    const scanner1 = new TriggerScanner(client, router, ledger, silentLogger, cachePath);
    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");
    await scanner1.scan([issue], [profile]);

    // New instance, but issue has a newer updated timestamp
    const client2 = makeJiraClient([makeComment("C1", "@go")]);
    const scanner2 = new TriggerScanner(client2, router, ledger, silentLogger, cachePath);

    const updatedIssue = makeIssue("DF-100", "Test", "New", "2026-02-15T11:00:00Z");
    await scanner2.scan([updatedIssue], [profile]);

    expect(client2.getComments).toHaveBeenCalledTimes(1);
  });

  it("works without cache path (in-memory only)", async () => {
    const profile = makeProfile({
      match: makeMatch({ commentTrigger: "@go" }),
    });
    const router = new ProfileRouter([profile]);
    const client = makeJiraClient([makeComment("C1", "@go")]);

    // No cachePath — should not throw, works in-memory only
    const scanner = new TriggerScanner(client, router, ledger, silentLogger);
    const issue = makeIssue("DF-100", "Test", "New", "2026-02-15T10:00:00Z");
    await scanner.scan([issue], [profile]);
    expect(client.getComments).toHaveBeenCalledTimes(1);
  });
});
