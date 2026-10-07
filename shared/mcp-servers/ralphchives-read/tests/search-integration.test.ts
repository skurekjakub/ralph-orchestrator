/**
 * Integration tests against a running NodeBB instance at localhost:4567.
 * Run with: NODEBB_API_URL=http://localhost:4567 NODEBB_API_TOKEN=<token> NODEBB_CATEGORY_ID=6 npx vitest run tests/search-integration.test.ts
 *
 * Requires seeded data — see tests/live-probe.ts or the seed script.
 * Skipped when NODEBB_API_TOKEN is not set (CI).
 */
import { describe, it, expect, beforeAll } from "vitest";

const token = process.env.NODEBB_API_TOKEN;
const hasLiveNodeBB = !!token;

// Dynamic import so the module picks up env at import time
let tool: Awaited<typeof import("../src/tools/search-ralphchives")>["tool"];

function textContent(result: Awaited<ReturnType<typeof tool.handler>>): string {
  const item = result.content[0];
  if (item.type !== "text") throw new Error(`Expected text, got ${item.type}`);
  return item.text;
}

describe.skipIf(!hasLiveNodeBB)("search_ralphchives — live NodeBB integration", () => {
  beforeAll(async () => {
    // Ensure env is set before importing
    process.env.NODEBB_API_URL ??= "http://localhost:4567";
    // Must init category ID before tool import (resolves env → numeric cid)
    const { initCategoryId } = await import("../src/shared");
    await initCategoryId();
    const mod = await import("../src/tools/search-ralphchives");
    tool = mod.tool;
  });

  it("finds topics by single keyword", async () => {
    const result = await tool.handler({ query: "schema" }, {} as never);
    const body = JSON.parse(textContent(result));

    expect(result.isError).toBeUndefined();
    expect(body.returned).toBeGreaterThan(0);
    // At least one DOC-3143 topic mentions "schema"
    expect(body.results.some((r: { topicTitle: string }) => /schema/i.test(r.topicTitle))).toBe(true);
  });

  it("OR-matches multi-word queries against different topics", async () => {
    // "Content Delivery sandbox" — words span two different topics:
    //   "DF-456: Updated Content Delivery API documentation"
    //   "DOC-3143: [Test] Ralph sandbox issue"
    const result = await tool.handler({ query: "Content Delivery sandbox" }, {} as never);
    const body = JSON.parse(textContent(result));

    expect(body.returned).toBeGreaterThanOrEqual(2);
    const titles = body.results.map((r: { topicTitle: string }) => r.topicTitle);
    expect(titles.some((t: string) => /Content Delivery/i.test(t))).toBe(true);
    expect(titles.some((t: string) => /sandbox/i.test(t))).toBe(true);
  });

  it("matches DOC-3143 in topic titles", async () => {
    const result = await tool.handler({ query: "DOC-3143" }, {} as never);
    const body = JSON.parse(textContent(result));

    expect(body.returned).toBeGreaterThanOrEqual(3);
    // The three actual DOC-3143 topics should appear in results
    const titles: string[] = body.results.map((r: { topicTitle: string }) => r.topicTitle);
    const doc3143Matches = titles.filter((t) => t.includes("DOC-3143"));
    expect(doc3143Matches.length).toBeGreaterThanOrEqual(3);
  });

  it("multi-word query returns more results than any single word alone", async () => {
    const [r1, r2, r3] = await Promise.all([
      tool.handler({ query: "schema propagation remarks" }, {} as never),
      tool.handler({ query: "schema" }, {} as never),
      tool.handler({ query: "propagation" }, {} as never),
    ]);

    const multi = JSON.parse(textContent(r1));
    const single1 = JSON.parse(textContent(r2));
    const single2 = JSON.parse(textContent(r3));

    // OR query should return at least as many as any single term
    expect(multi.returned).toBeGreaterThanOrEqual(Math.max(single1.returned, single2.returned));
  });

  it("respects limit parameter", async () => {
    const result = await tool.handler({ query: "DOC-3143", limit: 1 }, {} as never);
    const body = JSON.parse(textContent(result));

    expect(body.returned).toBeLessThanOrEqual(1);
  });
});
