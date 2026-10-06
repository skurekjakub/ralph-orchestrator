import { describe, it, expect, vi, beforeEach } from "vitest";
import { NodeBBFetcher, type NodeBBTopic } from "../src/nodebb-fetcher.js";

const BASE_URL = "http://localhost:4567";
const TOKEN = "test-token-abc";

describe("NodeBBFetcher", () => {
  let fetcher: NodeBBFetcher;

  beforeEach(() => {
    fetcher = new NodeBBFetcher(BASE_URL, TOKEN);
    vi.restoreAllMocks();
  });

  describe("fetchCategories", () => {
    it("sends correct auth header and parses categories", async () => {
      const mockCategories = [{ cid: 1, name: "Test", description: "", parentCid: 0, slug: "test" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ categories: mockCategories }), { status: 200 }),
      );

      const result = await fetcher.fetchCategories();

      expect(result).toEqual(mockCategories);
      expect(fetch).toHaveBeenCalledWith(
        new URL("/api/categories", BASE_URL),
        expect.objectContaining({
          headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
        }),
      );
    });

    it("returns empty array when categories is null", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

      const result = await fetcher.fetchCategories();
      expect(result).toEqual([]);
    });

    it("throws on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
      );

      await expect(fetcher.fetchCategories()).rejects.toThrow("NodeBB API error: 403 Forbidden");
    });
  });

  describe("fetchTopicsInCategory", () => {
    it("includes cid and page in URL", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ topics: [] }), { status: 200 }),
      );

      await fetcher.fetchTopicsInCategory(5, 3);

      expect(fetch).toHaveBeenCalledWith(new URL("/api/category/5?page=3", BASE_URL), expect.anything());
    });

    it("defaults to page 1", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ topics: [] }), { status: 200 }),
      );

      await fetcher.fetchTopicsInCategory(2);

      expect(fetch).toHaveBeenCalledWith(new URL("/api/category/2?page=1", BASE_URL), expect.anything());
    });
  });

  describe("fetchRecentTopics", () => {
    it("paginates until topics are older than the cutoff", async () => {
      const page1Topics: NodeBBTopic[] = [makeTopic(1, 5000), makeTopic(2, 4000)];
      const page2Topics: NodeBBTopic[] = [
        makeTopic(3, 3000),
        makeTopic(4, 1000), // older than cutoff of 2000
      ];

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(JSON.stringify({ topics: page1Topics, nextStart: 2 }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ topics: page2Topics, nextStart: 4 }), { status: 200 }));

      const result = await fetcher.fetchRecentTopics(2000);

      // Should include topics with timestamps > 2000 only
      expect(result).toHaveLength(3);
      expect(result.map((t) => t.tid)).toEqual([1, 2, 3]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("stops when server returns empty batch", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ topics: [makeTopic(1, 5000)], nextStart: 1 }), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ topics: [], nextStart: 0 }), { status: 200 }));

      const result = await fetcher.fetchRecentTopics(0);
      expect(result).toHaveLength(1);
    });

    it("returns empty array when no recent topics", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ topics: [] }), { status: 200 }),
      );

      const result = await fetcher.fetchRecentTopics(0);
      expect(result).toEqual([]);
    });
  });

  describe("fetchUser", () => {
    it("returns null on error instead of throwing", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Not Found", { status: 404, statusText: "Not Found" }),
      );

      const result = await fetcher.fetchUser(999);
      expect(result).toBeNull();
    });
  });
});

function makeTopic(tid: number, timestamp: number): NodeBBTopic {
  return {
    tid,
    uid: 1,
    cid: 1,
    title: `Topic ${tid}`,
    timestamp,
    slug: `topic-${tid}`,
    tags: [],
    mainPid: tid * 100,
    postcount: 1,
  };
}
