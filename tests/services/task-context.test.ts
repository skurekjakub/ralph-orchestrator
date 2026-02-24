import { describe, it, expect } from "vitest";
import { buildTaskContext } from "../../src/services/task-context.js";
import { makeIssue, makeProfile } from "../helpers/factories.js";

describe("buildTaskContext", () => {
  it("builds context with default values", () => {
    const ctx = buildTaskContext(makeIssue("DF-100"), makeProfile(), "DF-100-123");

    expect(ctx.issue.key).toBe("DF-100");
    expect(ctx.profile).toBeDefined();
    expect(ctx.taskId).toBe("DF-100-123");
    expect(ctx.triggerParams).toEqual({});
    expect(ctx.isRevision).toBe(false);
  });

  it("converts string[] triggerParams to Record", () => {
    const ctx = buildTaskContext(
      makeIssue("DF-100"), makeProfile(), "DF-100-123",
      ["codesamples", "branch=develop"],
    );

    expect(ctx.triggerParams).toEqual({ codesamples: "true", branch: "develop" });
  });

  it("detects revision status", () => {
    const profile = makeProfile({
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: ["Defect Found"] },
    });
    const issue = makeIssue("DF-100", "Fix docs", "Defect Found");

    const ctx = buildTaskContext(issue, profile, "DF-100-123");

    expect(ctx.isRevision).toBe(true);
  });

  it("revision status comparison is case-insensitive", () => {
    const profile = makeProfile({
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: ["defect found"] },
    });
    const issue = makeIssue("DF-100", "Fix docs", "Defect Found");

    const ctx = buildTaskContext(issue, profile, "DF-100-123");

    expect(ctx.isRevision).toBe(true);
  });

  it("returns isRevision false when no revision statuses configured", () => {
    const profile = makeProfile({
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: [] },
    });

    const ctx = buildTaskContext(makeIssue("DF-100"), profile, "DF-100-123");

    expect(ctx.isRevision).toBe(false);
  });
});
