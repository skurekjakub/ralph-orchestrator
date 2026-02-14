import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { readFileSync } from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const VALID_CONFIG = JSON.stringify({
  jira: {
    baseUrl: "https://api.atlassian.com/ex/jira",
    cloudId: "test-cloud-id",
    pollIntervalMs: 60000,
  },
  profiles: [{
    id: "ralph-docs",
    repo: "/tmp/test-repo",
    match: { projects: ["DF"] },
    transitions: { inProgressId: "141", readyForReviewId: "91" },
  }],
});

function setRequiredEnv() {
  process.env.JIRA_PAT = "jira-token";
  process.env.JIRA_EMAIL = "test@test.com";
  process.env.GH_TOKEN = "gh-token";
  process.env.ADO_PAT_DOCS = "ado-token";
}

const savedEnv: Record<string, string | undefined> = {};

function saveEnv() {
  for (const k of ["JIRA_PAT", "JIRA_EMAIL", "GH_TOKEN", "ADO_PAT_DOCS"]) {
    savedEnv[k] = process.env[k];
  }
}

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("loadConfig", () => {
  beforeEach(() => {
    saveEnv();
    vi.mocked(readFileSync).mockReset();
    vi.mocked(readFileSync).mockReturnValue(VALID_CONFIG);
  });

  afterEach(() => {
    restoreEnv();
  });

  it("throws when JIRA credentials are missing", () => {
    delete process.env.JIRA_PAT;
    delete process.env.JIRA_EMAIL;

    expect(() => loadConfig()).toThrow("JIRA_PAT");
  });

  it("throws when GH_TOKEN is missing", () => {
    process.env.JIRA_PAT = "test";
    process.env.JIRA_EMAIL = "test@test.com";
    delete process.env.GH_TOKEN;

    expect(() => loadConfig()).toThrow("GH_TOKEN");
  });

  it("loads config successfully with profiles", () => {
    setRequiredEnv();

    const config = loadConfig();

    expect(config.profiles.length).toBeGreaterThan(0);
    expect(config.profiles[0].id).toBe("ralph-docs");
    expect(config.profiles[0].repoPath).toBe("/tmp/test-repo");
    expect(config.profiles[0].match).toBeDefined();
    expect(config.secrets.jiraPat).toBe("jira-token");
    expect(config.secrets.ghToken).toBe("gh-token");
    expect(config.secrets.adoPatDocs).toBe("ado-token");
  });

  it("Zod rejects config with missing required fields", () => {
    setRequiredEnv();

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      jira: { baseUrl: "https://api.atlassian.com/ex/jira", cloudId: "abc" },
      profiles: [],
    }));

    expect(() => loadConfig()).toThrow("At least one agent profile");
  });

  it("Zod rejects config with invalid jira.baseUrl", () => {
    setRequiredEnv();

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      jira: { baseUrl: "not-a-url", cloudId: "abc" },
      profiles: [{ id: "test", repo: "/tmp/test", match: { projects: ["X"] }, transitions: { inProgressId: "1", readyForReviewId: "2" } }],
    }));

    expect(() => loadConfig()).toThrow("baseUrl");
  });

  it("resolves ~ in profile repo paths", () => {
    setRequiredEnv();

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      jira: { baseUrl: "https://api.atlassian.com/ex/jira", cloudId: "abc" },
      profiles: [{
        id: "test",
        repo: "~/repositories/test",
        match: { projects: ["DF"] },
        transitions: { inProgressId: "1", readyForReviewId: "2" },
      }],
    }));

    const config = loadConfig();

    for (const profile of config.profiles) {
      expect(profile.repoPath).toMatch(/^\//);
      expect(profile.repoPath).not.toContain("~");
    }
  });

  it("rejects profiles with overlapping statuses and revisionStatuses", () => {
    setRequiredEnv();

    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      jira: { baseUrl: "https://api.atlassian.com/ex/jira", cloudId: "abc" },
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
  });
});
