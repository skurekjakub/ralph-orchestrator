import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { buildTaskContext } from "../../src/services/task-context";
import { makeWorkItem, makeProfile } from "../helpers/factories";
import type { IRalphchivesConfig } from "../../src/config/types";
const KEY = "DF-100";
/** The orchestrator checkout, away from the test's working directory. */
const ROOT_DIR = "/srv/ralph";

const ralphchivesConfig: IRalphchivesConfig = {
  enabled: false,
  nodebbApiUrl: "http://localhost:4567",
  neo4jUri: "bolt://localhost:7687",
  neo4jUser: "neo4j",
};

describe("buildTaskContext", () => {
  it("builds context with default values", () => {
    const ctx = buildTaskContext(makeWorkItem(KEY), makeProfile(), "DF-100-123", ralphchivesConfig, ROOT_DIR);

    expect(ctx.workItem.id).toBe(KEY);
    expect(ctx.profile).toBeDefined();
    expect(ctx.taskId).toBe("DF-100-123");
    expect(ctx.triggerParams).toEqual({});
    expect(ctx.sourceBranch).toBe("main");
    expect(ctx.taskBranch).toBe("ralph/DF-100-test-work-item-df-100");
    expect(ctx.isRevision).toBe(false);
    expect(ctx.ralphchivesEnabled).toBe(false);
  });

  it("places the task's workspace under the orchestrator checkout's cache/workspaces, named after the task id", () => {
    // Act
    const ctx = buildTaskContext(makeWorkItem(KEY), makeProfile(), "DF-100-123", ralphchivesConfig, ROOT_DIR);

    // Assert
    expect(ctx.workspacePath).toBe(join(ROOT_DIR, "cache", "workspaces", "DF-100-123"));
  });

  it("converts string[] triggerParams to Record", () => {
    const ctx = buildTaskContext(makeWorkItem(KEY), makeProfile(), "DF-100-123", ralphchivesConfig, ROOT_DIR, [
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
      ROOT_DIR,
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

    const ctx = buildTaskContext(issue, profile, "DF-100-123", ralphchivesConfig, ROOT_DIR);

    expect(ctx.isRevision).toBe(true);
  });

  it("revision status comparison is case-insensitive", () => {
    const profile = makeProfile({
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: ["defect found"] },
    });
    const issue = makeWorkItem(KEY, "Fix docs", "Defect Found");

    const ctx = buildTaskContext(issue, profile, "DF-100-123", ralphchivesConfig, ROOT_DIR);

    expect(ctx.isRevision).toBe(true);
  });

  it("returns isRevision false when no revision statuses configured", () => {
    const profile = makeProfile({
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: [] },
    });

    const ctx = buildTaskContext(makeWorkItem(KEY), profile, "DF-100-123", ralphchivesConfig, ROOT_DIR);

    expect(ctx.isRevision).toBe(false);
  });

  it("propagates ralphchivesEnabled true when config is enabled", () => {
    const enabled = { ...ralphchivesConfig, enabled: true };
    const ctx = buildTaskContext(makeWorkItem(KEY), makeProfile(), "DF-100-123", enabled, ROOT_DIR);

    expect(ctx.ralphchivesEnabled).toBe(true);
  });
});
