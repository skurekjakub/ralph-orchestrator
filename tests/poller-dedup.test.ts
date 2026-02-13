import { describe, it, expect, vi, beforeEach } from "vitest";
import { JiraPoller } from "../src/jira/poller.js";
import type { JiraClient } from "../src/jira/client.js";
import type { JiraConfig } from "../src/config.js";
import type { JiraIssue } from "../src/jira/types.js";
import type { Logger } from "../src/logger.js";

function makeIssue(key: string): JiraIssue {
  return {
    key,
    fields: { summary: `Issue ${key}`, status: { name: "New" } },
  };
}

describe("JiraPoller multi-JQL deduplication", () => {
  let mockClient: { searchIssues: ReturnType<typeof vi.fn> };
  let callback: ReturnType<typeof vi.fn>;
  let mockLogger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = { searchIssues: vi.fn() };
    callback = vi.fn();
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  function afterAll(fn: () => void) {
    // vitest afterAll is available globally
  }

  it("deduplicates issues across multiple JQL queries", async () => {
    const config: JiraConfig = {
      baseUrl: "https://api.atlassian.com/ex/jira",
      cloudId: "test-cloud-id",
      project: "DF",
      jql: ["query-1", "query-2"],
      pollIntervalMs: 1000,
      inProgressTransitionId: "141",
      readyForReviewTransitionId: "91",
    };

    // Both queries return DF-1, second also returns DF-2
    mockClient.searchIssues
      .mockResolvedValueOnce([makeIssue("DF-1")])
      .mockResolvedValueOnce([makeIssue("DF-1"), makeIssue("DF-2")]);

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      callback,
      mockLogger
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockClient.searchIssues).toHaveBeenCalledTimes(2);
    expect(mockClient.searchIssues).toHaveBeenCalledWith("query-1");
    expect(mockClient.searchIssues).toHaveBeenCalledWith("query-2");

    // Should get 2 unique issues, not 3
    expect(callback).toHaveBeenCalledOnce();
    const issues = callback.mock.calls[0][0] as JiraIssue[];
    expect(issues).toHaveLength(2);
    expect(issues.map((i: JiraIssue) => i.key)).toEqual(["DF-1", "DF-2"]);

    poller.stop();
    vi.useRealTimers();
  });

  it("handles empty results from all JQL queries", async () => {
    const config: JiraConfig = {
      baseUrl: "https://api.atlassian.com/ex/jira",
      cloudId: "test-cloud-id",
      project: "DF",
      jql: ["query-1", "query-2"],
      pollIntervalMs: 1000,
      inProgressTransitionId: "141",
      readyForReviewTransitionId: "91",
    };

    mockClient.searchIssues.mockResolvedValue([]);

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      callback,
      mockLogger
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(callback).not.toHaveBeenCalled();

    poller.stop();
    vi.useRealTimers();
  });
});
