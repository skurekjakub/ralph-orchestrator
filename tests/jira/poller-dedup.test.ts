import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { JiraPoller } from "../../src/jira/poller.js";
import type { JiraClient } from "../../src/jira/client.js";
import type { JiraConfig } from "../../src/config.js";
import type { JiraIssue } from "../../src/jira/types.js";
import type { Logger } from "../../src/logger.js";
import { makeIssue } from "../helpers.js";

describe("JiraPoller multi-JQL deduplication", () => {
  let mockClient: { searchIssues: ReturnType<typeof vi.fn> };
  let mockLogger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = { searchIssues: vi.fn() };
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("deduplicates issues across multiple JQL queries", async () => {
    const config: JiraConfig = {
      baseUrl: "https://api.atlassian.com/ex/jira",
      cloudId: "test-cloud-id",
      jql: ["query-1", "query-2"],
      pollIntervalMs: 1000,
    };

    // Both queries return DF-1, second also returns DF-2
    mockClient.searchIssues
      .mockResolvedValueOnce([makeIssue("DF-1")])
      .mockResolvedValueOnce([makeIssue("DF-1"), makeIssue("DF-2")]);

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      mockLogger
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockClient.searchIssues).toHaveBeenCalledTimes(2);
    expect(mockClient.searchIssues).toHaveBeenCalledWith("query-1");
    expect(mockClient.searchIssues).toHaveBeenCalledWith("query-2");

    const issues = poller.drain();
    expect(issues).toHaveLength(2);
    expect(issues.map((i: JiraIssue) => i.key)).toEqual(["DF-1", "DF-2"]);

    poller.stop();
    vi.useRealTimers();
  });

  it("handles empty results from all JQL queries", async () => {
    const config: JiraConfig = {
      baseUrl: "https://api.atlassian.com/ex/jira",
      cloudId: "test-cloud-id",
      jql: ["query-1", "query-2"],
      pollIntervalMs: 1000,
    };

    mockClient.searchIssues.mockResolvedValue([]);

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      mockLogger
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.drain()).toEqual([]);

    poller.stop();
    vi.useRealTimers();
  });
});
