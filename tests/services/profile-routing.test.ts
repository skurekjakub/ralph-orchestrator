import { describe, it, expect } from "vitest";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { makeIssue, makeProfile } from "../helpers/factories.js";

/** Convenience wrapper — matches a single issue against a list of profiles. */
function matchProfile(
  issue: ReturnType<typeof makeIssue>,
  profiles: ReturnType<typeof makeProfile>[],
) {
  return new ProfileRouter({ profiles }).match(issue);
}

describe("Profile routing", () => {
  it("matches issue to profile by project", async () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], statuses: [], commentTrigger: "@docs" } }),
      makeProfile({ id: "ralph-vscode", match: { projects: ["DOC"], statuses: [], commentTrigger: "@vscode" } }),
    ];
    const issue = makeIssue("DF-100", "Update API reference");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("returns null when no profile matches project", async () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], statuses: [], commentTrigger: "@ralph" } }),
    ];
    const issue = makeIssue("XP-100", "wrong project");
    expect(await matchProfile(issue, profiles)).toBeNull();
  });

  it("first matching profile wins (order matters)", async () => {
    const profiles = [
      makeProfile({ id: "ralph-docs", match: { projects: ["DF"], statuses: [], commentTrigger: "@docs" } }),
      makeProfile({ id: "ralph-default", match: { projects: ["DF"], statuses: [], commentTrigger: "@default" } }),
    ];
    const issue = makeIssue("DF-100", "should match first");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("returns the matched profile", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], statuses: ["New"], commentTrigger: "@ralph" },
      }),
    ];
    const result = await matchProfile(makeIssue("DF-1", "docs", "New"), profiles);
    expect(result?.profile.id).toBe("ralph-docs");
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
        match: { projects: ["DF"], statuses: ["New"], commentTrigger: "@ralph" },
      }),
    ];
    const issue = makeIssue("DF-100", "update docs", "New");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("rejects issue when status is not in allowed statuses", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], statuses: ["New"], commentTrigger: "@ralph" },
      }),
    ];
    const issue = makeIssue("DF-100", "update docs", "In Progress");
    expect(await matchProfile(issue, profiles)).toBeNull();
  });

  it("skips status filter when statuses is empty", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], statuses: [], commentTrigger: "@ralph" },
      }),
    ];
    const issue = makeIssue("DF-100", "update docs", "In Progress");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe("ralph-docs");
  });

  it("matches any of multiple allowed statuses", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], statuses: ["New", "TODO"], commentTrigger: "@ralph" },
      }),
    ];
    expect((await matchProfile(makeIssue("DF-1", "x", "New"), profiles))?.profile.id).toBe("ralph-docs");
    expect((await matchProfile(makeIssue("DF-2", "y", "TODO"), profiles))?.profile.id).toBe("ralph-docs");
    expect(await matchProfile(makeIssue("DF-3", "z", "Done"), profiles)).toBeNull();
  });

  it("routes to different profiles based on status and project", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], statuses: ["New"], commentTrigger: "@docs" },
      }),
      makeProfile({
        id: "ralph-vscode",
        match: { projects: ["DOC"], statuses: ["TODO"], commentTrigger: "@vscode" },
      }),
    ];

    expect((await matchProfile(makeIssue("DF-1", "docs", "New"), profiles))?.profile.id).toBe("ralph-docs");
    expect((await matchProfile(makeIssue("DOC-1", "ext", "TODO"), profiles))?.profile.id).toBe("ralph-vscode");
    expect(await matchProfile(makeIssue("DOC-1", "ext", "New"), profiles)).toBeNull();
    expect(await matchProfile(makeIssue("DF-1", "docs", "TODO"), profiles)).toBeNull();
  });

  it("matches status case-insensitively", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], statuses: ["Defect Found"], commentTrigger: "@ralph" },
      }),
    ];
    const result = await matchProfile(makeIssue("DF-1", "docs", "defect found"), profiles);
    expect(result?.profile.id).toBe("ralph-docs");
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
    return new ProfileRouter({ profiles }, fetcher).match(issue);
  }

  it("matches when a comment contains the trigger string", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: ["DF"], statuses: [], commentTrigger: "@ralph" },
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
        match: { projects: ["DF"], statuses: [], commentTrigger: "@ralph" },
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
        match: { projects: ["DF"], statuses: [], commentTrigger: "@Ralph" },
      }),
    ];
    const result = await matchWithComments(
      makeIssue("DF-1", "Some issue"),
      profiles,
      ["hey @RALPH do this"],
    );
    expect(result?.profile.id).toBe("ralph-triggered");
  });

  it("falls through to next variant when trigger not found", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: ["DF"], statuses: [], commentTrigger: "@ralph" },
      }),
      makeProfile({
        id: "ralph-catchall",
        match: { projects: ["DF"], statuses: [], commentTrigger: "@catchall" },
      }),
    ];
    const result = await matchWithComments(
      makeIssue("DF-1", "Some issue"),
      profiles,
      ["@catchall handle this"],
    );
    expect(result?.profile.id).toBe("ralph-catchall");
  });

  it("skips comment check when no fetcher is provided", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: ["DF"], statuses: [], commentTrigger: "@ralph" },
      }),
    ];
    const result = await new ProfileRouter({ profiles }).match(makeIssue("DF-1", "Some issue"));
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
        match: { projects: ["DOC"], statuses: [], commentTrigger: "@ralph" },
      }),
      makeProfile({
        id: "ralph-b",
        match: { projects: ["DF"], statuses: [], commentTrigger: "@ralph" },
      }),
    ];
    const result = await new ProfileRouter({ profiles }, fetcher).match(
      makeIssue("DF-1", "Some issue"),
    );
    expect(result?.profile.id).toBe("ralph-b");
    expect(fetchCount).toBe(1);
  });

  it("combines commentTrigger with status filters", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-full",
        match: {
          projects: ["DF"],
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
