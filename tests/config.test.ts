import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config/loader";
import { ClaudeAuthMode } from "../src/config/types";
import { readFileSync, readdirSync } from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    readdirSync: vi.fn(actual.readdirSync),
  };
});

const PROJECT = "DF";
const TRIGGER = "@ralph";

const VALID_GLOBAL_CONFIG = JSON.stringify({
  dataSources: {
    "test-source": {
      type: "jira",
      connection: {
        baseUrl: "https://api.atlassian.com/ex/jira",
        cloudId: "test-cloud-id",
      },
      pollIntervalMs: 60000,
    },
  },
});

const VALID_PROFILE = JSON.stringify({
  repo: "/tmp/test-repo",
  dataSource: "test-source",
  variants: [
    {
      stages: [{ agent: "ralph", role: "primary" }],
      match: { projects: [PROJECT], commentTrigger: TRIGGER },
      beforeAgent: { targetStatus: "In Progress" },
      afterAgent: { targetStatus: "Ready for Review" },
    },
  ],
});

const ENV_KEYS = ["JIRA_PAT_TEST_SOURCE", "JIRA_EMAIL_TEST_SOURCE", "GH_TOKEN", "ADO_PAT", "CLAUDE_CODE_OAUTH_TOKEN"];

function setRequiredEnv() {
  process.env.JIRA_PAT_TEST_SOURCE = "jira-token";
  process.env.JIRA_EMAIL_TEST_SOURCE = "test@test.com";
  process.env.GH_TOKEN = "gh-token";
  process.env.ADO_PAT = "ado-token";
}

const savedEnv: Record<string, string | undefined> = {};

function saveEnv() {
  for (const k of ENV_KEYS) {
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

  vi.mocked(readFileSync).mockImplementation((p) => {
    const path = String(p);
    if (path.endsWith("config.json")) return VALID_GLOBAL_CONFIG;
    if (path.endsWith("profile.json")) return profileContent;
    throw new Error(`Unexpected readFileSync call: ${path}`);
  });
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

    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.endsWith("config.json")) return VALID_GLOBAL_CONFIG;
      if (path.endsWith("profile.json")) return VALID_PROFILE;
      throw new Error(`Unexpected readFileSync: ${path}`);
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it("loads without GH_TOKEN, leaving the credential requirement to startup validation", () => {
    // Arrange
    setRequiredEnv();
    delete process.env.GH_TOKEN;

    // Act
    const config = loadConfig();

    // Assert
    expect(config.secrets.ghToken).toBe("");
  });

  it("defaults claudeAuth to the OAuth token and reads CLAUDE_CODE_OAUTH_TOKEN", () => {
    // Arrange
    setRequiredEnv();
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token";

    // Act
    const config = loadConfig();

    // Assert
    expect(config.claudeAuth).toBe(ClaudeAuthMode.OAuthToken);
    expect(config.secrets.claudeCodeOauthToken).toBe("oauth-token");
  });

  it("reads claudeAuth from config.json", () => {
    // Arrange
    setRequiredEnv();
    const configWithApiKey = JSON.stringify({ ...JSON.parse(VALID_GLOBAL_CONFIG), claudeAuth: "api-key" });
    vi.mocked(readFileSync).mockImplementation((p) =>
      String(p).endsWith("config.json") ? configWithApiKey : VALID_PROFILE,
    );

    // Act
    const config = loadConfig();

    // Assert
    expect(config.claudeAuth).toBe(ClaudeAuthMode.ApiKey);
  });

  it("loads config with profiles from profiles/ directory", () => {
    setRequiredEnv();

    const config = loadConfig();

    expect(config.profiles.length).toBeGreaterThan(0);
    expect(config.profiles[0].id).toBe("ralph-docs");
    expect(config.profiles[0].repoPath).toBe("/tmp/test-repo");
    expect(config.profiles[0].agentName).toBe("ralph");
    expect(config.profiles[0].match).toBeDefined();
    expect(config.profiles[0].dataSource).toBe("test-source");
    expect(config.secrets.ghToken).toBe("gh-token");
    expect(config.secrets.adoPat).toBe("ado-token");
  });

  it("throws when no profile directories exist", () => {
    setRequiredEnv();
    vi.mocked(readdirSync).mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    expect(() => loadConfig()).toThrow("No profile directories found");
  });

  it("resolves ~ in profile repo paths", () => {
    setRequiredEnv();
    stubProfiles(
      JSON.stringify({
        repo: "~/repositories/test",
        dataSource: "test-source",
        variants: [
          {
            stages: [{ agent: "ralph", role: "primary" }],
            match: { projects: [PROJECT], commentTrigger: TRIGGER },
            beforeAgent: { targetStatus: "In Progress" },
            afterAgent: { targetStatus: "Ready for Review" },
          },
        ],
      }),
    );

    const config = loadConfig();

    for (const profile of config.profiles) {
      expect(profile.repoPath).toMatch(/^\//);
      expect(profile.repoPath).not.toContain("~");
    }
  });

  it("rejects variants with missing commentTrigger", () => {
    setRequiredEnv();
    stubProfiles(
      JSON.stringify({
        repo: "/tmp/test",
        dataSource: "test-source",
        variants: [
          {
            stages: [{ agent: "ralph", role: "primary" }],
            match: {
              projects: [PROJECT],
              statuses: ["New"],
            },
          },
        ],
      }),
    );

    expect(() => loadConfig()).toThrow("commentTrigger");
  });

  it("explodes multiple variants into separate profiles", () => {
    setRequiredEnv();
    stubProfiles(
      JSON.stringify({
        repo: "/tmp/test",
        dataSource: "test-source",
        variants: [
          {
            stages: [{ agent: "ralph.docs", role: "primary" }],
            match: { projects: ["DOCS"], commentTrigger: "@RalphDocs" },
            beforeAgent: { targetStatus: "In Progress" },
            afterAgent: { targetStatus: "Ready for Review" },
          },
          {
            stages: [{ agent: "ralph", role: "primary" }],
            match: { projects: [PROJECT], commentTrigger: "@Ralph" },
            beforeAgent: { targetStatus: "In Progress" },
            afterAgent: { targetStatus: "Ready for Review" },
          },
        ],
      }),
    );

    const config = loadConfig();

    expect(config.profiles).toHaveLength(2);
    expect(config.profiles[0].agentName).toBe("ralph.docs");
    expect(config.profiles[0].match.projects).toEqual(["DOCS"]);
    expect(config.profiles[1].agentName).toBe("ralph");
    expect(config.profiles[1].match.projects).toEqual([PROJECT]);
    expect(config.profiles[0].id).toBe(config.profiles[1].id);
  });

  describe("per-variant model override", () => {
    it("variant model overrides profile-level model", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          model: "claude-sonnet-4",
          variants: [
            {
              stages: [{ agent: "ralph", role: "primary" }],
              model: "claude-opus-4.6",
              match: { projects: [PROJECT], commentTrigger: TRIGGER },
              beforeAgent: { targetStatus: "In Progress" },
              afterAgent: { targetStatus: "Ready for Review" },
            },
          ],
        }),
      );

      const config = loadConfig();

      expect(config.profiles[0].model).toBe("claude-opus-4.6");
    });

    it("variant without model falls back to profile-level model", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          model: "claude-sonnet-4",
          variants: [
            {
              stages: [{ agent: "ralph", role: "primary" }],
              match: { projects: [PROJECT], commentTrigger: TRIGGER },
              beforeAgent: { targetStatus: "In Progress" },
              afterAgent: { targetStatus: "Ready for Review" },
            },
          ],
        }),
      );

      const config = loadConfig();

      expect(config.profiles[0].model).toBe("claude-sonnet-4");
    });

    it("model is undefined when both variant and profile omit it", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          variants: [
            {
              stages: [{ agent: "ralph", role: "primary" }],
              match: { projects: [PROJECT], commentTrigger: TRIGGER },
              beforeAgent: { targetStatus: "In Progress" },
              afterAgent: { targetStatus: "Ready for Review" },
            },
          ],
        }),
      );

      const config = loadConfig();

      expect(config.profiles[0].model).toBeUndefined();
    });

    it("multiple variants resolve model overrides independently", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          model: "claude-sonnet-4",
          variants: [
            {
              stages: [{ agent: "ralph.docs", role: "primary" }],
              model: "claude-opus-4.6",
              match: { projects: ["DOCS"], commentTrigger: "@RalphDocs" },
              beforeAgent: { targetStatus: "In Progress" },
              afterAgent: { targetStatus: "Ready for Review" },
            },
            {
              stages: [{ agent: "ralph.probe", role: "primary" }],
              match: { projects: [PROJECT], commentTrigger: "@McpProbe" },
              beforeAgent: { targetStatus: "In Progress" },
              afterAgent: { targetStatus: "Ready for Review" },
            },
          ],
        }),
      );

      const config = loadConfig();

      expect(config.profiles[0].model).toBe("claude-opus-4.6");
      expect(config.profiles[1].model).toBe("claude-sonnet-4");
    });
  });

  describe("mcpServers schema", () => {
    it("accepts string-only mcpServers (backward compat)", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          mcpServers: ["jira-kentico", "ado"],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: TRIGGER } },
          ],
        }),
      );
      const config = loadConfig();
      expect(config.profiles[0].mcpServers).toEqual(["jira-kentico", "ado"]);
      expect(config.profiles[0].mcpServerConfigs).toEqual({});
    });

    it("accepts object entries in mcpServers", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          mcpServers: [
            { name: "jira-kentico", env: { JIRA_ISSUE_KEY: "$task.id" } },
            "playwright",
            { name: "ado", env: { ADO_PROJECT: "Proj" } },
          ],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: TRIGGER } },
          ],
        }),
      );
      const config = loadConfig();
      expect(config.profiles[0].mcpServers).toEqual(["jira-kentico", "playwright", "ado"]);
      expect(config.profiles[0].mcpServerConfigs).toEqual({
        "jira-kentico": { JIRA_ISSUE_KEY: "$task.id" },
        ado: { ADO_PROJECT: "Proj" },
      });
    });

    it("rejects object mcpServers entry without name", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          mcpServers: [{ env: { FOO: "bar" } }],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: TRIGGER } },
          ],
        }),
      );
      expect(() => loadConfig()).toThrow();
    });

    it("ignores object entry with empty env", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          mcpServers: [{ name: "ado", env: {} }],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: TRIGGER } },
          ],
        }),
      );
      const config = loadConfig();
      expect(config.profiles[0].mcpServers).toEqual(["ado"]);
      expect(config.profiles[0].mcpServerConfigs).toEqual({});
    });

    it("rejects duplicate MCP server names in mcpServers", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          mcpServers: ["ado", { name: "ado", env: { ADO_PROJECT: "Proj" } }],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: TRIGGER } },
          ],
        }),
      );
      expect(() => loadConfig()).toThrow("duplicate MCP server(s): ado");
    });
  });

  describe("vcsProvider and repoPat", () => {
    it("defaults vcsProvider to 'ado' and repoPat to 'ADO_PAT'", () => {
      setRequiredEnv();
      const config = loadConfig();
      expect(config.profiles[0].vcsProvider).toBe("ado");
      expect(config.profiles[0].repoPat).toBe("ADO_PAT");
    });

    it("defaults repoPat to 'GH_TOKEN' when vcsProvider is 'github'", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          vcsProvider: "github",
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: TRIGGER } },
          ],
        }),
      );
      const config = loadConfig();
      expect(config.profiles[0].vcsProvider).toBe("github");
      expect(config.profiles[0].repoPat).toBe("GH_TOKEN");
    });

    it("uses explicit repoPat when provided", () => {
      setRequiredEnv();
      stubProfiles(
        JSON.stringify({
          repo: "/tmp/test",
          dataSource: "test-source",
          vcsProvider: "ado",
          repoPat: "CUSTOM_ADO_PAT",
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: TRIGGER } },
          ],
        }),
      );
      const config = loadConfig();
      expect(config.profiles[0].repoPat).toBe("CUSTOM_ADO_PAT");
    });
  });
});
