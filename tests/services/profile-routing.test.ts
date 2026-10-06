import { describe, it, expect } from "vitest";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { makeWorkItem, makeProfile } from "../helpers/factories.js";
const PROJECT = "DF";
const KEY = "DF-1";
const PID = "ralph-docs";
const TRIGGER = "@ralph";

/** Convenience wrapper — matches a single issue against a list of profiles. */
function matchProfile(issue: ReturnType<typeof makeWorkItem>, profiles: ReturnType<typeof makeProfile>[]) {
  return new ProfileRouter({ profiles }).match(issue);
}

describe("Profile routing", () => {
  it("matches issue to profile by project", async () => {
    const profiles = [
      makeProfile({ id: PID, match: { projects: [PROJECT], statuses: [], commentTrigger: "@docs" } }),
      makeProfile({ id: "ralph-vscode", match: { projects: ["DOC"], statuses: [], commentTrigger: "@vscode" } }),
    ];
    const issue = makeWorkItem("DF-100", "Update API reference");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe(PID);
  });

  it("returns null when no profile matches project", async () => {
    const profiles = [makeProfile({ id: PID, match: { projects: [PROJECT], statuses: [], commentTrigger: TRIGGER } })];
    const issue = makeWorkItem("XP-100", "wrong project");
    expect(await matchProfile(issue, profiles)).toBeNull();
  });

  it("first matching profile wins (order matters)", async () => {
    const profiles = [
      makeProfile({ id: PID, match: { projects: [PROJECT], statuses: [], commentTrigger: "@docs" } }),
      makeProfile({ id: "ralph-default", match: { projects: [PROJECT], statuses: [], commentTrigger: "@default" } }),
    ];
    const issue = makeWorkItem("DF-100", "should match first");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe(PID);
  });

  it("returns the matched profile", async () => {
    const profiles = [
      makeProfile({
        id: PID,
        match: { projects: [PROJECT], statuses: ["New"], commentTrigger: TRIGGER },
      }),
    ];
    const result = await matchProfile(makeWorkItem(KEY, "docs", "New"), profiles);
    expect(result?.profile.id).toBe(PID);
  });

  it("includes profileIds in config", () => {
    const profiles = [makeProfile({ id: PID }), makeProfile({ id: "ralph-vscode" })];
    expect(profiles.map((p) => p.id)).toEqual([PID, "ralph-vscode"]);
  });
});

describe("Profile status filtering", () => {
  it("matches issue when status is in allowed statuses", async () => {
    const profiles = [
      makeProfile({
        id: PID,
        match: { projects: [PROJECT], statuses: ["New"], commentTrigger: TRIGGER },
      }),
    ];
    const issue = makeWorkItem("DF-100", "update docs", "New");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe(PID);
  });

  it("rejects issue when status is not in allowed statuses", async () => {
    const profiles = [
      makeProfile({
        id: PID,
        match: { projects: [PROJECT], statuses: ["New"], commentTrigger: TRIGGER },
      }),
    ];
    const issue = makeWorkItem("DF-100", "update docs", "In Progress");
    expect(await matchProfile(issue, profiles)).toBeNull();
  });

  it("skips status filter when statuses is empty", async () => {
    const profiles = [
      makeProfile({
        id: PID,
        match: { projects: [PROJECT], statuses: [], commentTrigger: TRIGGER },
      }),
    ];
    const issue = makeWorkItem("DF-100", "update docs", "In Progress");
    expect((await matchProfile(issue, profiles))?.profile.id).toBe(PID);
  });

  it("matches any of multiple allowed statuses", async () => {
    const profiles = [
      makeProfile({
        id: PID,
        match: { projects: [PROJECT], statuses: ["New", "TODO"], commentTrigger: TRIGGER },
      }),
    ];
    expect((await matchProfile(makeWorkItem(KEY, "x", "New"), profiles))?.profile.id).toBe(PID);
    expect((await matchProfile(makeWorkItem("DF-2", "y", "TODO"), profiles))?.profile.id).toBe(PID);
    expect(await matchProfile(makeWorkItem("DF-3", "z", "Done"), profiles)).toBeNull();
  });

  it("routes to different profiles based on status and project", async () => {
    const profiles = [
      makeProfile({
        id: PID,
        match: { projects: [PROJECT], statuses: ["New"], commentTrigger: "@docs" },
      }),
      makeProfile({
        id: "ralph-vscode",
        match: { projects: ["DOC"], statuses: ["TODO"], commentTrigger: "@vscode" },
      }),
    ];

    expect((await matchProfile(makeWorkItem(KEY, "docs", "New"), profiles))?.profile.id).toBe(PID);
    expect((await matchProfile(makeWorkItem("DOC-1", "ext", "TODO"), profiles))?.profile.id).toBe("ralph-vscode");
    expect(await matchProfile(makeWorkItem("DOC-1", "ext", "New"), profiles)).toBeNull();
    expect(await matchProfile(makeWorkItem(KEY, "docs", "TODO"), profiles)).toBeNull();
  });

  it("matches status case-insensitively", async () => {
    const profiles = [
      makeProfile({
        id: PID,
        match: { projects: [PROJECT], statuses: ["Defect Found"], commentTrigger: TRIGGER },
      }),
    ];
    const result = await matchProfile(makeWorkItem(KEY, "docs", "defect found"), profiles);
    expect(result?.profile.id).toBe(PID);
  });
});

describe("Comment trigger matching", () => {
  /** Helper that builds a router with a comment fetcher returning fixed comment texts. */
  function matchWithComments(
    issue: ReturnType<typeof makeWorkItem>,
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
        match: { projects: [PROJECT], statuses: [], commentTrigger: TRIGGER },
      }),
    ];
    const result = await matchWithComments(makeWorkItem(KEY, "Some issue"), profiles, [
      "Please fix this",
      "@ralph please handle this",
    ]);
    expect(result?.profile.id).toBe("ralph-triggered");
  });

  it("does not match when no comment contains the trigger", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: [PROJECT], statuses: [], commentTrigger: TRIGGER },
      }),
    ];
    const result = await matchWithComments(makeWorkItem(KEY, "Some issue"), profiles, [
      "Just a regular comment",
      "Nothing special here",
    ]);
    expect(result).toBeNull();
  });

  it("matches case-insensitively on comment trigger", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: [PROJECT], statuses: [], commentTrigger: "@Ralph" },
      }),
    ];
    const result = await matchWithComments(makeWorkItem(KEY, "Some issue"), profiles, ["hey @RALPH do this"]);
    expect(result?.profile.id).toBe("ralph-triggered");
  });

  it("falls through to next variant when trigger not found", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: [PROJECT], statuses: [], commentTrigger: TRIGGER },
      }),
      makeProfile({
        id: "ralph-catchall",
        match: { projects: [PROJECT], statuses: [], commentTrigger: "@catchall" },
      }),
    ];
    const result = await matchWithComments(makeWorkItem(KEY, "Some issue"), profiles, ["@catchall handle this"]);
    expect(result?.profile.id).toBe("ralph-catchall");
  });

  it("skips comment check when no fetcher is provided", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-triggered",
        match: { projects: [PROJECT], statuses: [], commentTrigger: TRIGGER },
      }),
    ];
    const result = await new ProfileRouter({ profiles }).match(makeWorkItem(KEY, "Some issue"));
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
        match: { projects: ["DOC"], statuses: [], commentTrigger: TRIGGER },
      }),
      makeProfile({
        id: "ralph-b",
        match: { projects: [PROJECT], statuses: [], commentTrigger: TRIGGER },
      }),
    ];
    const result = await new ProfileRouter({ profiles }, fetcher).match(makeWorkItem(KEY, "Some issue"));
    expect(result?.profile.id).toBe("ralph-b");
    expect(fetchCount).toBe(1);
  });

  it("combines commentTrigger with status filters", async () => {
    const profiles = [
      makeProfile({
        id: "ralph-full",
        match: {
          projects: [PROJECT],
          statuses: ["New"],
          commentTrigger: TRIGGER,
        },
      }),
    ];
    const result = await matchWithComments(makeWorkItem(KEY, "Update docs", "New"), profiles, ["@ralph go"]);
    expect(result?.profile.id).toBe("ralph-full");

    const noTrigger = await matchWithComments(makeWorkItem("DF-2", "Update docs", "New"), profiles, ["no trigger"]);
    expect(noTrigger).toBeNull();

    const wrongStatus = await matchWithComments(makeWorkItem("DF-3", "Update docs", "Done"), profiles, ["@ralph go"]);
    expect(wrongStatus).toBeNull();
  });
});
