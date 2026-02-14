import { describe, it, expect } from "vitest";
import { buildJqlFromProfiles } from "../src/jira/jql-builder.js";
import { makeProfile } from "./helpers.js";

describe("buildJqlFromProfiles", () => {
  it("builds JQL with keyword and statuses", () => {
    const profiles = [
      makeProfile({
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New", "To Do"], revisionStatuses: [] },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toBe(
      'project = DF AND summary ~ "Ralph" AND status IN ("New", "To Do") ORDER BY created ASC'
    );
  });

  it("builds catch-all JQL when keywords are empty", () => {
    const profiles = [
      makeProfile({ match: { projects: ["DF"], keywords: [], statuses: [], revisionStatuses: [] } }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries[0]).toBe("project = DF ORDER BY created ASC");
  });

  it("builds JQL with single status", () => {
    const profiles = [
      makeProfile({
        match: { projects: ["DOC"], keywords: ["RalphVsCode"], statuses: ["TODO"], revisionStatuses: [] },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries[0]).toBe(
      'project = DOC AND summary ~ "RalphVsCode" AND status = "TODO" ORDER BY created ASC'
    );
  });

  it("generates multiple queries for multiple profiles", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"], revisionStatuses: [] },
      }),
      makeProfile({
        id: "ralph-vscode",
        match: { projects: ["DOC"], keywords: ["RalphVsCode"], statuses: ["TODO"], revisionStatuses: [] },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(2);
    expect(queries).toContain(
      'project = DF AND summary ~ "Ralph" AND status = "New" ORDER BY created ASC'
    );
    expect(queries).toContain(
      'project = DOC AND summary ~ "RalphVsCode" AND status = "TODO" ORDER BY created ASC'
    );
  });

  it("deduplicates identical queries from overlapping profiles", () => {
    const profiles = [
      makeProfile({
        id: "ralph-docs",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"], revisionStatuses: [] },
      }),
      makeProfile({
        id: "ralph-docs-2",
        match: { projects: ["DF"], keywords: ["Ralph"], statuses: ["New"], revisionStatuses: [] },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(1);
  });

  it("generates queries for multi-project profiles", () => {
    const profiles = [
      makeProfile({
        match: { projects: ["DF", "DOC"], keywords: ["Ralph"], statuses: [], revisionStatuses: [] },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(2);
    expect(queries).toContain(
      'project = DF AND summary ~ "Ralph" ORDER BY created ASC'
    );
    expect(queries).toContain(
      'project = DOC AND summary ~ "Ralph" ORDER BY created ASC'
    );
  });

  it("handles multiple keywords with OR", () => {
    const profiles = [
      makeProfile({
        match: { projects: ["DF"], keywords: ["Ralph", "RalphAPI"], statuses: [], revisionStatuses: [] },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries[0]).toBe(
      'project = DF AND (summary ~ "Ralph" OR summary ~ "RalphAPI") ORDER BY created ASC'
    );
  });

  it("returns empty array for no profiles", () => {
    expect(buildJqlFromProfiles([])).toEqual([]);
  });

  it("combines statuses and revisionStatuses in status filter", () => {
    const profiles = [
      makeProfile({
        match: {
          projects: ["DF"],
          keywords: ["Ralph"],
          statuses: ["New", "To Do"],
          revisionStatuses: ["Defect Found"],
        },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toBe(
      'project = DF AND summary ~ "Ralph" AND status IN ("New", "To Do", "Defect Found") ORDER BY created ASC'
    );
  });

  it("uses revisionStatuses alone when statuses is empty", () => {
    const profiles = [
      makeProfile({
        match: {
          projects: ["DF"],
          keywords: [],
          statuses: [],
          revisionStatuses: ["Defect Found"],
        },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    expect(queries[0]).toBe(
      'project = DF AND status = "Defect Found" ORDER BY created ASC'
    );
  });

  it("deduplicates statuses appearing in both arrays for JQL generation", () => {
    const profiles = [
      makeProfile({
        match: {
          projects: ["DF"],
          keywords: [],
          statuses: ["New"],
          revisionStatuses: ["New"],
        },
      }),
    ];
    const queries = buildJqlFromProfiles(profiles);
    // Config validation rejects this case, but JQL builder still deduplicates gracefully
    expect(queries[0]).toBe('project = DF AND status = "New" ORDER BY created ASC');
  });
});
