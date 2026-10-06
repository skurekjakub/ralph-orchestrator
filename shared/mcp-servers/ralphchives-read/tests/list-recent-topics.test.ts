import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/shared.js", () => ({
  NODEBB_CATEGORY_ID: 5,
  unavailableReason: undefined,
  nodebbGet: vi.fn(),
  errorResult: vi.fn((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: true, message }) }], isError: true };
  }),
}));

const shared = await import("../src/shared.js");
const { tool } = await import("../src/tools/list-recent-topics.js");

function textContent(result: Awaited<ReturnType<typeof tool.handler>>): string {
  const item = result.content[0];
  if (item.type !== "text") throw new Error(`Expected text content, got ${item.type}`);
  return item.text;
}

describe("list_recent_topics handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (shared as { unavailableReason: string | undefined }).unavailableReason = undefined;
    (shared as { NODEBB_CATEGORY_ID: number | undefined }).NODEBB_CATEGORY_ID = 5;
  });

  it("returns error when unavailableReason is set", async () => {
    (shared as { unavailableReason: string | undefined }).unavailableReason = "down";

    const result = await tool.handler({}, {} as never);

    expect(shared.errorResult).toHaveBeenCalledWith("down");
    expect(result.isError).toBe(true);
    expect(shared.nodebbGet).not.toHaveBeenCalled();
  });

  it("fetches category topics with pagination", async () => {
    vi.mocked(shared.nodebbGet).mockResolvedValue({
      topics: [
        {
          tid: 1,
          title: "Report",
          slug: "report",
          postcount: 3,
          timestamp: 1700000000000,
          lastposttime: 1700001000000,
          user: { username: "ralph" },
          tags: [{ value: "DF-100" }],
          teaser: { content: "Latest reply preview", user: { username: "malph" } },
        },
      ],
      topic_count: 1,
      name: "ralph-docs",
    });

    const result = await tool.handler({ page: 2 }, {} as never);
    const body = JSON.parse(textContent(result));

    expect(shared.nodebbGet).toHaveBeenCalledWith("/api/category/5?page=2");
    expect(body.category).toBe("ralph-docs");
    expect(body.totalTopics).toBe(1);
    expect(body.page).toBe(2);
    expect(body.topics[0].title).toBe("Report");
    expect(body.topics[0].teaser.content).toBe("Latest reply preview");
  });

  it("defaults to page 1", async () => {
    vi.mocked(shared.nodebbGet).mockResolvedValue({ topics: [], topic_count: 0, name: "ralph-docs" });

    await tool.handler({}, {} as never);

    expect(shared.nodebbGet).toHaveBeenCalledWith("/api/category/5?page=1");
  });

  it("handles topics without teasers", async () => {
    vi.mocked(shared.nodebbGet).mockResolvedValue({
      topics: [
        {
          tid: 1,
          title: "T",
          slug: "t",
          postcount: 1,
          timestamp: 1700000000000,
          lastposttime: 1700000000000,
          user: { username: "ralph" },
          tags: [],
        },
      ],
      topic_count: 1,
      name: "ralph-docs",
    });

    const result = await tool.handler({}, {} as never);
    const body = JSON.parse(textContent(result));

    expect(body.topics[0].teaser).toBeUndefined();
  });

  it("returns error result when nodebbGet throws", async () => {
    vi.mocked(shared.nodebbGet).mockRejectedValue(new Error("timeout"));

    const result = await tool.handler({}, {} as never);
    expect(result.isError).toBe(true);
  });
});
