import { describe, it, expect } from "vitest";
import { slugifyBranchName } from "../../src/util/branch.js";

describe("slugifyBranchName", () => {
  it("builds branch name from key and summary", () => {
    expect(slugifyBranchName("DOC-3143", "Update API docs for v2")).toBe("ralph/DOC-3143-update-api-docs-for-v2");
  });

  it("strips special characters", () => {
    expect(slugifyBranchName("DF-100", "Fix: handle (edge) case [#1]")).toBe("ralph/DF-100-fix-handle-edge-case-1");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugifyBranchName("DF-100", "a---b   c")).toBe("ralph/DF-100-a-b-c");
  });

  it("handles empty summary", () => {
    expect(slugifyBranchName("DF-100", "")).toBe("ralph/DF-100");
  });

  it("lowercases everything in slug", () => {
    expect(slugifyBranchName("DOC-42", "Update README And CHANGELOG")).toBe("ralph/DOC-42-update-readme-and-changelog");
  });

  it("preserves issue key casing", () => {
    expect(slugifyBranchName("DOC-42", "test")).toBe("ralph/DOC-42-test");
  });

  it("truncates long summaries to 80 chars", () => {
    const longSummary = "a".repeat(200);
    const result = slugifyBranchName("DF-1", longSummary);
    // "ralph/DF-1-" is 11 chars + 80 = 91 max total
    const slug = result.replace("ralph/DF-1-", "");
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it("handles summary with only special characters", () => {
    expect(slugifyBranchName("DF-100", "!@#$%^&*()")).toBe("ralph/DF-100");
  });

  it("handles unicode characters in summary", () => {
    expect(slugifyBranchName("DOC-1", "Update 日本語 docs")).toBe("ralph/DOC-1-update-docs");
  });

  it("strips trailing hyphens from truncation", () => {
    // Create a string that after slugification would have a trailing hyphen at position 80
    const summary = "word ".repeat(20); // "word word word..." - spaces become hyphens
    const result = slugifyBranchName("DF-1", summary);
    expect(result).not.toMatch(/-$/);
  });
});
