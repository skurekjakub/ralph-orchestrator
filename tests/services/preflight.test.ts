import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildPreflightContext,
  runPreflight,
} from "../../src/services/preflight.js";
import { makeIssue, makeComment } from "../helpers/factories.js";
import { createMockResources } from "../helpers/mocks.js";

describe("runPreflight", () => {
  it("returns ok for unknown check names", () => {
    const result = runPreflight("nonexistent-check", makeIssue("DF-1"), {
      comments: [],
      handoffContent: null,
      prUrl: null,
    });
    expect(result.ok).toBe(true);
  });

  describe("review-ready check", () => {
    it("fails when no PR URL found", () => {
      const result = runPreflight("review-ready", makeIssue("DF-1"), {
        comments: [],
        handoffContent: "some handoff content",
        prUrl: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("PR URL");
    });

    it("fails when no handoff attachment", () => {
      const result = runPreflight("review-ready", makeIssue("DF-1"), {
        comments: [],
        handoffContent: null,
        prUrl: "https://dev.azure.com/org/proj/_git/repo/pullrequest/123",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("handoff");
    });

    it("passes when both PR URL and handoff exist", () => {
      const result = runPreflight("review-ready", makeIssue("DF-1"), {
        comments: [],
        handoffContent: "## Summary\nDid the work.",
        prUrl: "https://github.com/org/repo/pull/42",
      });
      expect(result.ok).toBe(true);
    });
  });
});

describe("buildPreflightContext", () => {
  const mockResources = createMockResources();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("extracts PR URL from plain-text comments", async () => {
    const comments = [
      makeComment("1", "Please review https://github.com/org/repo/pull/42"),
    ];
    mockResources.fetchHandoff.mockResolvedValue(null);

    const ctx = await buildPreflightContext(
      mockResources,
      "DF-1",
      comments,
    );
    expect(ctx.prUrl).toBe("https://github.com/org/repo/pull/42");
    expect(ctx.handoffContent).toBeNull();
  });

  it("finds most recent PR URL when multiple exist", async () => {
    const comments = [
      makeComment("1", "old PR https://github.com/org/repo/pull/10"),
      makeComment("2", "new PR https://github.com/org/repo/pull/42"),
    ];
    mockResources.fetchHandoff.mockResolvedValue(null);

    const ctx = await buildPreflightContext(mockResources, "DF-1", comments);
    expect(ctx.prUrl).toBe("https://github.com/org/repo/pull/42");
  });

  it("downloads handoff attachment", async () => {
    mockResources.fetchHandoff.mockResolvedValue("## Handoff content");

    const ctx = await buildPreflightContext(mockResources, "DF-1", []);
    expect(ctx.handoffContent).toBe("## Handoff content");
    expect(mockResources.fetchHandoff).toHaveBeenCalledWith("DF-1");
  });

  it("returns null handoff when fetchHandoff returns null", async () => {
    mockResources.fetchHandoff.mockResolvedValue(null);

    const ctx = await buildPreflightContext(mockResources, "DF-1", []);
    expect(ctx.handoffContent).toBeNull();
    expect(ctx.prUrl).toBeNull();
  });

  it("recognizes Azure DevOps PR URLs", async () => {
    const comments = [
      makeComment("1", "PR: https://dev.azure.com/org/proj/_git/repo/pullrequest/99"),
    ];
    mockResources.fetchHandoff.mockResolvedValue(null);

    const ctx = await buildPreflightContext(mockResources, "DF-1", comments);
    expect(ctx.prUrl).toBe("https://dev.azure.com/org/proj/_git/repo/pullrequest/99");
  });

  it("recognizes Bitbucket PR URLs", async () => {
    const comments = [
      makeComment("1", "See https://bitbucket.org/org/repo/pull-requests/5"),
    ];
    mockResources.fetchHandoff.mockResolvedValue(null);

    const ctx = await buildPreflightContext(mockResources, "DF-1", comments);
    expect(ctx.prUrl).toContain("bitbucket.org");
  });
});
