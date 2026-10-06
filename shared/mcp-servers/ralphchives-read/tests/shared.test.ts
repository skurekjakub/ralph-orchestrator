import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Behavioral tests for shared.ts — initCategoryId(), unavailableReason handling.
 *
 * Uses vi.resetModules() + dynamic import to get fresh module state per test,
 * since shared.ts has top-level side effects (env var reads).
 */

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe("initCategoryId", () => {
  it("resolves NODEBB_CATEGORY_NAME to cid via API lookup", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "ralph-docs";

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          categories: [
            { cid: 5, name: "ralph-docs" },
            { cid: 6, name: "ralph-vscode" },
          ],
        }),
        { status: 200 },
      ),
    );

    const shared = await import("../src/shared.js");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBe(5);
    expect(shared.unavailableReason).toBeUndefined();
  });

  it("falls back to NODEBB_CATEGORY_ID env var (direct numeric)", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    process.env.NODEBB_CATEGORY_ID = "42";
    delete process.env.NODEBB_CATEGORY_NAME;

    const shared = await import("../src/shared.js");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBe(42);
    expect(shared.unavailableReason).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sets unavailableReason when NODEBB_CATEGORY_ID is non-numeric", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    process.env.NODEBB_CATEGORY_ID = "abc";
    delete process.env.NODEBB_CATEGORY_NAME;

    const shared = await import("../src/shared.js");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBeUndefined();
    expect(shared.unavailableReason).toContain("not a valid number");
  });

  it("sets unavailableReason when neither env var is set", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    delete process.env.NODEBB_CATEGORY_NAME;

    const shared = await import("../src/shared.js");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBeUndefined();
    expect(shared.unavailableReason).toContain("neither NODEBB_CATEGORY_NAME nor NODEBB_CATEGORY_ID");
  });

  it("sets unavailableReason when category name not found", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "nonexistent";

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ categories: [{ cid: 1, name: "other" }] }), { status: 200 }),
    );

    const shared = await import("../src/shared.js");
    await shared.initCategoryId();

    expect(shared.unavailableReason).toContain('"nonexistent" not found');
  });

  it("sets unavailableReason when API returns error", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "ralph-docs";

    vi.mocked(fetch).mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const shared = await import("../src/shared.js");
    await shared.initCategoryId();

    expect(shared.unavailableReason).toContain("HTTP 500");
  });

  it("skips when NODEBB_API_TOKEN is missing", async () => {
    delete process.env.NODEBB_API_TOKEN;
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "ralph-docs";

    const shared = await import("../src/shared.js");
    expect(shared.unavailableReason).toContain("NODEBB_API_TOKEN");

    await shared.initCategoryId();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("nodebbGet", () => {
  it("sends GET request with Bearer auth and returns parsed JSON", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    delete process.env.NODEBB_CATEGORY_NAME;

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ topics: [{ tid: 1 }] }), { status: 200 }));

    const shared = await import("../src/shared.js");
    const result = await shared.nodebbGet<{ topics: { tid: number }[] }>("/api/category/5");

    expect(result.topics).toEqual([{ tid: 1 }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("throws on non-OK response", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    delete process.env.NODEBB_CATEGORY_NAME;

    vi.mocked(fetch).mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const shared = await import("../src/shared.js");
    await expect(shared.nodebbGet("/api/topic/999")).rejects.toThrow("NodeBB API 404");
  });
});
