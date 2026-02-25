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
const { tool } = await import("../src/tools/search-ralphchives.js");

describe("search_ralphchives handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (shared as { unavailableReason: string | undefined }).unavailableReason = undefined;
    (shared as { NODEBB_CATEGORY_ID: number | undefined }).NODEBB_CATEGORY_ID = 5;
  });

  it("returns error when unavailableReason is set", async () => {
    (shared as { unavailableReason: string | undefined }).unavailableReason = "down";

    const result = await tool.handler({ query: "test" }, {} as never);

    expect(shared.errorResult).toHaveBeenCalledWith("down");
    expect(result.isError).toBe(true);
    expect(shared.nodebbGet).not.toHaveBeenCalled();
  });

  it("calls /api/search with category scoping", async () => {
    vi.mocked(shared.nodebbGet).mockResolvedValue({
      posts: [],
      matchCount: 0,
    });

    await tool.handler({ query: "API migration" }, {} as never);

    const callArg = vi.mocked(shared.nodebbGet).mock.calls[0][0] as string;
    expect(callArg).toContain("/api/search");
    expect(callArg).toContain("categories%5B%5D=5");
    expect(callArg).toContain("term=API+migration");
  });

  it("truncates snippets to 500 chars", async () => {
    const longContent = "a".repeat(600);
    vi.mocked(shared.nodebbGet).mockResolvedValue({
      posts: [{
        pid: 1, tid: 10, content: longContent,
        user: { username: "ralph" },
        topic: { title: "Test", slug: "test" },
        timestamp: Date.now(),
      }],
      matchCount: 1,
    });

    const result = await tool.handler({ query: "test" }, {} as never);
    const body = JSON.parse(result.content[0].text as string);

    expect(body.results[0].snippet.length).toBe(503); // 500 + "..."
    expect(body.results[0].snippet.endsWith("...")).toBe(true);
  });

  it("respects limit parameter", async () => {
    const posts = Array.from({ length: 20 }, (_, i) => ({
      pid: i, tid: 1, content: `post ${i}`,
      user: { username: "ralph" },
      topic: { title: "T", slug: "t" },
      timestamp: Date.now(),
    }));
    vi.mocked(shared.nodebbGet).mockResolvedValue({ posts, matchCount: 20 });

    const result = await tool.handler({ query: "test", limit: 3 }, {} as never);
    const body = JSON.parse(result.content[0].text as string);

    expect(body.returned).toBe(3);
  });

  it("returns error result when nodebbGet throws", async () => {
    vi.mocked(shared.nodebbGet).mockRejectedValue(new Error("timeout"));

    const result = await tool.handler({ query: "test" }, {} as never);
    expect(result.isError).toBe(true);
  });
});
