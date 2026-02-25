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
const { tool } = await import("../src/tools/post-task-report.js");

describe("post_task_report handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to available state
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

  it("posts to /api/v3/topics with resolved category ID", async () => {
    vi.mocked(shared.nodebbPost).mockResolvedValue({ tid: 42, slug: "test-slug", mainPid: 1 });

    const result = await tool.handler(
      { title: "DF-100: Updated docs", content: "Changes made...", tags: ["DF-100", "api"] },
      {} as never,
    );

    expect(shared.nodebbPost).toHaveBeenCalledWith("/api/v3/topics", {
      cid: 5,
      title: "DF-100: Updated docs",
      content: "Changes made...",
      tags: ["DF-100", "api"],
    });
    const body = JSON.parse(result.content[0].text as string);
    expect(body.success).toBe(true);
    expect(body.topicId).toBe(42);
  });

  it("uses provided categoryId when NODEBB_CATEGORY_ID is undefined", async () => {
    (shared as { NODEBB_CATEGORY_ID: number | undefined }).NODEBB_CATEGORY_ID = undefined;
    vi.mocked(shared.nodebbPost).mockResolvedValue({ tid: 7, slug: "s", mainPid: 1 });

    await tool.handler({ title: "t", content: "c", categoryId: 99 }, {} as never);

    expect(shared.nodebbPost).toHaveBeenCalledWith("/api/v3/topics", expect.objectContaining({ cid: 99 }));
  });

  it("defaults tags to empty array when not provided", async () => {
    vi.mocked(shared.nodebbPost).mockResolvedValue({ tid: 1, slug: "s", mainPid: 1 });

    await tool.handler({ title: "t", content: "c" }, {} as never);

    expect(shared.nodebbPost).toHaveBeenCalledWith("/api/v3/topics", expect.objectContaining({ tags: [] }));
  });

  it("returns error result when nodebbPost throws", async () => {
    vi.mocked(shared.nodebbPost).mockRejectedValue(new Error("NodeBB API 500: Internal"));

    const result = await tool.handler({ title: "t", content: "c" }, {} as never);

    expect(shared.errorResult).toHaveBeenCalledWith(expect.any(Error));
    expect(result.isError).toBe(true);
  });
});
