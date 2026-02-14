import { describe, it, expect } from "vitest";
import { ProfileRouter } from "../src/services/profile-router.js";
import { makeIssue, makeProfile } from "./helpers.js";

/** Convenience wrapper — matches a single issue against a list of profiles. */
function matchProfile(
  issue: ReturnType<typeof makeIssue>,
  profiles: ReturnType<typeof makeProfile>[],
) {
  return new ProfileRouter(profiles).match(issue);
}

describe("Profile routing", () => {
  it("matches issue to profile by keyword", () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["RalphDocs"] } }),
      makeProfile({ id: "ralph-vscode", match: { projects: ["DF"], keywords: ["RalphVsCode"] } }),
    ];
    const issue = makeIssue("DF-100", "RalphDocs: Update API reference");
    expect(matchProfile(issue, profiles)?.profile.id).toBe("ralph-docs");
  });

  it("matches case-insensitively", () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["RalphDocs"] } }),
    ];
    const issue = makeIssue("DF-100", "ralphdocs: some task");
    expect(matchProfile(issue, profiles)?.profile.id).toBe("ralph-docs");
  });

  it("falls through to catch-all profile (empty keywords)", () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["RalphDocs"] } }),
      makeProfile({ id: "ralph-default", match: { projects: ["DF"], keywords: [] } }),
    ];
    const issue = makeIssue("DF-100", "Some untagged issue");
    expect(matchProfile(issue, profiles)?.profile.id).toBe("ralph-default");
  });

  it("returns null when no profile matches project", () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: [] } }),
    ];
    const issue = makeIssue("XP-100", "RalphDocs: wrong project");
    expect(matchProfile(issue, profiles)).toBeNull();
  });

  it("first matching profile wins (order matters)", () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["RalphDocs"] } }),
      makeProfile({ id: "ralph-default", match: { projects: ["DF"], keywords: [] } }),
    ];
    const issue = makeIssue("DF-100", "RalphDocs: should match first");
    expect(matchProfile(issue, profiles)?.profile.id).toBe("ralph-docs");
  });

  it("matches multiple keywords (any match wins)", () => {
    const profiles = [
      makeProfile({
        id: "ralph-multi",
        match: { projects: ["DF"], keywords: ["RalphDocs", "RalphAPI"] },
      }),
    ];
    const issue = makeIssue("DF-100", "RalphAPI: new endpoint docs");
    expect(matchProfile(issue, profiles)?.profile.id).toBe("ralph-multi");
  });

  it("returns isRevision=false for normal status matches", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"] },
      }),
    ];
    const result = matchProfile(makeIssue("DF-1", "Ralph: docs", "New"), profiles);
    expect(result?.isRevision).toBe(false);
  });

  it("includes profileIds in config", () => {
    const profiles = [
      makeProfile({ id: "ralph-docs" }),
      makeProfile({ id: "ralph-vscode" }),
    ];
    expect(profiles.map((p) => p.id)).toEqual(["ralph-docs", "ralph-vscode"]);
  });
});

describe("Profile status filtering", () => {
  it("matches issue when status is in allowed statuses", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"] },
      }),
    ];
    const issue = makeIssue("DF-100", "Ralph: update docs", "New");
    expect(matchProfile(issue, profiles)?.profile.id).toBe("ralph-docs");
  });

  it("rejects issue when status is not in allowed statuses", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"] },
      }),
    ];
    const issue = makeIssue("DF-100", "Ralph: update docs", "In Progress");
    expect(matchProfile(issue, profiles)).toBeNull();
  });

  it("skips status filter when statuses and revisionStatuses are both empty", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: [] },
      }),
    ];
    const issue = makeIssue("DF-100", "Ralph: update docs", "In Progress");
    expect(matchProfile(issue, profiles)?.profile.id).toBe("ralph-docs");
  });

  it("matches any of multiple allowed statuses", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New", "TODO"] },
      }),
    ];
    expect(matchProfile(makeIssue("DF-1", "Ralph: x", "New"), profiles)?.profile.id).toBe("ralph-docs");
    expect(matchProfile(makeIssue("DF-2", "Ralph: y", "TODO"), profiles)?.profile.id).toBe("ralph-docs");
    expect(matchProfile(makeIssue("DF-3", "Ralph: z", "Done"), profiles)).toBeNull();
  });

  it("routes to different profiles based on status and project", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"] },
      }),
      makeProfile({
        id: "ralph-vscode",
        match: { projects: ["DOC"], keywords: ["RalphVsCode"], statuses: ["TODO"] },
      }),
    ];

    expect(matchProfile(makeIssue("DF-1", "Ralph: docs", "New"), profiles)?.profile.id).toBe("ralph-docs");
    expect(matchProfile(makeIssue("DOC-1", "RalphVsCode: ext", "TODO"), profiles)?.profile.id).toBe("ralph-vscode");
    expect(matchProfile(makeIssue("DOC-1", "RalphVsCode: ext", "New"), profiles)).toBeNull();
    expect(matchProfile(makeIssue("DF-1", "Ralph: docs", "TODO"), profiles)).toBeNull();
  });
});

describe("Revision status routing", () => {
  it("matches issue in revisionStatuses and sets isRevision=true", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: {
          projects: ["DF"],
          keywords: ["Ralph"],
          statuses: ["New"],
          revisionStatuses: ["Defect Found"],
        },
      }),
    ];
    const result = matchProfile(makeIssue("DF-1", "Ralph: docs", "Defect Found"), profiles);
    expect(result?.profile.id).toBe("ralph-docs");
    expect(result?.isRevision).toBe(true);
  });

  it("does not match when status is neither in statuses nor revisionStatuses", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: {
          projects: ["DF"],
          keywords: ["Ralph"],
          statuses: ["New"],
          revisionStatuses: ["Defect Found"],
        },
      }),
    ];
    expect(matchProfile(makeIssue("DF-1", "Ralph: docs", "In Progress"), profiles)).toBeNull();
  });

  it("matches case-insensitively on revisionStatuses", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: {
          projects: ["DF"],
          keywords: [],
          statuses: [],
          revisionStatuses: ["Defect Found"],
        },
      }),
    ];
    const result = matchProfile(makeIssue("DF-1", "Ralph: docs", "defect found"), profiles);
    expect(result?.profile.id).toBe("ralph-docs");
    expect(result?.isRevision).toBe(true);
  });

  it("prefers statuses over revisionStatuses when both match", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: {
          projects: ["DF"],
          keywords: [],
          statuses: ["Special"],
          revisionStatuses: ["Special"],
        },
      }),
    ];
    const result = matchProfile(makeIssue("DF-1", "Ralph: docs", "Special"), profiles);
    expect(result?.isRevision).toBe(false);
  });
});
