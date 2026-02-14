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
  it("matches issue to profile by keyword", async () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["RalphDocs"] } }),
      makeProfile({ id: "ralph-vscode", match: { projects: ["DF"], keywords: ["RalphVsCode"] } }),
    ];
    const issue = makeIssue("DF-100", "RalphDocs: Update API reference");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("matches case-insensitively", async () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["RalphDocs"] } }),
    ];
    const issue = makeIssue("DF-100", "ralphdocs: some task");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("falls through to catch-all profile (empty keywords)", async () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["RalphDocs"] } }),
      makeProfile({ id: "ralph-default", match: { projects: ["DF"], keywords: [] } }),
    ];
    const issue = makeIssue("DF-100", "Some untagged issue");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-default");
  });

  it("returns null when no profile matches project", async () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: [] } }),
    ];
    const issue = makeIssue("XP-100", "RalphDocs: wrong project");
    expect(await matchProfile(issue, profiles)).toBeNull();
  });

  it("first matching profile wins (order matters)", async () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], keywords: ["RalphDocs"] } }),
      makeProfile({ id: "ralph-default", match: { projects: ["DF"], keywords: [] } }),
    ];
    const issue = makeIssue("DF-100", "RalphDocs: should match first");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("matches multiple keywords (any match wins)", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-multi",
        match: { projects: ["DF"], keywords: ["RalphDocs", "RalphAPI"] },
      }),
    ];
    const issue = makeIssue("DF-100", "RalphAPI: new endpoint docs");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-multi");
  });

  it("returns isRevision=false for normal status matches", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"] },
      }),
    ];
    const result = await matchProfile(makeIssue("DF-1", "Ralph: docs", "New"), profiles);
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
  it("matches issue when status is in allowed statuses", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"] },
      }),
    ];
    const issue = makeIssue("DF-100", "Ralph: update docs", "New");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("rejects issue when status is not in allowed statuses", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"] },
      }),
    ];
    const issue = makeIssue("DF-100", "Ralph: update docs", "In Progress");
    expect(await matchProfile(issue, profiles)).toBeNull();
  });

  it("skips status filter when statuses and revisionStatuses are both empty", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: [] },
      }),
    ];
    const issue = makeIssue("DF-100", "Ralph: update docs", "In Progress");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("matches any of multiple allowed statuses", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New", "TODO"] },
      }),
    ];
    expect((await matchProfile(makeIssue("DF-1", "Ralph: x", "New"), profiles))?.profile.id).toBe("ralph-docs");
    expect((await matchProfile(makeIssue("DF-2", "Ralph: y", "TODO"), profiles))?.profile.id).toBe("ralph-docs");
    expect(await matchProfile(makeIssue("DF-3", "Ralph: z", "Done"), profiles)).toBeNull();
  });

  it("routes to different profiles based on status and project", async () => {
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

    expect((await matchProfile(makeIssue("DF-1", "Ralph: docs", "New"), profiles))?.profile.id).toBe("ralph-docs");
    expect((await matchProfile(makeIssue("DOC-1", "RalphVsCode: ext", "TODO"), profiles))?.profile.id).toBe("ralph-vscode");
    expect(await matchProfile(makeIssue("DOC-1", "RalphVsCode: ext", "New"), profiles)).toBeNull();
    expect(await matchProfile(makeIssue("DF-1", "Ralph: docs", "TODO"), profiles)).toBeNull();
  });
});

describe("Revision status routing", () => {
  it("matches issue in revisionStatuses and sets isRevision=true", async () => {
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
    const result = await matchProfile(makeIssue("DF-1", "Ralph: docs", "Defect Found"), profiles);
    expect(result?.profile.id).toBe("ralph-docs");
    expect(result?.isRevision).toBe(true);
  });

  it("does not match when status is neither in statuses nor revisionStatuses", async () => {
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
    expect(await matchProfile(makeIssue("DF-1", "Ralph: docs", "In Progress"), profiles)).toBeNull();
  });

  it("matches case-insensitively on revisionStatuses", async () => {
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
    const result = await matchProfile(makeIssue("DF-1", "Ralph: docs", "defect found"), profiles);
    expect(result?.profile.id).toBe("ralph-docs");
    expect(result?.isRevision).toBe(true);
  });

  it("prefers statuses over revisionStatuses when both match", async () => {
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
    const result = await matchProfile(makeIssue("DF-1", "Ralph: docs", "Special"), profiles);
    expect(result?.isRevision).toBe(false);
  });
});

describe("Comment trigger matching", () => {
  /** Helper that builds a router with a comment fetcher returning fixed comment texts. */
  function matchWithComments(
    issue: ReturnType<typeof makeIssue>,
    profiles: ReturnType<typeof makeProfile>[],
    commentTexts: string[],
  ) {
    const fetcher = async () => commentTexts;
    return new ProfileRouter(profiles, fetcher).match(issue);
  }

  it("matches when a comment contains the trigger string", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: ["DF"], keywords: [], commentTrigger: "@ralph" },
      }),
    ];
    const result = await matchWithComments(
      makeIssue("DF-1", "Some issue"),
      profiles,
      ["Please fix this", "@ralph please handle this"],
    );
    expect(result?.profile.id).toBe("ralph-triggered");
  });

  it("does not match when no comment contains the trigger", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: ["DF"], keywords: [], commentTrigger: "@ralph" },
      }),
    ];
    const result = await matchWithComments(
      makeIssue("DF-1", "Some issue"),
      profiles,
      ["Just a regular comment", "Nothing special here"],
    );
    expect(result).toBeNull();
  });

  it("matches case-insensitively on comment trigger", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: ["DF"], keywords: [], commentTrigger: "@Ralph" },
      }),
    ];
    const result = await matchWithComments(
      makeIssue("DF-1", "Some issue"),
      profiles,
      ["hey @RALPH do this"],
    );
    expect(result?.profile.id).toBe("ralph-triggered");
  });

  it("falls through to non-triggered variant when trigger not found", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: ["DF"], keywords: ["docs"], commentTrigger: "@ralph" },
      }),
      makeProfile({
        id: "ralph-catchall",
        match: { projects: ["DF"], keywords: ["docs"] },
      }),
    ];
    const result = await matchWithComments(
      makeIssue("DF-1", "Update docs please"),
      profiles,
      ["No trigger here"],
    );
    expect(result?.profile.id).toBe("ralph-catchall");
  });

  it("skips comment check when no fetcher is provided", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: ["DF"], keywords: [], commentTrigger: "@ralph" },
      }),
    ];
    const result = await new ProfileRouter(profiles).match(makeIssue("DF-1", "Some issue"));
    expect(result?.profile.id).toBe("ralph-triggered");
  });

  it("fetches comments only once per match call (cached)", async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return ["@ralph do it"];
    };
    const profiles = [
      makeProfile({
        id: "ralph-a",
        match: { projects: ["DF"], keywords: ["nope"], commentTrigger: "@ralph" },
      }),
      makeProfile({
        id: "ralph-b",
        match: { projects: ["DF"], keywords: [], commentTrigger: "@ralph" },
      }),
    ];
    const result = await new ProfileRouter(profiles, fetcher).match(
      makeIssue("DF-1", "Some issue"),
    );
    expect(result?.profile.id).toBe("ralph-b");
    expect(fetchCount).toBe(1);
  });

  it("combines commentTrigger with status and keyword filters", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-full",
        match: {
          projects: ["DF"],
          keywords: ["docs"],
          statuses: ["New"],
          commentTrigger: "@ralph",
        },
      }),
    ];
    const result = await matchWithComments(
      makeIssue("DF-1", "Update docs", "New"),
      profiles,
      ["@ralph go"],
    );
    expect(result?.profile.id).toBe("ralph-full");

    const noTrigger = await matchWithComments(
      makeIssue("DF-2", "Update docs", "New"),
      profiles,
      ["no trigger"],
    );
    expect(noTrigger).toBeNull();

    const wrongStatus = await matchWithComments(
      makeIssue("DF-3", "Update docs", "Done"),
      profiles,
      ["@ralph go"],
    );
    expect(wrongStatus).toBeNull();
  });
});
