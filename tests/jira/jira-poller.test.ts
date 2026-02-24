import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JiraPoller } from "../../src/jira/poller.js";
import type { IJiraConfig } from "../../src/config.js";
import { makeIssue, makeJiraConfig } from "../helpers/factories.js";
import { createMockJiraClient } from "../helpers/mocks.js";

function makePoller(client: ReturnType<typeof createMockJiraClient>, jira: IJiraConfig) {
  return new JiraPoller({ jiraClient: client, jiraConfig: jira });
}

describe("JiraPoller", () => {
  let mockClient: ReturnType<typeof createMockJiraClient>;
  let config: IJiraConfig;

  beforeEach(() => {
    vi.useFakeTimers();

    mockClient = createMockJiraClient();

    config = makeJiraConfig({ pollIntervalMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately on start", async () => {
    mockClient.searchIssues.mockResolvedValue([makeIssue("DF-1")]);

    const poller = makePoller(mockClient, config);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockClient.searchIssues).toHaveBeenCalledWith(config.jql[0]);
    expect(poller.drain()).toEqual([makeIssue("DF-1")]);

    poller.stop();
  });

  it("buffer is empty when no issues found", async () => {
    mockClient.searchIssues.mockResolvedValue([]);

    const poller = makePoller(mockClient, config);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.drain()).toEqual([]);

    poller.stop();
  });

  it("polls on interval", async () => {
    mockClient.searchIssues.mockResolvedValue([]);

    const poller = makePoller(mockClient, config);
    poller.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(mockClient.searchIssues).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockClient.searchIssues).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockClient.searchIssues).toHaveBeenCalledTimes(3);

    poller.stop();
  });

  it("stops polling after stop()", async () => {
    mockClient.searchIssues.mockResolvedValue([]);

    const poller = makePoller(mockClient, config);
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

    const poller = makePoller(mockClient, config);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.drain()).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    poller.stop();
  });

  it("sorts issues by creation date across multiple JQL queries", async () => {
    const newer = makeIssue("DOC-1", "Newer", "New", undefined, { created: "2026-02-01T00:00:00.000+0000" });
    const older = makeIssue("DF-5", "Older", "New", undefined, { created: "2025-06-15T00:00:00.000+0000" });

    const multiJqlConfig = makeJiraConfig({ pollIntervalMs: 1000, jql: ["query1", "query2"] });
    mockClient.searchIssues
      .mockResolvedValueOnce([newer])
      .mockResolvedValueOnce([older]);

    const poller = makePoller(mockClient, multiJqlConfig);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.drain()).toEqual([older, newer]);

    poller.stop();
  });

  it("drain clears the buffer", async () => {
    mockClient.searchIssues.mockResolvedValue([makeIssue("DF-1")]);

    const poller = makePoller(mockClient, config);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.drain()).toHaveLength(1);
    expect(poller.drain()).toHaveLength(0);

    poller.stop();
  });

  it("accumulates issues across multiple poll cycles", async () => {
    mockClient.searchIssues
      .mockResolvedValueOnce([makeIssue("DF-1")])
      .mockResolvedValueOnce([makeIssue("DF-2")]);

    const poller = makePoller(mockClient, config);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    const drained = poller.drain();
    expect(drained).toHaveLength(2);
    expect(drained[0].key).toBe("DF-1");
    expect(drained[1].key).toBe("DF-2");

    poller.stop();
  });
});
