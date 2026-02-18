import { describe, it, expect } from "vitest";
import { validateTriggerUniqueness } from "../../src/validate/profiles.js";
import type { VariantTriggerInfo } from "../../src/validate/profiles.js";

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

  it("errors when one trigger is a substring of another on shared projects", () => {
    const errors: string[] = [];
    validateTriggerUniqueness([
      variant("docs", 0, ["DOC"], "@Mal"),
      variant("docs", 1, ["DOC"], "@Malph"),
    ], errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Ambiguous comment trigger");
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
