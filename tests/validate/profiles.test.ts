/**
 * Tests for validateProfiles — validates profile directories, profile.json
 * structure, agent mounts, MCP server references, and variant configs.
 *
 * Uses a real temp directory with profile fixtures to test the full validation
 * pipeline. The existing `trigger-uniqueness.test.ts` covers the cross-profile
 * trigger uniqueness check; this file covers everything else.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ValidationCollector } from "../../src/validate/types";
import { validateProfiles } from "../../src/validate/profiles";
import { CliType } from "../../src/config/types";
import { makeAgentTemplate } from "../helpers/factories";
const PROJECT = "DF";
const REPO_URL = "https://dev.azure.com/org/project/_git/docs";

let tempDir: string;
let origCwd: string;

function collector(): ValidationCollector {
  return { errors: [], warnings: [] };
}

/** Create a minimal valid profile directory with one variant. `dataSource` defaults to `test-source` unless the JSON sets it. */
function writeValidProfile(
  profileId: string,
  overrides: {
    profileJson?: Record<string, unknown>;
    agentFiles?: string[];
    composeContent?: string;
    skipCompose?: boolean;
  } = {},
) {
  const dir = join(tempDir, "profiles", profileId);
  mkdirSync(dir, { recursive: true });

  const agentsDir = join(dir, "agents");
  mkdirSync(agentsDir, { recursive: true });
  const agentFiles = overrides.agentFiles ?? ["ralph.agent.md"];
  for (const f of agentFiles) {
    writeFileSync(join(agentsDir, f), makeAgentTemplate(f.replace(".agent.md", "").replace(/\./g, "-")));
  }

  if (!overrides.skipCompose) {
    const compose = overrides.composeContent ?? "      - ./some/volume:/workspace/x:ro";
    writeFileSync(join(dir, "docker-compose.yml"), `services:\n  app:\n    volumes:\n${compose}\n`);
  }

  const defaultJson = {
    repoUrl: REPO_URL,
    variants: [
      {
        stages: [{ agent: agentFiles[0]?.replace(".agent.md", "") ?? "ralph", role: "primary" }],
        match: { projects: [PROJECT], commentTrigger: "@ralph" },
      },
    ],
  };

  const profileJson = { dataSource: "test-source", ...(overrides.profileJson ?? defaultJson) };
  writeFileSync(join(dir, "profile.json"), JSON.stringify(profileJson, null, 2));
}

/** A profile.json with one variant built from `stages` and optional post-task hook `hookStages`. */
function profileWithStages(
  stages: Record<string, unknown>[],
  extra: {
    hookStages?: Record<string, unknown>[];
    profile?: Record<string, unknown>;
    variant?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  return {
    repoUrl: REPO_URL,
    ...extra.profile,
    variants: [
      {
        stages,
        match: { projects: [PROJECT], commentTrigger: "@go" },
        postTaskHooks: extra.hookStages ? [{ name: "analysis", stages: extra.hookStages }] : [],
        ...extra.variant,
      },
    ],
  };
}

/** Write a loadable MCP server manifest to shared/mcp-servers/<name>/; give each server its own port. */
function writeMcpServer(name: string, sidecarPort: number, manifest: Record<string, unknown> = {}) {
  const serverDir = join(tempDir, "shared", "mcp-servers", name);
  mkdirSync(serverDir, { recursive: true });
  writeFileSync(
    join(serverDir, "mcp-server.json"),
    JSON.stringify({ name, type: "custom", command: "node", args: [], sidecarPort, ...manifest }),
  );
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "validate-profiles-"));
  origCwd = process.cwd();
  process.chdir(tempDir);
  process.env.ADO_PAT = "test-ado-pat";
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.ADO_PAT;
});

describe("validateProfiles", () => {
  it("passes for a valid profile", async () => {
    writeValidProfile("ralph-docs");
    const c = collector();
    await validateProfiles(c);
    expect(c.errors).toHaveLength(0);
  });

  it("errors when profiles/ directory does not exist", async () => {
    // tempDir has no profiles/ subdirectory
    const c = collector();
    await validateProfiles(c);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain("profiles/ directory not found");
  });

  it("errors when profiles/ directory is empty", async () => {
    mkdirSync(join(tempDir, "profiles"));
    const c = collector();
    await validateProfiles(c);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain("No profile directories found");
  });

  it("errors when profile.json is missing", async () => {
    const dir = join(tempDir, "profiles", "bad");
    mkdirSync(dir, { recursive: true });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain("profile.json not found");
  });

  it("errors when profile.json is invalid JSON", async () => {
    const dir = join(tempDir, "profiles", "bad");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "profile.json"), "not json {{{");
    const c = collector();
    await validateProfiles(c);
    expect(c.errors.some((e) => e.includes("not valid JSON"))).toBe(true);
  });

  it("errors when repoUrl is missing", async () => {
    // Arrange
    writeValidProfile("test", {
      profileJson: {
        variants: [
          { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
        ],
      },
    });
    const c = collector();

    // Act
    await validateProfiles(c);

    // Assert
    expect(c.errors).toContain("profiles/test/repoUrl: repoUrl is required");
  });

  it.each([
    ["a local path", "/home/user/repos/docs", "repoUrl must be an https:// URL"],
    ["an ssh remote", "git@ssh.dev.azure.com:v3/org/project/docs", "repoUrl must be an https:// URL"],
    ["an http URL", "http://dev.azure.com/org/project/_git/docs", "repoUrl must be an https:// URL"],
    [
      "a URL carrying credentials",
      "https://user:secret@dev.azure.com/org/project/_git/docs",
      "repoUrl must not carry credentials; the orchestrator authenticates with the repoPat env var",
    ],
    [
      "a URL carrying a user name",
      "https://org@dev.azure.com/org/project/_git/docs",
      "repoUrl must not carry credentials; the orchestrator authenticates with the repoPat env var",
    ],
  ])("errors when repoUrl is %s", async (_label, repoUrl, message) => {
    // Arrange
    writeValidProfile("test", {
      profileJson: {
        repoUrl,
        variants: [
          { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
        ],
      },
    });
    const c = collector();

    // Act
    await validateProfiles(c);

    // Assert
    expect(c.errors).toContain(`profiles/test/repoUrl: ${message}`);
  });

  it("accepts an https repoUrl without checking that the repository is reachable", async () => {
    // Arrange
    writeValidProfile("test");
    const c = collector();

    // Act
    await validateProfiles(c);

    // Assert
    expect(c.errors).toEqual([]);
  });

  it("accepts cli claude for a profile whose stages run in the container", async () => {
    // Arrange
    writeValidProfile("test", {
      profileJson: {
        repoUrl: REPO_URL,
        cli: "claude",
        variants: [
          { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
        ],
      },
    });
    const c = collector();

    // Act
    await validateProfiles(c);

    // Assert
    expect(c.errors.filter((e) => e.includes("claude"))).toEqual([]);
  });

  it("errors when docker-compose.yml is missing", async () => {
    writeValidProfile("test", { skipCompose: true });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors.some((e) => e.includes("docker-compose.yml not found"))).toBe(true);
  });

  it("errors when no variants are defined", async () => {
    writeValidProfile("test", {
      profileJson: { repoUrl: REPO_URL, variants: [] },
    });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors.some((e) => e.includes("at least one variant is required"))).toBe(true);
  });

  it("errors when variants is not an array", async () => {
    writeValidProfile("test", {
      profileJson: { repoUrl: REPO_URL, variants: "nope" },
    });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors.some((e) => e.includes("at least one variant is required"))).toBe(true);
  });

  it("errors when stage agent name is missing", async () => {
    writeValidProfile("test", {
      profileJson: {
        repoUrl: REPO_URL,
        variants: [{ stages: [{ role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
      },
    });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors.some((e) => e.includes("agent name is required"))).toBe(true);
  });

  it("errors when variant agent does not match an .agent.md file", async () => {
    writeValidProfile("test", {
      profileJson: {
        repoUrl: REPO_URL,
        variants: [
          {
            stages: [{ agent: "nonexistent", role: "primary" }],
            match: { projects: [PROJECT], commentTrigger: "@go" },
          },
        ],
      },
      agentFiles: ["ralph.agent.md"],
    });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors.some((e) => e.includes('agent "nonexistent" not found'))).toBe(true);
    expect(c.errors.some((e) => e.includes("Available agents: ralph"))).toBe(true);
  });

  it("warns when variant has no match.projects", async () => {
    writeValidProfile("test", {
      profileJson: {
        repoUrl: REPO_URL,
        variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { commentTrigger: "@go" } }],
      },
    });
    const c = collector();
    await validateProfiles(c);
    expect(c.warnings.some((w) => w.includes("no match.projects defined"))).toBe(true);
  });

  it("errors when variant has no commentTrigger", async () => {
    writeValidProfile("test", {
      profileJson: {
        repoUrl: REPO_URL,
        variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT] } }],
      },
    });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors.some((e) => e.includes("commentTrigger is required"))).toBe(true);
  });

  it("errors when revisionStatuses has values not in statuses", async () => {
    writeValidProfile("test", {
      profileJson: {
        repoUrl: REPO_URL,
        variants: [
          {
            stages: [{ agent: "ralph", role: "primary" }],
            match: {
              projects: [PROJECT],
              commentTrigger: "@go",
              statuses: ["In Progress", "Review"],
              revisionStatuses: ["Reopened"],
            },
          },
        ],
      },
    });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors.some((e) => e.includes('revisionStatuses value "Reopened" is not in statuses'))).toBe(true);
  });

  it("passes when revisionStatuses is a subset of statuses", async () => {
    writeValidProfile("test", {
      profileJson: {
        repoUrl: REPO_URL,
        variants: [
          {
            stages: [{ agent: "ralph", role: "primary" }],
            match: {
              projects: [PROJECT],
              commentTrigger: "@go",
              statuses: ["In Progress", "Review"],
              revisionStatuses: ["Review"],
            },
          },
        ],
      },
    });
    const c = collector();
    await validateProfiles(c);
    // Should not have any revisionStatuses errors
    expect(c.errors.filter((e) => e.includes("revisionStatuses"))).toHaveLength(0);
  });

  describe("skill validation", () => {
    it("errors when referenced skill does not exist", async () => {
      mkdirSync(join(tempDir, "shared", "skills"), { recursive: true });
      writeValidProfile("test", {
        profileJson: {
          repoUrl: REPO_URL,
          variants: [
            {
              stages: [{ agent: "ralph", role: "primary", skills: ["nonexistent-skill"] }],
              match: { projects: [PROJECT], commentTrigger: "@go" },
            },
          ],
        },
      });
      const c = collector();
      await validateProfiles(c);
      expect(c.errors.some((e) => e.includes('skill "nonexistent-skill" not found'))).toBe(true);
    });

    it("passes when referenced skill exists", async () => {
      const skillDir = join(tempDir, "shared", "skills", "my-skill");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), "# Skill");
      writeValidProfile("test", {
        profileJson: {
          repoUrl: REPO_URL,
          variants: [
            {
              stages: [{ agent: "ralph", role: "primary", skills: ["my-skill"] }],
              match: { projects: [PROJECT], commentTrigger: "@go" },
            },
          ],
        },
      });
      const c = collector();
      await validateProfiles(c);
      expect(c.errors.filter((e) => e.includes("skill"))).toHaveLength(0);
    });

    it("checks post-task hook stage skills too", async () => {
      // Arrange
      mkdirSync(join(tempDir, "shared", "skills"), { recursive: true });
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          hookStages: [{ agent: "ralph", role: "scientist", mode: "local", skills: ["run-telemetry-analysis"] }],
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toContainEqual(
        expect.stringMatching(/postTaskHooks\[0\]\/stages\[0\]: skill "run-telemetry-analysis" not found/),
      );
    });
  });

  describe("agent graph", () => {
    it("reports a subagent no template defines", async () => {
      // Arrange
      writeValidProfile("test");
      writeFileSync(
        join(tempDir, "profiles", "test", "agents", "ralph.agent.md"),
        makeAgentTemplate("ralph", { subagents: ["ralph-reviewer-ia-gpt"] }),
      );
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toEqual([
        'profiles/test/agents: agent ralph: subagent "ralph-reviewer-ia-gpt" is not an agent of this profile',
      ]);
    });
  });

  describe("MCP server validation", () => {
    it("errors when referenced MCP server does not exist", async () => {
      // Create shared/mcp-servers/ but leave it empty
      mkdirSync(join(tempDir, "shared", "mcp-servers"), { recursive: true });
      writeValidProfile("test", {
        profileJson: {
          repoUrl: REPO_URL,
          mcpServers: ["nonexistent-server"],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
          ],
        },
      });
      const c = collector();
      await validateProfiles(c);
      expect(c.errors.some((e) => e.includes('MCP server "nonexistent-server" not found'))).toBe(true);
    });

    it("passes when referenced MCP server exists", async () => {
      const serverDir = join(tempDir, "shared", "mcp-servers", "my-server");
      mkdirSync(serverDir, { recursive: true });
      writeFileSync(join(serverDir, "mcp-server.json"), JSON.stringify({ command: "node", args: ["dist/index.js"] }));

      writeValidProfile("test", {
        profileJson: {
          repoUrl: REPO_URL,
          mcpServers: ["my-server"],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
          ],
        },
      });
      const c = collector();
      await validateProfiles(c);
      expect(c.errors.filter((e) => e.includes("MCP server"))).toHaveLength(0);
    });
  });

  it("errors when repoPat env var is not set", async () => {
    // Arrange
    delete process.env.ADO_PAT;
    writeValidProfile("ralph-docs");
    const c = collector();

    // Act
    await validateProfiles(c);

    // Assert
    expect(c.errors).toContain(
      `profiles/ralph-docs: env var ADO_PAT is not set (required to clone and fetch ${REPO_URL})\n` +
        "  Set ADO_PAT in .env or change repoPat in profile.json",
    );
  });

  it("validates multiple profiles in a single run", async () => {
    writeValidProfile("profile-a");
    writeValidProfile("profile-b", {
      profileJson: {
        repoUrl: REPO_URL,
        variants: [
          { stages: [{ agent: "ralph", role: "primary" }], match: { projects: ["DOC"], commentTrigger: "@docs" } },
        ],
      },
    });
    const c = collector();
    await validateProfiles(c);
    expect(c.errors).toHaveLength(0);
  });

  it("reports schema errors with their profile.json location", async () => {
    // Arrange
    writeValidProfile("test", {
      profileJson: { ...profileWithStages([{ agent: "ralph", role: "primary" }]), dataSource: "" },
    });
    const c = collector();

    // Act
    await validateProfiles(c);

    // Assert
    expect(c.errors).toEqual(["profiles/test/dataSource: dataSource is required"]);
  });

  it("reports a profile that lists an MCP server twice", async () => {
    // Arrange
    writeMcpServer("srv", 9100);
    writeValidProfile("test", {
      profileJson: { ...profileWithStages([{ agent: "ralph", role: "primary" }]), mcpServers: ["srv", "srv"] },
    });
    const c = collector();

    // Act
    await validateProfiles(c);

    // Assert
    expect(c.errors.some((e) => e.includes("duplicate MCP server(s): srv"))).toBe(true);
  });

  it("returns the resolved variants of every valid profile", async () => {
    // Arrange
    writeValidProfile("profile-a");
    writeValidProfile("profile-b", { profileJson: { repoUrl: REPO_URL, variants: "nope" } });
    const c = collector();

    // Act
    const resolved = await validateProfiles(c);

    // Assert
    expect(resolved.map((p) => p.variantKey)).toEqual(["profile-a:ralph:@ralph"]);
  });

  describe("stage cli", () => {
    it("accepts claude for a container stage but rejects it for a host stage", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary", cli: "claude" }], {
          hookStages: [{ agent: "ralph", role: "analyzer", mode: "local", cli: "claude" }],
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      const claudeErrors = c.errors.filter((e) => e.includes('cli "claude"'));
      expect(claudeErrors).toEqual([
        expect.stringContaining(
          'variants[0]/postTaskHooks[0]/stages[0]: runs cli "claude" in mode "local", but host stages run only Copilot CLI',
        ),
      ]);
    });

    it("rejects a host stage whose role is not a safe directory name, since it names the stage's workspace", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary/../x" }], {
          hookStages: [{ agent: "ralph", role: "../analyzer", mode: "local" }],
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors.filter((e) => e.includes("workspace directory"))).toEqual([
        expect.stringContaining('variants[0]/postTaskHooks[0]/stages[0]: role "../analyzer" names'),
      ]);
    });

    it("rejects claude.loadRepoInstructions when no container stage runs claude", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: {
          ...profileWithStages([{ agent: "ralph", role: "primary", cli: "copilot" }]),
          claude: { loadRepoInstructions: true },
        },
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toContainEqual(
        expect.stringContaining("claude.loadRepoInstructions only affects container stages"),
      );
    });

    it("accepts claude.loadRepoInstructions for a profile with a claude container stage", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: {
          ...profileWithStages([{ agent: "ralph", role: "primary", cli: "claude" }]),
          claude: { loadRepoInstructions: true },
        },
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors.filter((e) => e.includes("loadRepoInstructions"))).toEqual([]);
    });

    it("reports an unknown stage cli", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary", cli: "gemini" }]),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test\/variants\[0\]\/stages\[0\]\/cli: /);
    });

    it.each([["effort", { effort: "high" }]])("rejects %s on a Copilot stage", async (option, setting) => {
      // Arrange
      writeValidProfile("test", { profileJson: profileWithStages([{ agent: "ralph", role: "primary", ...setting }]) });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toEqual([
        `profiles/test/variants[0]/stages[0]: ${option} is a Claude Code option, but this stage runs cli "${CliType.Copilot}"`,
      ]);
    });

    it("rejects githubMcpTools when no stage runs Copilot", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          profile: { cli: "claude", githubMcpTools: ["get_file_contents"] },
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors.some((e) => e.startsWith("profiles/test: githubMcpTools only affects Copilot stages"))).toBe(
        true,
      );
    });

    it("accepts githubMcpTools when a post-task hook stage runs Copilot", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          profile: { cli: "claude", githubMcpTools: ["get_file_contents"] },
          hookStages: [{ agent: "ralph", role: "analyzer", mode: "local", cli: "copilot" }],
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors.filter((e) => e.includes("githubMcpTools"))).toEqual([]);
    });
  });

  describe("models", () => {
    it("rejects a stage model the stage cli does not accept, with the replacement", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary", model: "opus" }]),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test\/variants\[0\]\/stages\[0\]: model "opus" is a Claude Code alias/);
      expect(c.errors[0]).toContain('"claude-opus-4.6"');
    });

    it("reports an invalid profile-level model once, at the profile", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: {
          repoUrl: REPO_URL,
          model: "opus",
          variants: [
            {
              stages: [
                { agent: "ralph", role: "primary" },
                { agent: "ralph", role: "reviewer" },
              ],
              match: { projects: [PROJECT], commentTrigger: "@go" },
            },
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@again" } },
          ],
        },
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test: model "opus" is a Claude Code alias/);
    });

    it("reports an invalid variant-level model at the variant", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          variant: { model: "claude-opus-4-6" },
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test\/variants\[0\]: model "claude-opus-4-6" is a Claude Code model id/);
    });

    it("rejects a stage that switches cli but inherits the model chosen for the profile cli", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages(
          [
            { agent: "ralph", role: "primary" },
            { agent: "ralph", role: "reviewer", cli: "claude" },
          ],
          { profile: { model: "claude-sonnet-4" } },
        ),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      const modelErrors = c.errors.filter((e) => e.includes("model"));
      expect(modelErrors).toHaveLength(1);
      expect(modelErrors[0]).toContain('profiles/test/variants[0]/stages[1]: runs cli "claude"');
      expect(modelErrors[0]).toContain('model "claude-sonnet-4" chosen for cli "copilot"');
    });

    it("accepts a stage that switches cli and sets a model for it", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "reviewer", cli: "claude", model: "sonnet" }], {
          profile: { model: "claude-sonnet-4.6" },
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors.filter((e) => e.includes("model"))).toEqual([]);
    });

    it("validates post-task hook stage models", async () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          hookStages: [{ agent: "ralph", role: "analyzer", mode: "local", model: "sonnet" }],
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test\/variants\[0\]\/postTaskHooks\[0\]\/stages\[0\]: model "sonnet"/);
    });
  });

  describe("variant-level MCP servers", () => {
    it("enforces requiredConfig for a server declared only on the variant", async () => {
      // Arrange
      writeMcpServer("ado", 9100, { requiredConfig: ["ADO_PROJECT", "ADO_REPO"] });
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], { variant: { mcpServers: ["ado"] } }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toContain('MCP server "ado" requires config [ADO_PROJECT, ADO_REPO]');
      expect(c.errors[0]).toContain("variants[0]");
    });

    it("accepts requiredConfig provided by the variant-level entry", async () => {
      // Arrange
      writeMcpServer("ado", 9100, { requiredConfig: ["ADO_PROJECT"] });
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          variant: { mcpServers: [{ name: "ado", env: { ADO_PROJECT: "Docs" } }] },
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toEqual([]);
    });

    it("rejects a variant entry whose env drops config the profile entry provided", async () => {
      // Arrange
      writeMcpServer("ado", 9100, { requiredConfig: ["ADO_PROJECT", "ADO_REPO"] });
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          profile: { mcpServers: [{ name: "ado", env: { ADO_PROJECT: "Docs", ADO_REPO: "docs" } }] },
          variant: { mcpServers: [{ name: "ado", env: { ADO_REPO: "kb" } }] },
        }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toContain('MCP server "ado" requires config [ADO_PROJECT]');
    });

    it("reports missing profile-level config once, naming every affected variant", async () => {
      // Arrange
      writeMcpServer("ado", 9100, { requiredConfig: ["ADO_PROJECT"] });
      writeValidProfile("test", {
        profileJson: {
          repoUrl: REPO_URL,
          mcpServers: ["ado"],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@again" } },
          ],
        },
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toContain("variants[0], variants[1]");
    });

    it("errors when a variant-level server does not exist", async () => {
      // Arrange
      writeMcpServer("ado", 9100);
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], { variant: { mcpServers: ["missing"] } }),
      });
      const c = collector();

      // Act
      await validateProfiles(c);

      // Assert
      expect(c.errors.some((e) => e.includes('MCP server "missing" not found'))).toBe(true);
    });
  });

  describe("sidecar ports", () => {
    async function validateWithServers(...servers: [string, number, Record<string, unknown>?][]): Promise<string[]> {
      for (const [name, port, manifest] of servers) writeMcpServer(name, port, manifest);
      writeValidProfile("test", {
        profileJson: { ...profileWithStages([{ agent: "ralph", role: "primary" }]), mcpServers: [servers[0][0]] },
      });
      const c = collector();
      await validateProfiles(c);
      return c.errors;
    }

    it("reports two servers on the same sidecarPort", async () => {
      // Act
      const errors = await validateWithServers(["jira", 9100], ["ado", 9100]);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("MCP sidecar port 9100 is used by both");
      expect(errors[0]).toContain('MCP server "jira"');
      expect(errors[0]).toContain('MCP server "ado"');
    });

    it("reports a server on the port a filtered custom server's upstream uses", async () => {
      // Act
      const errors = await validateWithServers(["jira", 9100, { tools: ["jira_add_comment"] }], ["late", 19100]);

      // Assert
      expect(errors).toEqual([
        expect.stringContaining(
          'MCP sidecar port 19100 is used by both MCP server "late" and the upstream port of MCP server "jira" (sidecarPort + 10000)',
        ),
      ]);
    });

    it("reports a server on the gateway health port", async () => {
      // Act
      const errors = await validateWithServers(["jira", 9000]);

      // Assert
      expect(errors).toEqual([
        expect.stringContaining(
          'MCP sidecar port 9000 is used by both the sidecar health endpoint and MCP server "jira"',
        ),
      ]);
    });

    it("reports a filtered custom server whose upstream port would pass 65535", async () => {
      // Act
      const errors = await validateWithServers(["jira", 60000, { tools: ["jira_add_comment"] }]);

      // Assert
      expect(errors).toEqual([expect.stringContaining('MCP server "jira": sidecarPort 60000 leaves no room')]);
    });

    it.each([
      ["an unfiltered custom server", { type: "custom" }],
      ["an npm server, which the sidecar reaches over stdio", { type: "npm", tools: ["browser_navigate"] }],
    ])("claims no upstream port for %s", async (_label, manifest) => {
      // Act
      const errors = await validateWithServers(["first", 9103, manifest], ["second", 19103]);

      // Assert
      expect(errors).toEqual([]);
    });
  });
});
