import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/shared.js", () => ({
  NODEBB_CATEGORY_ID: 5,
  unavailableReason: undefined,
  nodebbPost: vi.fn(),
  errorResult: vi.fn((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: true, message }) }], isError: true };
  }),
}));

const shared = await import("../src/shared.js");
const { tool } = await import("../src/tools/post-observation.js");

function textContent(result: Awaited<ReturnType<typeof tool.handler>>): string {
  const item = result.content[0];
  if (item.type !== "text") throw new Error(`Expected text content, got ${item.type}`);
  return item.text;
}

describe("post_observation handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (shared as { unavailableReason: string | undefined }).unavailableReason = undefined;
    (shared as { NODEBB_CATEGORY_ID: number | undefined }).NODEBB_CATEGORY_ID = 5;
  });

  it("returns error when unavailableReason is set", async () => {
    (shared as { unavailableReason: string | undefined }).unavailableReason = "Ralphchives down";

    const result = await tool.handler({ title: "test", content: "body" }, {} as never);

    expect(shared.errorResult).toHaveBeenCalledWith("Ralphchives down");
    expect(result.isError).toBe(true);
    expect(shared.nodebbPost).not.toHaveBeenCalled();
  });

  it("prefixes title with [Observation]", async () => {
    vi.mocked(shared.nodebbPost).mockResolvedValue({ tid: 1, slug: "s", mainPid: 1 });

    await tool.handler({ title: "Content API naming issue", content: "Details..." }, {} as never);

    expect(shared.nodebbPost).toHaveBeenCalledWith(
      "/api/v3/topics",
      expect.objectContaining({ title: "[Observation] Content API naming issue" }),
    );
  });

  it("appends 'observation' tag to provided tags", async () => {
    vi.mocked(shared.nodebbPost).mockResolvedValue({ tid: 1, slug: "s", mainPid: 1 });

    await tool.handler({ title: "t", content: "c", tags: ["api", "bug"] }, {} as never);

    expect(shared.nodebbPost).toHaveBeenCalledWith(
      "/api/v3/topics",
      expect.objectContaining({ tags: ["api", "bug", "observation"] }),
    );
  });

  it("uses ['observation'] as default tag when no tags provided", async () => {
    vi.mocked(shared.nodebbPost).mockResolvedValue({ tid: 1, slug: "s", mainPid: 1 });

    await tool.handler({ title: "t", content: "c" }, {} as never);

    expect(shared.nodebbPost).toHaveBeenCalledWith(
      "/api/v3/topics",
      expect.objectContaining({ tags: ["observation"] }),
    );
  });

  it("returns success result with topic metadata", async () => {
    vi.mocked(shared.nodebbPost).mockResolvedValue({ tid: 10, slug: "test-slug", mainPid: 5 });

    const result = await tool.handler({ title: "t", content: "c" }, {} as never);

    const body = JSON.parse(textContent(result));
    expect(body.success).toBe(true);
    expect(body.topicId).toBe(10);
    expect(body.slug).toBe("test-slug");
  });

  it("returns error result when nodebbPost throws", async () => {
    vi.mocked(shared.nodebbPost).mockRejectedValue(new Error("API failure"));

    const result = await tool.handler({ title: "t", content: "c" }, {} as never);

    expect(result.isError).toBe(true);
  });
});
