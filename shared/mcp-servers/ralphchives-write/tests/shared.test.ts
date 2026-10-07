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

    const shared = await import("../src/shared");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBe(5);
    expect(shared.unavailableReason).toBeUndefined();
  });

  it("falls back to NODEBB_CATEGORY_ID env var (direct numeric)", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    process.env.NODEBB_CATEGORY_ID = "42";
    delete process.env.NODEBB_CATEGORY_NAME;

    const shared = await import("../src/shared");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBe(42);
    expect(shared.unavailableReason).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sets unavailableReason when NODEBB_CATEGORY_ID is non-numeric", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    process.env.NODEBB_CATEGORY_ID = "not-a-number";
    delete process.env.NODEBB_CATEGORY_NAME;

    const shared = await import("../src/shared");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBeUndefined();
    expect(shared.unavailableReason).toContain("not a valid number");
  });

  it("sets unavailableReason when neither NODEBB_CATEGORY_NAME nor NODEBB_CATEGORY_ID is set", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    delete process.env.NODEBB_CATEGORY_NAME;

    const shared = await import("../src/shared");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBeUndefined();
    expect(shared.unavailableReason).toContain("neither NODEBB_CATEGORY_NAME nor NODEBB_CATEGORY_ID");
  });

  it("sets unavailableReason when category name is not found in API response", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "nonexistent";

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ categories: [{ cid: 5, name: "ralph-docs" }] }), { status: 200 }),
    );

    const shared = await import("../src/shared");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBeUndefined();
    expect(shared.unavailableReason).toContain('category "nonexistent" not found');
  });

  it("sets unavailableReason when API returns non-OK status", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "ralph-docs";

    vi.mocked(fetch).mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

    const shared = await import("../src/shared");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBeUndefined();
    expect(shared.unavailableReason).toContain("HTTP 500");
  });

  it("sets unavailableReason when fetch throws a network error", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "ralph-docs";

    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const shared = await import("../src/shared");
    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBeUndefined();
    expect(shared.unavailableReason).toContain("ECONNREFUSED");
  });

  it("skips initialization when NODEBB_API_TOKEN is missing (unavailableReason already set)", async () => {
    delete process.env.NODEBB_API_TOKEN;
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "ralph-docs";

    const shared = await import("../src/shared");
    expect(shared.unavailableReason).toContain("NODEBB_API_TOKEN not configured");

    await shared.initCategoryId();

    expect(shared.NODEBB_CATEGORY_ID).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends Bearer token in Authorization header", async () => {
    process.env.NODEBB_API_TOKEN = "my-secret-token";
    delete process.env.NODEBB_CATEGORY_ID;
    process.env.NODEBB_CATEGORY_NAME = "ralph-docs";

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ categories: [{ cid: 1, name: "ralph-docs" }] }), { status: 200 }),
    );

    const shared = await import("../src/shared");
    await shared.initCategoryId();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: { Authorization: "Bearer my-secret-token" } }),
    );
  });
});

describe("nodebbPost", () => {
  it("sends POST request with JSON body and Bearer auth", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    delete process.env.NODEBB_CATEGORY_NAME;

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: { code: "ok" }, response: { tid: 1 } }), { status: 200 }),
    );

    const shared = await import("../src/shared");
    const result = await shared.nodebbPost<{ tid: number }>("/api/v3/topics", { cid: 5, title: "test" });

    expect(result).toEqual({ tid: 1 });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        }),
        body: JSON.stringify({ cid: 5, title: "test" }),
      }),
    );
  });

  it("throws on non-OK response with response body", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    delete process.env.NODEBB_CATEGORY_NAME;

    vi.mocked(fetch).mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

    const shared = await import("../src/shared");
    await expect(shared.nodebbPost("/api/v3/topics", {})).rejects.toThrow("NodeBB API 403: Forbidden");
  });
});

describe("errorResult", () => {
  it("wraps Error instances", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    delete process.env.NODEBB_CATEGORY_NAME;

    const shared = await import("../src/shared");
    const result = shared.errorResult(new Error("something broke"));

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      error: true,
      message: "something broke",
    });
  });

  it("wraps string errors", async () => {
    process.env.NODEBB_API_TOKEN = "test-token";
    delete process.env.NODEBB_CATEGORY_ID;
    delete process.env.NODEBB_CATEGORY_NAME;

    const shared = await import("../src/shared");
    const result = shared.errorResult("plain string error");

    expect(JSON.parse(result.content[0].text).message).toBe("plain string error");
  });
});
