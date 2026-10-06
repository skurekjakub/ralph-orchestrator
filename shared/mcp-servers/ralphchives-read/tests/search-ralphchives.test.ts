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

/** Narrow the content union to extract the text field. */
function textContent(result: Awaited<ReturnType<typeof tool.handler>>): string {
  const item = result.content[0];
  if (item.type !== "text") throw new Error(`Expected text content, got ${item.type}`);
  return item.text;
}

/** Stub both /api/search and /api/category responses in one call. */
function mockSources(searchPosts: unknown[] = [], categoryTopics: unknown[] = [], matchCount = searchPosts.length) {
  vi.mocked(shared.nodebbGet).mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/search")) {
      return { posts: searchPosts, matchCount };
    }
    // /api/category/:cid
    return { topics: categoryTopics, pagination: { currentPage: 1, pageCount: 1 } };
  });
}

function makePost(tid: number, title: string, content: string, pid = tid * 10) {
  return {
    pid,
    tid,
    content,
    user: { username: "ralph" },
    topic: { title, slug: `${tid}/${title.toLowerCase().replace(/ /g, "-")}` },
    timestamp: Date.now(),
  };
}

function makeTopic(tid: number, title: string, teaser = "") {
  return {
    tid,
    title,
    slug: `${tid}/${title.toLowerCase().replace(/ /g, "-")}`,
    mainPid: tid * 10,
    teaser: { content: teaser, pid: tid * 10, user: { username: "ralph" } },
    user: { username: "ralph" },
    timestamp: Date.now(),
  };
}

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
    mockSources();

    await tool.handler({ query: "API migration" }, {} as never);

    const calls = vi.mocked(shared.nodebbGet).mock.calls.map((c) => String(c[0]));
    const searchCall = calls.find((c) => c.includes("/api/search"));
    expect(searchCall).toBeDefined();
    expect(searchCall).toContain("categories%5B%5D=5");
    expect(searchCall).toContain("term=API+migration");
  });

  it("also fetches category topics for fuzzy corpus", async () => {
    mockSources();

    await tool.handler({ query: "test" }, {} as never);

    const calls = vi.mocked(shared.nodebbGet).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("/api/category/5"))).toBe(true);
  });

  it("returns fuzzy matches from category topics when search finds nothing", async () => {
    mockSources(
      [], // NodeBB search returns nothing (e.g. typo)
      [makeTopic(1, "API Migration Guide", "How to migrate the API")],
    );

    const result = await tool.handler({ query: "API Migraton Guide" }, {} as never); // typo
    const body = JSON.parse(textContent(result));

    expect(body.returned).toBeGreaterThan(0);
    expect(body.results[0].topicTitle).toBe("API Migration Guide");
  });

  it("merges search results and category topics, deduplicating by tid", async () => {
    mockSources(
      [makePost(1, "Shared Topic", "deep content match")],
      [makeTopic(1, "Shared Topic", "teaser only"), makeTopic(2, "Another Topic", "other content")],
    );

    const result = await tool.handler({ query: "Shared Topic" }, {} as never);
    const body = JSON.parse(textContent(result));

    // tid=1 should appear once (from search result, which has full content)
    const tids = body.results.map((r: { topicId: number }) => r.topicId);
    expect(new Set(tids).size).toBe(tids.length); // no duplicates
  });

  it("truncates snippets to 500 chars", async () => {
    const longContent = "a".repeat(600);
    mockSources([makePost(1, "Test Topic", longContent)]);

    const result = await tool.handler({ query: "Test Topic" }, {} as never);
    const body = JSON.parse(textContent(result));

    expect(body.results[0].snippet.length).toBe(503); // 500 + "..."
    expect(body.results[0].snippet.endsWith("...")).toBe(true);
  });

  it("respects limit parameter", async () => {
    const topics = Array.from({ length: 20 }, (_, i) => makeTopic(i + 1, `Topic ${i + 1}`, `content ${i + 1}`));
    mockSources([], topics);

    const result = await tool.handler({ query: "Topic" }, {} as never);
    const body = JSON.parse(textContent(result));

    // Default limit is 10
    expect(body.returned).toBeLessThanOrEqual(10);
  });

  it("returns empty results when both sources fail", async () => {
    vi.mocked(shared.nodebbGet).mockRejectedValue(new Error("timeout"));

    const result = await tool.handler({ query: "test" }, {} as never);
    const body = JSON.parse(textContent(result));

    expect(result.isError).toBeUndefined();
    expect(body.returned).toBe(0);
    expect(body.results).toEqual([]);
  });

  it("gracefully handles search failure and still returns category results", async () => {
    vi.mocked(shared.nodebbGet).mockImplementation(async (path: string) => {
      if (String(path).startsWith("/api/search")) throw new Error("search down");
      return { topics: [makeTopic(1, "Fallback Topic", "content")], pagination: { currentPage: 1, pageCount: 1 } };
    });

    const result = await tool.handler({ query: "Fallback Topic" }, {} as never);
    const body = JSON.parse(textContent(result));

    expect(result.isError).toBeUndefined();
    expect(body.returned).toBeGreaterThan(0);
    expect(body.results[0].topicTitle).toBe("Fallback Topic");
  });
});
