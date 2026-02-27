import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JiraWorkItemPoller } from "../../../../src/datasource/connectors/jira/jira-poller.js";
import { createSilentLogger } from "../../../helpers/mocks.js";
import { makeWorkItem } from "../../../helpers/factories.js";
import type { IWorkItemSource } from "../../../../src/datasource/connector.js";

function createMockSource(items: ReturnType<typeof makeWorkItem>[] = []): IWorkItemSource {
  return {
    name: "JIRA",
    sourceKey: "jira",
    buildQueries: vi.fn().mockReturnValue([]),
    searchWorkItems: vi.fn().mockResolvedValue(items),
    refreshWorkItem: vi.fn(),
    isValidItemId: vi.fn().mockReturnValue(true),
  };
}

describe("JiraWorkItemPoller", () => {
  let source: IWorkItemSource;
  let poller: JiraWorkItemPoller;

  beforeEach(() => {
    vi.useFakeTimers();
    source = createMockSource();
    poller = new JiraWorkItemPoller(source, ["jql1", "jql2"], 60_000, createSilentLogger());
  });

  afterEach(() => {
    poller.stop();
    vi.useRealTimers();
  });

  it("exposes sourceKey from connector", () => {
    expect(poller.sourceKey).toBe("jira");
  });

  it("drain returns empty array before start", () => {
    expect(poller.drain()).toEqual([]);
  });

  it("polls immediately on start", async () => {
    const item = makeWorkItem("DF-1");
    vi.mocked(source.searchWorkItems).mockResolvedValue([item]);

    poller.start();
    // Let the immediate poll() settle
    await vi.runOnlyPendingTimersAsync();

    const items = poller.drain();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("DF-1");
  });

  it("fires callback when items are found", async () => {
    const callback = vi.fn();
    poller.onItems(callback);

    const item = makeWorkItem("DF-1");
    vi.mocked(source.searchWorkItems).mockResolvedValue([item]);

    poller.start();
    await vi.runOnlyPendingTimersAsync();

    expect(callback).toHaveBeenCalled();
  });

  it("does not fire callback when no items found", async () => {
    const callback = vi.fn();
    poller.onItems(callback);

    vi.mocked(source.searchWorkItems).mockResolvedValue([]);

    poller.start();
    await vi.runOnlyPendingTimersAsync();

    expect(callback).not.toHaveBeenCalled();
  });

  it("deduplicates items across queries", async () => {
    const item = makeWorkItem("DF-1");
    vi.mocked(source.searchWorkItems).mockResolvedValue([item]);

    poller.start();
    await vi.runOnlyPendingTimersAsync();

    // Both queries return the same item — should only appear once in the buffer
    expect(poller.drain()).toHaveLength(1);
  });

  it("drain clears the buffer", async () => {
    const item = makeWorkItem("DF-1");
    vi.mocked(source.searchWorkItems).mockResolvedValue([item]);

    poller.start();
    await vi.runOnlyPendingTimersAsync();

    expect(poller.drain()).toHaveLength(1);
    expect(poller.drain()).toHaveLength(0);
  });

  it("stop prevents further polling", async () => {
    poller.start();
    await vi.runOnlyPendingTimersAsync();

    poller.stop();
    vi.mocked(source.searchWorkItems).mockClear();

    await vi.advanceTimersByTimeAsync(120_000);

    expect(source.searchWorkItems).not.toHaveBeenCalled();
  });

  it("does not start twice", () => {
    poller.start();
    poller.start();

    // Second start is a no-op — no error thrown
    // If it started twice, two intervals + two immediate polls would fire,
    // but the guard prevents that.
  });

  it("handles poll errors without crashing", async () => {
    vi.mocked(source.searchWorkItems).mockRejectedValue(new Error("network"));

    poller.start();
    // Should not throw
    await vi.runOnlyPendingTimersAsync();

    expect(poller.drain()).toEqual([]);
  });

  it("sorts items by created date", async () => {
    const older = makeWorkItem("DF-1", { created: "2026-01-01T00:00:00Z" });
    const newer = makeWorkItem("DF-2", { created: "2026-02-01T00:00:00Z" });

    // Return newer first
    vi.mocked(source.searchWorkItems)
      .mockResolvedValueOnce([newer])
      .mockResolvedValueOnce([older]);

    poller.start();
    await vi.runOnlyPendingTimersAsync();

    const items = poller.drain();
    expect(items[0].id).toBe("DF-1");
    expect(items[1].id).toBe("DF-2");
  });
});
