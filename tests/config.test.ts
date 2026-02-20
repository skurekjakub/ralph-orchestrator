import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { readFileSync, readdirSync } from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    readdirSync: vi.fn(actual.readdirSync),
  };
});

const VALID_GLOBAL_CONFIG = JSON.stringify({
  jira: {
    baseUrl: "https://api.atlassian.com/ex/jira",
    cloudId: "test-cloud-id",
    pollIntervalMs: 60000,
  },
});

const VALID_PROFILE = JSON.stringify({
  repo: "/tmp/test-repo",
  variants: [
    {
      agent: "ralph",
      match: { projects: ["DF"], commentTrigger: "@ralph" },
      beforeAgent: { targetStatus: "In Progress" },
      afterAgent: { targetStatus: "Ready for Review" },
    },
  ],
});

function setRequiredEnv() {
  process.env.JIRA_PAT = "jira-token";
  process.env.JIRA_EMAIL = "test@test.com";
  process.env.GH_TOKEN = "gh-token";
  process.env.ADO_PAT = "ado-token";
}

const savedEnv: Record<string, string | undefined> = {};

function saveEnv() {
  for (const k of ["JIRA_PAT", "JIRA_EMAIL", "GH_TOKEN", "ADO_PAT"]) {
    savedEnv[k] = process.env[k];
  }
}

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Stub profile discovery with a single profile directory containing the given profile.json content. */
function stubProfiles(profileContent: string = VALID_PROFILE, dirName = "test-profile") {
  vi.mocked(readdirSync).mockReturnValue([
    { name: dirName, isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
  ] as ReturnType<typeof readdirSync>);

  vi.mocked(readFileSync).mockImplementation(((path: string) => {
    if (path.endsWith("config.json")) return VALID_GLOBAL_CONFIG;
    if (path.endsWith("profile.json")) return profileContent;
    throw new Error(`Unexpected readFileSync call: ${path}`);
  }) as typeof readFileSync);
}

describe("loadConfig", () => {
  beforeEach(() => {
    saveEnv();
    vi.mocked(readFileSync).mockReset();
    vi.mocked(readdirSync).mockReset();

    vi.mocked(readFileSync).mockReturnValue(VALID_GLOBAL_CONFIG);
    vi.mocked(readdirSync).mockReturnValue([
      { name: "ralph-docs", isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ] as ReturnType<typeof readdirSync>);

    vi.mocked(readFileSync).mockImplementation(((path: string) => {
      if (path.endsWith("config.json")) return VALID_GLOBAL_CONFIG;
      if (path.endsWith("profile.json")) return VALID_PROFILE;
      throw new Error(`Unexpected readFileSync: ${path}`);
    }) as typeof readFileSync);
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

  it("loads config with profiles from profiles/ directory", () => {
    setRequiredEnv();

    const config = loadConfig();

    expect(config.profiles.length).toBeGreaterThan(0);
    expect(config.profiles[0].id).toBe("ralph-docs");
    expect(config.profiles[0].repoPath).toBe("/tmp/test-repo");
    expect(config.profiles[0].agentName).toBe("ralph");
    expect(config.profiles[0].match).toBeDefined();
    expect(config.secrets.jiraPat).toBe("jira-token");
    expect(config.secrets.ghToken).toBe("gh-token");
    expect(config.secrets.adoPat).toBe("ado-token");
  });

  it("throws when no profile directories exist", () => {
    setRequiredEnv();
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    expect(() => loadConfig()).toThrow("No profile directories found");
  });

  it("Zod rejects config with invalid jira.baseUrl", () => {
    setRequiredEnv();

    vi.mocked(readFileSync).mockImplementation(((path: string) => {
      if (path.endsWith("config.json")) return JSON.stringify({
        jira: { baseUrl: "not-a-url", cloudId: "abc" },
      });
      if (path.endsWith("profile.json")) return VALID_PROFILE;
      throw new Error(`Unexpected: ${path}`);
    }) as typeof readFileSync);

    expect(() => loadConfig()).toThrow("baseUrl");
  });

  it("resolves ~ in profile repo paths", () => {
    setRequiredEnv();
    stubProfiles(JSON.stringify({
      repo: "~/repositories/test",
      variants: [{ agent: "ralph", match: { projects: ["DF"], commentTrigger: "@ralph" }, beforeAgent: { targetStatus: "In Progress" }, afterAgent: { targetStatus: "Ready for Review" } }],
    }));

    const config = loadConfig();

    for (const profile of config.profiles) {
      expect(profile.repoPath).toMatch(/^\//);
      expect(profile.repoPath).not.toContain("~");
    }
  });

  it("rejects variants with missing commentTrigger", () => {
    setRequiredEnv();
    stubProfiles(JSON.stringify({
      repo: "/tmp/test",
      variants: [{
        agent: "ralph",
        match: {
          projects: ["DF"],
          statuses: ["New"],
        },
      }],
    }));

    expect(() => loadConfig()).toThrow("commentTrigger");
  });

  it("explodes multiple variants into separate profiles", () => {
    setRequiredEnv();
    stubProfiles(JSON.stringify({
      repo: "/tmp/test",
      variants: [
        { agent: "ralph.docs", match: { projects: ["DOCS"], commentTrigger: "@RalphDocs" }, beforeAgent: { targetStatus: "In Progress" }, afterAgent: { targetStatus: "Ready for Review" } },
        { agent: "ralph", match: { projects: ["DF"], commentTrigger: "@Ralph" }, beforeAgent: { targetStatus: "In Progress" }, afterAgent: { targetStatus: "Ready for Review" } },
      ],
    }));

    const config = loadConfig();

    expect(config.profiles).toHaveLength(2);
    expect(config.profiles[0].agentName).toBe("ralph.docs");
    expect(config.profiles[0].match.projects).toEqual(["DOCS"]);
    expect(config.profiles[1].agentName).toBe("ralph");
    expect(config.profiles[1].match.projects).toEqual(["DF"]);
    expect(config.profiles[0].id).toBe(config.profiles[1].id);
  });

  describe("per-variant model override", () => {
    it("variant model overrides profile-level model", () => {
      setRequiredEnv();
      stubProfiles(JSON.stringify({
        repo: "/tmp/test",
        model: "claude-sonnet-4",
        variants: [
          { agent: "ralph", model: "claude-opus-4.6", match: { projects: ["DF"], commentTrigger: "@ralph" }, beforeAgent: { targetStatus: "In Progress" }, afterAgent: { targetStatus: "Ready for Review" } },
        ],
      }));

      const config = loadConfig();

      expect(config.profiles[0].model).toBe("claude-opus-4.6");
    });

    it("variant without model falls back to profile-level model", () => {
      setRequiredEnv();
      stubProfiles(JSON.stringify({
        repo: "/tmp/test",
        model: "claude-sonnet-4",
        variants: [
          { agent: "ralph", match: { projects: ["DF"], commentTrigger: "@ralph" }, beforeAgent: { targetStatus: "In Progress" }, afterAgent: { targetStatus: "Ready for Review" } },
        ],
      }));

      const config = loadConfig();

      expect(config.profiles[0].model).toBe("claude-sonnet-4");
    });

    it("model is undefined when both variant and profile omit it", () => {
      setRequiredEnv();
      stubProfiles(JSON.stringify({
        repo: "/tmp/test",
        variants: [
          { agent: "ralph", match: { projects: ["DF"], commentTrigger: "@ralph" }, beforeAgent: { targetStatus: "In Progress" }, afterAgent: { targetStatus: "Ready for Review" } },
        ],
      }));

      const config = loadConfig();

      expect(config.profiles[0].model).toBeUndefined();
    });

    it("multiple variants resolve model overrides independently", () => {
      setRequiredEnv();
      stubProfiles(JSON.stringify({
        repo: "/tmp/test",
        model: "claude-sonnet-4",
        variants: [
          { agent: "ralph.docs", model: "claude-opus-4.6", match: { projects: ["DOCS"], commentTrigger: "@RalphDocs" }, beforeAgent: { targetStatus: "In Progress" }, afterAgent: { targetStatus: "Ready for Review" } },
          { agent: "ralph.probe", match: { projects: ["DF"], commentTrigger: "@McpProbe" }, beforeAgent: { targetStatus: "In Progress" }, afterAgent: { targetStatus: "Ready for Review" } },
        ],
      }));

      const config = loadConfig();

      expect(config.profiles[0].model).toBe("claude-opus-4.6");
      expect(config.profiles[1].model).toBe("claude-sonnet-4");
    });
  });
});
