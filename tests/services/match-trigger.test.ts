import { describe, it, expect } from "vitest";
import { matchesTrigger } from "../../src/services/trigger-scanner.js";

describe("matchesTrigger", () => {
  it("matches trigger at start of text", () => {
    expect(matchesTrigger("@Ralph please review", "@Ralph")).toBe(true);
  });

  it("matches trigger at end of text", () => {
    expect(matchesTrigger("Please review @Ralph", "@Ralph")).toBe(true);
  });

  it("matches trigger followed by punctuation", () => {
    expect(matchesTrigger("@Ralph, please review", "@Ralph")).toBe(true);
    expect(matchesTrigger("@Ralph: review this", "@Ralph")).toBe(true);
    expect(matchesTrigger("@Ralph.", "@Ralph")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesTrigger("@ralph please review", "@Ralph")).toBe(true);
    expect(matchesTrigger("@RALPH please review", "@Ralph")).toBe(true);
  });

  it("rejects partial matches like @RalphAutoComplete", () => {
    expect(matchesTrigger("@RalphAutoComplete is here", "@Ralph")).toBe(false);
  });

  it("rejects trigger embedded in a longer word", () => {
    expect(matchesTrigger("@RalphDocs2 please review", "@Ralph")).toBe(false);
  });

  it("matches when trigger is the entire text", () => {
    expect(matchesTrigger("@McpProbe", "@McpProbe")).toBe(true);
  });
});
