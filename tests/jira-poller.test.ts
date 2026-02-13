import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JiraPoller } from "../src/jira/poller.js";
import type { JiraClient } from "../src/jira/client.js";
import type { JiraConfig } from "../src/config.js";
import type { JiraIssue } from "../src/jira/types.js";

function makeIssue(key: string): JiraIssue {
  return {
    key,
    fields: { summary: `Issue ${key}`, status: { name: "New" } },
  };
}

describe("JiraPoller", () => {
  let mockClient: { searchIssues: ReturnType<typeof vi.fn> };
  let config: JiraConfig;
  let callback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockClient = {
      searchIssues: vi.fn().mockResolvedValue([]),
    };

    config = {
      baseUrl: "https://api.atlassian.com/ex/jira",
      cloudId: "test-cloud-id",
      project: "DF",
      jql: 'project = DF',
      pollIntervalMs: 1000,
      inProgressTransitionId: "141",
    };

    callback = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately on start", async () => {
    mockClient.searchIssues.mockResolvedValue([makeIssue("DF-1")]);

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      callback
    );
    poller.start();

    // Wait for the immediate async poll
    await vi.advanceTimersByTimeAsync(0);

    expect(mockClient.searchIssues).toHaveBeenCalledWith(config.jql);
    expect(callback).toHaveBeenCalledWith([makeIssue("DF-1")]);

    poller.stop();
  });

  it("does not call back when no issues found", async () => {
    mockClient.searchIssues.mockResolvedValue([]);

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      callback
    );
    poller.start();

    await vi.advanceTimersByTimeAsync(0);

    expect(callback).not.toHaveBeenCalled();

    poller.stop();
  });

  it("polls on interval", async () => {
    mockClient.searchIssues.mockResolvedValue([]);

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      callback
    );
    poller.start();

    // Initial poll
    await vi.advanceTimersByTimeAsync(0);
    expect(mockClient.searchIssues).toHaveBeenCalledTimes(1);

    // After one interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockClient.searchIssues).toHaveBeenCalledTimes(2);

    // After another interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockClient.searchIssues).toHaveBeenCalledTimes(3);

    poller.stop();
  });

  it("stops polling after stop()", async () => {
    mockClient.searchIssues.mockResolvedValue([]);

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      callback
    );
    poller.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(mockClient.searchIssues).toHaveBeenCalledTimes(1);

    poller.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(mockClient.searchIssues).toHaveBeenCalledTimes(1);
  });

  it("handles search errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockClient.searchIssues.mockRejectedValue(new Error("network error"));

    const poller = new JiraPoller(
      mockClient as unknown as JiraClient,
      config,
      callback
    );
    poller.start();

    await vi.advanceTimersByTimeAsync(0);

    expect(callback).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    poller.stop();
  });
});
