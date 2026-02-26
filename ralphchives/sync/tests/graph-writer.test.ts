import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphWriter } from "../src/graph-writer.js";

// Mock neo4j-driver — we only need to verify Cypher calls, not real DB
vi.mock("neo4j-driver", () => {
  const mockSession = {
    run: vi.fn().mockResolvedValue({ records: [] }),
    close: vi.fn(),
  };
  const mockDriver = {
    session: vi.fn(() => mockSession),
    verifyConnectivity: vi.fn(),
    close: vi.fn(),
  };
  return {
    default: {
      driver: vi.fn(() => mockDriver),
      auth: { basic: vi.fn((u: string, p: string) => ({ principal: u, credentials: p })) },
    },
    // Re-export for named import compatibility
    __mockDriver: mockDriver,
    __mockSession: mockSession,
  };
});

// Access mock internals
async function getMockSession() {
  const mod = await import("neo4j-driver") as Record<string, unknown>;
  return mod.__mockSession as {
    run: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

describe("GraphWriter", () => {
  let writer: GraphWriter;

  beforeEach(async () => {
    const session = await getMockSession();
    session.run.mockReset().mockResolvedValue({ records: [] });
    session.close.mockReset();
    writer = new GraphWriter("bolt://localhost:7687", "neo4j", "test");
  });

  describe("mergeCategories", () => {
    it("returns 0 for empty input", async () => {
      const count = await writer.mergeCategories([]);
      expect(count).toBe(0);
    });

    it("merges categories with correct Cypher", async () => {
      const session = await getMockSession();
      const categories = [
        { cid: 1, name: "General", description: "General discussion", parentCid: 0, slug: "general" },
        { cid: 2, name: "Sub", description: "Sub category", parentCid: 1, slug: "sub" },
      ];

      const count = await writer.mergeCategories(categories);

      expect(count).toBe(2);
      expect(session.run).toHaveBeenCalledOnce();
      // Verify Cypher contains MERGE and the batch param
      const [cypher, params] = session.run.mock.calls[0];
      expect(cypher).toContain("MERGE (cat:Category {cid: c.cid})");
      expect(params.batch).toEqual(categories);
    });
  });

  describe("mergeUsers", () => {
    it("passes user data in batch parameter", async () => {
      const session = await getMockSession();
      const users = [{ uid: 1, username: "alice", reputation: 10, joindate: 1000, groupTitle: "" }];

      await writer.mergeUsers(users);

      const [cypher, params] = session.run.mock.calls[0];
      expect(cypher).toContain("MERGE (user:User {uid: u.uid})");
      expect(params.batch).toEqual(users);
    });
  });

  describe("mergePosts", () => {
    it("passes posts with REPLIES_TO logic", async () => {
      const session = await getMockSession();
      const posts = [
        { pid: 1, tid: 10, uid: 1, content: "Hello", timestamp: 1000, votes: 0, toPid: null },
        { pid: 2, tid: 10, uid: 2, content: "Reply", timestamp: 2000, votes: 1, toPid: 1 },
      ];

      await writer.mergePosts(posts);

      const [cypher] = session.run.mock.calls[0];
      expect(cypher).toContain("MERGE (post)-[:REPLIES_TO]->(parent)");
      expect(cypher).toContain("MERGE (post)-[:IN_TOPIC]->(topic)");
      expect(cypher).toContain("MERGE (author)-[:POSTED]->(post)");
    });
  });

  describe("mergeTopicTags", () => {
    it("flattens topics into tag rows", async () => {
      const session = await getMockSession();
      const topics = [
        { tid: 1, uid: 1, cid: 1, title: "T1", timestamp: 1000, slug: "t1", tags: [{ value: "js" }, { value: "ts" }], mainPid: 1, postcount: 1 },
        { tid: 2, uid: 1, cid: 1, title: "T2", timestamp: 2000, slug: "t2", tags: [], mainPid: 2, postcount: 1 },
      ];

      await writer.mergeTopicTags(topics);

      const [, params] = session.run.mock.calls[0];
      expect(params.batch).toEqual([
        { tid: 1, tagName: "js" },
        { tid: 1, tagName: "ts" },
      ]);
    });

    it("returns 0 when no topics have tags", async () => {
      const topics = [
        { tid: 1, uid: 1, cid: 1, title: "T1", timestamp: 1000, slug: "t1", tags: [], mainPid: 1, postcount: 1 },
      ];

      const count = await writer.mergeTopicTags(topics);
      expect(count).toBe(0);
    });
  });

  describe("batch splitting", () => {
    it("splits large input into batches of 500", async () => {
      const session = await getMockSession();
      // Create 1200 categories — should produce 3 batches (500 + 500 + 200)
      const categories = Array.from({ length: 1200 }, (_, i) => ({
        cid: i + 1, name: `Cat ${i}`, description: "", parentCid: 0, slug: `cat-${i}`,
      }));

      const count = await writer.mergeCategories(categories);

      expect(count).toBe(1200);
      expect(session.run).toHaveBeenCalledTimes(3);
      expect(session.run.mock.calls[0][1].batch).toHaveLength(500);
      expect(session.run.mock.calls[1][1].batch).toHaveLength(500);
      expect(session.run.mock.calls[2][1].batch).toHaveLength(200);
    });
  });

  describe("getSyncState / setSyncState", () => {
    it("returns 0 when no sync state exists", async () => {
      const result = await writer.getSyncState("lastTopicTimestamp");
      expect(result).toBe(0);
    });

    it("returns stored value when sync state exists", async () => {
      const session = await getMockSession();
      session.run.mockResolvedValueOnce({
        records: [{ get: (key: string) => (key === "value" ? 42000 : undefined) }],
      });

      const result = await writer.getSyncState("lastTopicTimestamp");
      expect(result).toBe(42000);
    });

    it("writes sync state with MERGE", async () => {
      const session = await getMockSession();
      await writer.setSyncState("lastTopicTimestamp", 99000);

      const [cypher, params] = session.run.mock.calls[0];
      expect(cypher).toContain("MERGE (s:SyncState {key: $key})");
      expect(params).toEqual({ key: "lastTopicTimestamp", value: 99000 });
    });
  });
});
