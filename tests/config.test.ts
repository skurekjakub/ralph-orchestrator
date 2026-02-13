import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("throws when RALPH_REPO_PATH is not set", () => {
    const original = process.env.RALPH_REPO_PATH;
    delete process.env.RALPH_REPO_PATH;

    expect(() => loadConfig()).toThrow("RALPH_REPO_PATH");

    if (original) process.env.RALPH_REPO_PATH = original;
  });

  it("throws when JIRA credentials are missing", () => {
    process.env.RALPH_REPO_PATH = "/tmp/test";
    const origPat = process.env.JIRA_PAT;
    const origEmail = process.env.JIRA_EMAIL;
    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;

    expect(() => loadConfig()).toThrow("JIRA_PAT");

    if (origPat) process.env.JIRA_PAT = origPat;
    if (origEmail) process.env.JIRA_EMAIL = origEmail;
  });

  it("throws when GH_TOKEN is missing", () => {
    process.env.RALPH_REPO_PATH = "/tmp/test";
    process.env.JIRA_PAT = "test";
    process.env.JIRA_EMAIL = "test@test.com";
    const origGh = process.env.GH_TOKEN;
    delete process.env.GH_TOKEN;

    expect(() => loadConfig()).toThrow("GH_TOKEN");

    if (origGh) process.env.GH_TOKEN = origGh;
  });

  it("loads config successfully when all env vars are set", () => {
    process.env.RALPH_REPO_PATH = "/tmp/test";
    process.env.JIRA_PAT = "jira-token";
    process.env.JIRA_EMAIL = "test@test.com";
    process.env.GH_TOKEN = "gh-token";
    process.env.ADO_PAT_DOCS = "ado-token";

    const config = loadConfig();

    expect(config.ralph.repoPath).toBe("/tmp/test");
    expect(config.jira.project).toBe("DF");
    expect(config.secrets.jiraPat).toBe("jira-token");
    expect(config.secrets.ghToken).toBe("gh-token");
    expect(config.secrets.adoPatDocs).toBe("ado-token");

    // Cleanup
    delete process.env.RALPH_REPO_PATH;
    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;
    delete process.env.GH_TOKEN;
    delete process.env.ADO_PAT_DOCS;
  });
});
