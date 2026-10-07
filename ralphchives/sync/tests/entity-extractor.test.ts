import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — accessible inside vi.mock factories
const { mockChat, mockRun, mockSession, mockDriver } = vi.hoisted(() => {
  const mockChat = vi.fn();
  const mockRun = vi.fn().mockResolvedValue({ records: [] });
  const mockSession = { run: mockRun, close: vi.fn() };
  const mockDriver = { session: vi.fn(() => mockSession) };
  return { mockChat, mockRun, mockSession, mockDriver };
});

vi.mock("ollama", () => ({
  Ollama: class {
    chat: typeof mockChat;
    constructor(_opts: unknown) {
      this.chat = mockChat;
    }
  },
}));

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(() => mockDriver),
    auth: { basic: vi.fn() },
  },
}));

import { EntityExtractor } from "../src/entity-extractor";

function makeExtractor(): EntityExtractor {
  return new EntityExtractor(mockDriver as never, "http://localhost:11434");
}

describe("EntityExtractor", () => {
  beforeEach(() => {
    mockChat.mockReset();
    mockRun.mockReset().mockResolvedValue({ records: [] });
    mockSession.close.mockReset();
  });

  describe("extractMissingEntities", () => {
    it("returns 0 when no posts need processing", async () => {
      mockRun.mockResolvedValueOnce({ records: [] }); // findPostsWithoutEntities query

      const extractor = makeExtractor();
      const count = await extractor.extractMissingEntities();
      expect(count).toBe(0);
    });

    it("extracts entities from posts and writes them to Neo4j", async () => {
      // findPostsWithoutEntities returns one post
      mockRun.mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "pid" ? 42 : "Node.js has a bug in v22 with ESM loading") }],
      });

      // LLM returns valid entities
      mockChat.mockResolvedValueOnce({
        message: {
          content: JSON.stringify([
            { name: "node.js", type: "library", description: "JavaScript runtime" },
            { name: "esm loading", type: "feature", description: "ES module loading" },
          ]),
        },
      });

      // writeEntities: 2 cypher calls (MENTIONS + RELATED_TO)
      mockRun.mockResolvedValueOnce({ records: [] }); // MENTIONS
      mockRun.mockResolvedValueOnce({ records: [] }); // RELATED_TO
      mockRun.mockResolvedValueOnce({ records: [] }); // markProcessed

      const extractor = makeExtractor();
      const count = await extractor.extractMissingEntities();

      expect(count).toBe(1);
      expect(mockChat).toHaveBeenCalledOnce();

      // Verify the MENTIONS Cypher was called with entities
      const mentionsCall = mockRun.mock.calls[1];
      expect(mentionsCall[0]).toContain("MERGE (post)-[:MENTIONS]->(entity)");
      expect(mentionsCall[1].entities).toHaveLength(2);
      expect(mentionsCall[1].entities[0].name).toBe("node.js");

      // Verify RELATED_TO was created for co-occurring entities
      const relatedCall = mockRun.mock.calls[2];
      expect(relatedCall[0]).toContain("MERGE (e1)-[r:RELATED_TO]-(e2)");
    });

    it("marks post as processed even when no entities are found", async () => {
      mockRun.mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "pid" ? 10 : "Just a short reply: thanks!") }],
      });

      mockChat.mockResolvedValueOnce({
        message: { content: "[]" },
      });

      mockRun.mockResolvedValueOnce({ records: [] }); // markProcessed

      const extractor = makeExtractor();
      await extractor.extractMissingEntities();

      // Should have called markProcessed
      const lastCall = mockRun.mock.calls[mockRun.mock.calls.length - 1];
      expect(lastCall[0]).toContain("SET p.entitiesExtracted = true");
    });

    it("handles LLM returning wrapped JSON (entities key)", async () => {
      mockRun.mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "pid" ? 1 : "React 19 introduced server components") }],
      });

      // LLM returns { entities: [...] } instead of bare array
      mockChat.mockResolvedValueOnce({
        message: {
          content: JSON.stringify({
            entities: [
              { name: "react", type: "library", description: "UI framework" },
              { name: "server components", type: "feature", description: "SSR" },
            ],
          }),
        },
      });

      mockRun.mockResolvedValueOnce({ records: [] }); // MENTIONS
      mockRun.mockResolvedValueOnce({ records: [] }); // RELATED_TO
      mockRun.mockResolvedValueOnce({ records: [] }); // markProcessed

      const extractor = makeExtractor();
      const count = await extractor.extractMissingEntities();

      expect(count).toBe(1);
      const mentionsCall = mockRun.mock.calls[1];
      expect(mentionsCall[1].entities).toHaveLength(2);
    });

    it("filters out entities with invalid types", async () => {
      mockRun.mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "pid" ? 1 : "Testing entity validation") }],
      });

      mockChat.mockResolvedValueOnce({
        message: {
          content: JSON.stringify([
            { name: "valid", type: "concept", description: "ok" },
            { name: "invalid", type: "unicorn", description: "bad type" },
            { name: "", type: "concept", description: "empty name should survive type check" },
          ]),
        },
      });

      // Only 1 valid + 1 with empty name (passes type check but empty string)
      // writeEntities called with 2 entities, then markProcessed
      mockRun.mockResolvedValueOnce({ records: [] }); // MENTIONS
      mockRun.mockResolvedValueOnce({ records: [] }); // RELATED_TO
      mockRun.mockResolvedValueOnce({ records: [] }); // markProcessed

      const extractor = makeExtractor();
      await extractor.extractMissingEntities();

      // Should filter out "unicorn" type, keep "concept" entities
      const mentionsCall = mockRun.mock.calls[1];
      const entities = mentionsCall[1].entities;
      expect(
        entities.every((e: { type: string }) =>
          ["concept", "product", "error", "feature", "version", "library", "person"].includes(e.type),
        ),
      ).toBe(true);
      expect(entities.find((e: { name: string }) => e.name === "invalid")).toBeUndefined();
    });

    it("gracefully handles LLM failure (invalid JSON)", async () => {
      mockRun.mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "pid" ? 1 : "Some post content here") }],
      });

      mockChat.mockResolvedValueOnce({
        message: { content: "This is not valid JSON at all" },
      });

      mockRun.mockResolvedValueOnce({ records: [] }); // markProcessed (still called)

      const extractor = makeExtractor();
      const count = await extractor.extractMissingEntities();

      // Post should still be processed (marked), just no entities written
      expect(count).toBe(1);
      expect(mockRun).toHaveBeenCalledTimes(2); // findPosts + markProcessed only
    });

    it("gracefully handles LLM throwing an error", async () => {
      mockRun.mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "pid" ? 1 : "Some post content here") }],
      });

      mockChat.mockRejectedValueOnce(new Error("Ollama connection refused"));
      mockRun.mockResolvedValueOnce({ records: [] }); // markProcessed

      const extractor = makeExtractor();
      const count = await extractor.extractMissingEntities();
      expect(count).toBe(1);
    });

    it("lowercases and trims entity names", async () => {
      mockRun.mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "pid" ? 1 : "Discussion about TypeScript") }],
      });

      mockChat.mockResolvedValueOnce({
        message: {
          content: JSON.stringify([{ name: "  TypeScript  ", type: "library", description: "Language" }]),
        },
      });

      mockRun.mockResolvedValueOnce({ records: [] }); // MENTIONS (no RELATED_TO for 1 entity)
      mockRun.mockResolvedValueOnce({ records: [] }); // markProcessed

      const extractor = makeExtractor();
      await extractor.extractMissingEntities();

      const mentionsCall = mockRun.mock.calls[1];
      expect(mentionsCall[1].entities[0].name).toBe("typescript");
    });

    it("skips RELATED_TO when only one entity extracted", async () => {
      mockRun.mockResolvedValueOnce({
        records: [{ get: (k: string) => (k === "pid" ? 1 : "Just about Node.js") }],
      });

      mockChat.mockResolvedValueOnce({
        message: {
          content: JSON.stringify([{ name: "node.js", type: "library", description: "Runtime" }]),
        },
      });

      mockRun.mockResolvedValueOnce({ records: [] }); // MENTIONS only
      mockRun.mockResolvedValueOnce({ records: [] }); // markProcessed

      const extractor = makeExtractor();
      await extractor.extractMissingEntities();

      // Should NOT have a RELATED_TO call — only findPosts, MENTIONS, markProcessed
      const cypherCalls = mockRun.mock.calls.map((c) => c[0] as string);
      expect(cypherCalls.some((c) => c.includes("RELATED_TO"))).toBe(false);
    });
  });
});
