import { describe, it, expect, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { readFileSync } from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

describe("loadConfig", () => {
  it("throws when JIRA credentials are missing", () => {
    const origPat = process.env.JIRA_PAT;
    const origEmail = process.env.JIRA_EMAIL;
    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;

    expect(() => loadConfig()).toThrow("JIRA_PAT");

    if (origPat) process.env.JIRA_PAT = origPat;
    if (origEmail) process.env.JIRA_EMAIL = origEmail;
  });

  it("throws when GH_TOKEN is missing", () => {
    process.env.JIRA_PAT = "test";
    process.env.JIRA_EMAIL = "test@test.com";
    const origGh = process.env.GH_TOKEN;
    delete process.env.GH_TOKEN;

    expect(() => loadConfig()).toThrow("GH_TOKEN");

    if (origGh) process.env.GH_TOKEN = origGh;
  });

  it("loads config successfully with profiles", () => {
    process.env.JIRA_PAT = "jira-token";
    process.env.JIRA_EMAIL = "test@test.com";
    process.env.GH_TOKEN = "gh-token";
    process.env.ADO_PAT_DOCS = "ado-token";

    const config = loadConfig();

    // Should have profiles from config.json
    expect(config.profiles.length).toBeGreaterThan(0);
    expect(config.profiles[0].id).toBeDefined();
    expect(config.profiles[0].repoPath).toBeDefined();
    expect(config.profiles[0].match).toBeDefined();
    expect(config.secrets.jiraPat).toBe("jira-token");
    expect(config.secrets.ghToken).toBe("gh-token");
    expect(config.secrets.adoPatDocs).toBe("ado-token");

    // Cleanup
    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;
    delete process.env.GH_TOKEN;
    delete process.env.ADO_PAT_DOCS;
  });

  it("Zod rejects config with missing required fields", () => {
    process.env.JIRA_PAT = "jira-token";
    process.env.JIRA_EMAIL = "test@test.com";
    process.env.GH_TOKEN = "gh-token";
    process.env.ADO_PAT_DOCS = "ado-token";

    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({
      jira: { baseUrl: "https://api.atlassian.com/ex/jira", cloudId: "abc" },
      profiles: [],
    }));

    expect(() => loadConfig()).toThrow("At least one agent profile");

    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;
    delete process.env.GH_TOKEN;
    delete process.env.ADO_PAT_DOCS;
  });

  it("Zod rejects config with invalid jira.baseUrl", () => {
    process.env.JIRA_PAT = "jira-token";
    process.env.JIRA_EMAIL = "test@test.com";
    process.env.GH_TOKEN = "gh-token";
    process.env.ADO_PAT_DOCS = "ado-token";

    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({
      jira: {
        baseUrl: "not-a-url",
        cloudId: "abc",
      },
      profiles: [{ id: "test", repo: "/tmp/test", match: { projects: ["X"] }, transitions: { inProgressId: "1", readyForReviewId: "2" } }],
    }));

    expect(() => loadConfig()).toThrow("baseUrl");

    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;
    delete process.env.GH_TOKEN;
    delete process.env.ADO_PAT_DOCS;
  });

  it("resolves ~ in profile repo paths", () => {
    process.env.JIRA_PAT = "jira-token";
    process.env.JIRA_EMAIL = "test@test.com";
    process.env.GH_TOKEN = "gh-token";
    process.env.ADO_PAT_DOCS = "ado-token";

    const config = loadConfig();

    for (const profile of config.profiles) {
      // All resolved paths should be absolute (no ~)
      expect(profile.repoPath).toMatch(/^\//);
      expect(profile.repoPath).not.toContain("~");
    }

    // Cleanup
    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;
    delete process.env.GH_TOKEN;
    delete process.env.ADO_PAT_DOCS;
  });

  it("rejects profiles with overlapping statuses and revisionStatuses", () => {
    process.env.JIRA_PAT = "jira-token";
    process.env.JIRA_EMAIL = "test@test.com";
    process.env.GH_TOKEN = "gh-token";
    process.env.ADO_PAT_DOCS = "ado-token";

    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({
      jira: {
        baseUrl: "https://api.atlassian.com/ex/jira",
        cloudId: "abc",
      },
      profiles: [{
        id: "test",
        repo: "/tmp/test",
        match: {
          projects: ["DF"],
          statuses: ["New", "To Do"],
          revisionStatuses: ["To Do"],
        },
        transitions: { inProgressId: "1", readyForReviewId: "2" },
      }],
    }));

    expect(() => loadConfig()).toThrow("statuses and revisionStatuses must not overlap");

    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;
    delete process.env.GH_TOKEN;
    delete process.env.ADO_PAT_DOCS;
  });
});
