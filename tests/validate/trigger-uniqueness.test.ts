import { describe, it, expect } from "vitest";
import { validateTriggerUniqueness } from "../../src/validate/profiles.js";
import type { VariantTriggerInfo } from "../../src/validate/profiles.js";
import { matchesTrigger } from "../../src/services/trigger-scanner.js";

function variant(
  profileId: string,
  variantIndex: number,
  projects: string[],
  trigger: string,
): VariantTriggerInfo {
  return { profileId, variantIndex, projects, trigger };
}

describe("validateTriggerUniqueness", () => {
  it("passes when triggers are distinct", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC"], "@Ralph"),
      variant("docs", 1, ["DOC"], "@Malph"),
    ], errors);
    expect(errors).toHaveLength(0);
  });

  it("passes when triggers are identical but projects don't overlap", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC"], "@Ralph"),
      variant("vscode", 0, ["VSC"], "@Ralph"),
    ], errors);
    expect(errors).toHaveLength(0);
  });

  it("errors when identical triggers share a project", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC"], "@Ralph"),
      variant("vscode", 0, ["DOC"], "@Ralph"),
    ], errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Ambiguous comment trigger");
    expect(errors[0]).toContain("@Ralph");
    expect(errors[0]).toContain("DOC");
  });

  it("passes when one trigger is a prefix of another (word-boundary safe)", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC"], "@Ralph"),
      variant("vscode", 0, ["DOC"], "@RalphAutocomplete"),
    ], errors);
    expect(errors).toHaveLength(0);
  });

  it("passes when triggers share a prefix but differ (e.g. @Malph vs @MalphAutocomplete)", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC"], "@Malph"),
      variant("vscode", 0, ["DOC"], "@MalphAutocomplete"),
    ], errors);
    expect(errors).toHaveLength(0);
  });

  it("detects case-insensitive substring collisions", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC"], "@ralph"),
      variant("vscode", 0, ["DOC"], "@RALPH"),
    ], errors);
    expect(errors).toHaveLength(1);
  });

  it("detects partial project overlap", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC", "DF"], "@Ralph"),
      variant("vscode", 0, ["DF", "VSC"], "@Ralph"),
    ], errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("DF");
  });

  it("reports multiple collisions independently", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("a", 0, ["DOC"], "@Ralph"),
      variant("b", 0, ["DOC"], "@Ralph"),
      variant("c", 0, ["DOC"], "@Malph"),
      variant("d", 0, ["DOC"], "@Malph"),
    ], errors);
    expect(errors).toHaveLength(2);
  });

  it("passes with an empty variants array", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([], errors);
    expect(errors).toHaveLength(0);
  });

  it("passes with a single variant", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC"], "@Ralph"),
    ], errors);
    expect(errors).toHaveLength(0);
  });
});

describe("matchesTrigger", () => {
  it("matches trigger as a standalone word", () => {
    expect(matchesTrigger("@Ralph please review", "@Ralph")).toBe(true);
  });

  it("matches trigger at end of text", () => {
    expect(matchesTrigger("Hey @Ralph", "@Ralph")).toBe(true);
  });

  it("matches trigger at start of text", () => {
    expect(matchesTrigger("@Ralph", "@Ralph")).toBe(true);
  });

  it("matches trigger followed by comma", () => {
    expect(matchesTrigger("@Ralph, please do this", "@Ralph")).toBe(true);
  });

  it("matches trigger followed by colon", () => {
    expect(matchesTrigger("@Ralph: do the thing", "@Ralph")).toBe(true);
  });

  it("matches trigger followed by period", () => {
    expect(matchesTrigger("Ask @Ralph.", "@Ralph")).toBe(true);
  });

  it("matches trigger followed by semicolon", () => {
    expect(matchesTrigger("@Ralph; also @Malph", "@Ralph")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesTrigger("@ralph please", "@Ralph")).toBe(true);
    expect(matchesTrigger("@RALPH please", "@Ralph")).toBe(true);
  });

  it("does NOT match trigger embedded in a longer word", () => {
    expect(matchesTrigger("@RalphAutocomplete please", "@Ralph")).toBe(false);
  });

  it("does NOT match trigger as infix", () => {
    expect(matchesTrigger("use @Malphredo", "@Malph")).toBe(false);
  });

  it("does not match partial triggers", () => {
    expect(matchesTrigger("@Ral is here", "@Ralph")).toBe(false);
  });
});
