import { describe, it, expect } from "vitest";
import { buildTaskContext } from "../../src/services/task-context.js";
import { makeWorkItem, makeProfile } from "../helpers/factories.js";
import type { IRalphchivesConfig } from "../../src/config/types.js";
const KEY = "DF-100";

const ralphchivesConfig: IRalphchivesConfig = {
  enabled: false,
  nodebbApiUrl: "http://localhost:4567",
  neo4jUri: "bolt://localhost:7687",
  neo4jUser: "neo4j",
};

describe("buildTaskContext", () => {
  it("builds context with default values", () => {
    const ctx = buildTaskContext(makeWorkItem(KEY), makeProfile(), "DF-100-123", ralphchivesConfig);

    expect(ctx.workItem.id).toBe(KEY);
    expect(ctx.profile).toBeDefined();
    expect(ctx.taskId).toBe("DF-100-123");
    expect(ctx.triggerParams).toEqual({});
    expect(ctx.sourceBranch).toBe("main");
    expect(ctx.taskBranch).toBe("ralph/DF-100-test-work-item-df-100");
    expect(ctx.isRevision).toBe(false);
    expect(ctx.ralphchivesEnabled).toBe(false);
  });

  it("converts string[] triggerParams to Record", () => {
    const ctx = buildTaskContext(makeWorkItem(KEY), makeProfile(), "DF-100-123", ralphchivesConfig, [
      "codesamples",
      "branch=develop",
    ]);

    expect(ctx.triggerParams).toEqual({ codesamples: "true", branch: "develop" });
    expect(ctx.taskBranch).toBe("develop");
  });

  it("uses PR branch metadata when explicit trigger params are absent", () => {
    const ctx = buildTaskContext(
      makeWorkItem(KEY),
      makeProfile(),
      "DF-100-123",
      ralphchivesConfig,
      undefined,
      "https://dev.azure.com/org/proj/_git/repo/pullrequest/42",
      { sourceBranch: "feature/from-pr", targetBranch: "release/31" },
    );

    expect(ctx.sourceBranch).toBe("release/31");
    expect(ctx.taskBranch).toBe("feature/from-pr");
  });

  it("detects revision status", () => {
    const profile = makeProfile({
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: ["Defect Found"] },
    });
    const issue = makeWorkItem(KEY, "Fix docs", "Defect Found");

    const ctx = buildTaskContext(issue, profile, "DF-100-123", ralphchivesConfig);

    expect(ctx.isRevision).toBe(true);
  });

  it("revision status comparison is case-insensitive", () => {
    const profile = makeProfile({
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: ["defect found"] },
    });
    const issue = makeWorkItem(KEY, "Fix docs", "Defect Found");

    const ctx = buildTaskContext(issue, profile, "DF-100-123", ralphchivesConfig);

    expect(ctx.isRevision).toBe(true);
  });

  it("returns isRevision false when no revision statuses configured", () => {
    const profile = makeProfile({
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: [] },
    });

    const ctx = buildTaskContext(makeWorkItem(KEY), profile, "DF-100-123", ralphchivesConfig);

    expect(ctx.isRevision).toBe(false);
  });

  it("propagates ralphchivesEnabled true when config is enabled", () => {
    const enabled = { ...ralphchivesConfig, enabled: true };
    const ctx = buildTaskContext(makeWorkItem(KEY), makeProfile(), "DF-100-123", enabled);

    expect(ctx.ralphchivesEnabled).toBe(true);
  });
});
