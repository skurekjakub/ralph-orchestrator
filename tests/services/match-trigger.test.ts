import { describe, it, expect } from "vitest";
import { matchesTrigger, parseTriggerParams } from "../../src/services/trigger-scanner.js";

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

  it("matches trigger followed by parenthesized params", () => {
    expect(matchesTrigger("@Ralph(codesamples, verbose)", "@Ralph")).toBe(true);
    expect(matchesTrigger("@Ralph(codesamples)", "@Ralph")).toBe(true);
  });
});

describe("parseTriggerParams", () => {
  it("extracts comma-separated params from parentheses", () => {
    expect(parseTriggerParams("@Ralph(codesamples, verbose)", "@Ralph")).toEqual(["codesamples", "verbose"]);
  });

  it("extracts a single param", () => {
    expect(parseTriggerParams("@Ralph(codesamples)", "@Ralph")).toEqual(["codesamples"]);
  });

  it("returns empty array when no parens present", () => {
    expect(parseTriggerParams("@Ralph please review", "@Ralph")).toEqual([]);
  });

  it("returns empty array when parens are empty", () => {
    expect(parseTriggerParams("@Ralph() do it", "@Ralph")).toEqual([]);
  });

  it("trims whitespace around params", () => {
    expect(parseTriggerParams("@Ralph(  foo ,  bar  )", "@Ralph")).toEqual(["foo", "bar"]);
  });

  it("is case-insensitive for the trigger", () => {
    expect(parseTriggerParams("@ralph(codesamples)", "@Ralph")).toEqual(["codesamples"]);
  });

  it("does not match params on a different trigger", () => {
    expect(parseTriggerParams("@RalphDf(verbose)", "@Ralph")).toEqual([]);
  });

  it("works with trigger in the middle of text", () => {
    expect(parseTriggerParams("Hey @Ralph(verbose) please do this", "@Ralph")).toEqual(["verbose"]);
  });

  it("preserves key=value params as raw strings", () => {
    expect(parseTriggerParams("@Ralph(codesamples, branch_name=feature-xyz)", "@Ralph")).toEqual([
      "codesamples",
      "branch_name=feature-xyz",
    ]);
  });
});
