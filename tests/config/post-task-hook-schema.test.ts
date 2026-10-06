import { describe, it, expect } from "vitest";
import { postTaskHookSchema, variantSchema } from "../../src/config/schemas";

describe("postTaskHookSchema", () => {
  const validHook = {
    name: "run-analysis",
    stages: [{ agent: "ralph.run-analyzer", role: "analyzer", mode: "local" as const }],
  };

  it("accepts a valid hook with local-only stages", () => {
    const result = postTaskHookSchema.safeParse(validHook);
    expect(result.success).toBe(true);
  });

  it("accepts multiple local stages", () => {
    const result = postTaskHookSchema.safeParse({
      ...validHook,
      stages: [
        { agent: "ralph.run-analyzer", role: "analyzer", mode: "local" },
        { agent: "ralph.agent-improver", role: "improver", mode: "local" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects container-mode stages", () => {
    const result = postTaskHookSchema.safeParse({
      ...validHook,
      stages: [{ agent: "ralph.run-analyzer", role: "analyzer", mode: "container" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects default mode (container) when mode is omitted", () => {
    const result = postTaskHookSchema.safeParse({
      ...validHook,
      stages: [{ agent: "ralph.run-analyzer", role: "analyzer" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate roles within a hook", () => {
    const result = postTaskHookSchema.safeParse({
      ...validHook,
      stages: [
        { agent: "ralph.a", role: "analyzer", mode: "local" },
        { agent: "ralph.b", role: "analyzer", mode: "local" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty stages array", () => {
    const result = postTaskHookSchema.safeParse({ ...validHook, stages: [] });
    expect(result.success).toBe(false);
  });

  it("rejects hook name with uppercase letters", () => {
    const result = postTaskHookSchema.safeParse({ ...validHook, name: "RunAnalysis" });
    expect(result.success).toBe(false);
  });

  it("rejects hook name with spaces", () => {
    const result = postTaskHookSchema.safeParse({ ...validHook, name: "run analysis" });
    expect(result.success).toBe(false);
  });

  it("accepts hook name with hyphens and numbers", () => {
    const result = postTaskHookSchema.safeParse({ ...validHook, name: "post-task-2" });
    expect(result.success).toBe(true);
  });
});

describe("variantSchema — postTaskHooks", () => {
  const baseVariant = {
    stages: [{ agent: "ralph.ralph", role: "primary" }],
    match: { commentTrigger: "@test" },
  };

  it("defaults postTaskHooks to empty array when omitted", () => {
    const result = variantSchema.safeParse(baseVariant);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.postTaskHooks).toEqual([]);
    }
  });

  it("accepts a variant with postTaskHooks", () => {
    const result = variantSchema.safeParse({
      ...baseVariant,
      postTaskHooks: [
        {
          name: "analysis",
          stages: [{ agent: "ralph.analyzer", role: "analyzer", mode: "local" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate hook names within a variant", () => {
    const result = variantSchema.safeParse({
      ...baseVariant,
      postTaskHooks: [
        { name: "hook-a", stages: [{ agent: "a", role: "a", mode: "local" }] },
        { name: "hook-a", stages: [{ agent: "b", role: "b", mode: "local" }] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("allows different hook names", () => {
    const result = variantSchema.safeParse({
      ...baseVariant,
      postTaskHooks: [
        { name: "hook-a", stages: [{ agent: "a", role: "a", mode: "local" }] },
        { name: "hook-b", stages: [{ agent: "b", role: "b", mode: "local" }] },
      ],
    });
    expect(result.success).toBe(true);
  });
});
