import { describe, it, expect, vi } from "vitest";
import { withRetry, sleep } from "../src/retry.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, "test");
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail-1"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, "test", undefined, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after all attempts exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(
      withRetry(fn, "test", undefined, 2, 10),
    ).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("logs retry warnings via logger", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("oops"))
      .mockResolvedValue("ok");

    await withRetry(fn, "my-op", logger, 3, 10);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("my-op failed (attempt 1/3)"),
    );
  });
});

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
