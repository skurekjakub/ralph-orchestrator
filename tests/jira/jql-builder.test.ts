import { describe, it, expect } from "vitest";
import { buildJqlFromProfiles } from "../../src/jira/jql-builder.js";
import { makeProfile } from "../helpers/factories.js";
const PROJECT_DOC = "DOC";
const PROJECT = "DF";
const TRIGGER = "@ralph";

describe("buildJqlFromProfiles", () => {
  it("builds JQL with statuses", () => {
    const profiles = [
      makeProfile({
        match: { projects: [PROJECT], statuses: ["New", "To Do"], commentTrigger: TRIGGER },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toBe(
      'project = "DF" AND status IN ("New", "To Do") ORDER BY created ASC'
    );
  });

  it("builds catch-all JQL when statuses are empty", () => {
    const profiles = [
      makeProfile({ match: { projects: [PROJECT], statuses: [], commentTrigger: TRIGGER } }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries[0]).toBe('project = "DF" ORDER BY created ASC');
  });

  it("builds JQL with single status", () => {
    const profiles = [
      makeProfile({
        match: { projects: [PROJECT_DOC], statuses: ["TODO"], commentTrigger: TRIGGER },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries[0]).toBe(
      'project = "DOC" AND status = "TODO" ORDER BY created ASC'
    );
  });

  it("generates multiple queries for multiple profiles", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: [PROJECT], statuses: ["New"], commentTrigger: "@docs" },
      }),
      makeProfile({
        id: "ralph-vscode",
        match: { projects: [PROJECT_DOC], statuses: ["TODO"], commentTrigger: "@vscode" },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(2);
    expect(queries).toContain(
      'project = "DF" AND status = "New" ORDER BY created ASC'
    );
    expect(queries).toContain(
      'project = "DOC" AND status = "TODO" ORDER BY created ASC'
    );
  });

  it("deduplicates identical queries from overlapping profiles", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: [PROJECT], statuses: ["New"], commentTrigger: "@docs" },
      }),
      makeProfile({
        id: "ralph-docs-2",
        match: { projects: [PROJECT], statuses: ["New"], commentTrigger: "@docs2" },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(1);
  });

  it("generates queries for multi-project profiles", () => {
    const profiles = [
      makeProfile({
        match: { projects: [PROJECT, PROJECT_DOC], statuses: [], commentTrigger: TRIGGER },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(2);
    expect(queries).toContain(
      'project = "DF" ORDER BY created ASC'
    );
    expect(queries).toContain(
      'project = "DOC" ORDER BY created ASC'
    );
  });

  it("returns empty array for no profiles", () => {
    expect(buildJqlFromProfiles([])).toEqual([]);
  });

  it("deduplicates statuses within a profile", () => {
    const profiles = [
      makeProfile({
        match: {
          projects: [PROJECT],
          statuses: ["New", "New"],
          commentTrigger: TRIGGER,
        },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries[0]).toBe('project = "DF" AND status = "New" ORDER BY created ASC');
  });
});
