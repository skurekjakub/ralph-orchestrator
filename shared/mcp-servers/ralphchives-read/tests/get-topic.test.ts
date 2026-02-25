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
const { tool } = await import("../src/tools/get-topic.js");

describe("get_topic handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (shared as { unavailableReason: string | undefined }).unavailableReason = undefined;
  });

  it("returns error when unavailableReason is set", async () => {
    (shared as { unavailableReason: string | undefined }).unavailableReason = "down";

    const result = await tool.handler({ topicId: 42 }, {} as never);

    expect(shared.errorResult).toHaveBeenCalledWith("down");
    expect(result.isError).toBe(true);
    expect(shared.nodebbGet).not.toHaveBeenCalled();
  });

  it("fetches topic by ID and returns structured response", async () => {
    vi.mocked(shared.nodebbGet).mockResolvedValue({
      tid: 42,
      title: "DF-100: Test report",
      slug: "test-report",
      category: { cid: 5, name: "ralph-docs" },
      tags: [{ value: "DF-100" }],
      posts: [
        { pid: 1, content: "Main post", timestamp: 1700000000000, user: { username: "ralph", uid: 1 } },
        { pid: 2, content: "Reply", timestamp: 1700001000000, user: { username: "malph", uid: 2 } },
      ],
      postcount: 2,
      timestamp: 1700000000000,
      lastposttime: 1700001000000,
    });

    const result = await tool.handler({ topicId: 42 }, {} as never);
    const body = JSON.parse(result.content[0].text as string);

    expect(shared.nodebbGet).toHaveBeenCalledWith("/api/topic/42");
    expect(body.topicId).toBe(42);
    expect(body.title).toBe("DF-100: Test report");
    expect(body.posts).toHaveLength(2);
    expect(body.posts[0].author).toBe("ralph");
    expect(body.tags).toEqual(["DF-100"]);
  });

  it("returns error result when nodebbGet throws", async () => {
    vi.mocked(shared.nodebbGet).mockRejectedValue(new Error("not found"));

    const result = await tool.handler({ topicId: 999 }, {} as never);
    expect(result.isError).toBe(true);
  });
});
