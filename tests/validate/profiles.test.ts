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
    repo: tempDir,
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
    repo: tempDir,
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
  it("passes for a valid profile", () => {
    writeValidProfile("ralph-docs");
    const c = collector();
    validateProfiles(c);
    expect(c.errors).toHaveLength(0);
  });

  it("errors when profiles/ directory does not exist", () => {
    // tempDir has no profiles/ subdirectory
    const c = collector();
    validateProfiles(c);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain("profiles/ directory not found");
  });

  it("errors when profiles/ directory is empty", () => {
    mkdirSync(join(tempDir, "profiles"));
    const c = collector();
    validateProfiles(c);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain("No profile directories found");
  });

  it("errors when profile.json is missing", () => {
    const dir = join(tempDir, "profiles", "bad");
    mkdirSync(dir, { recursive: true });
    const c = collector();
    validateProfiles(c);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain("profile.json not found");
  });

  it("errors when profile.json is invalid JSON", () => {
    const dir = join(tempDir, "profiles", "bad");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "profile.json"), "not json {{{");
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("not valid JSON"))).toBe(true);
  });

  it("errors when repo path is missing", () => {
    writeValidProfile("test", {
      profileJson: {
        variants: [
          { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
        ],
      },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("repo path is required"))).toBe(true);
  });

  it("errors when repo path does not exist", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: "/nonexistent/path/12345",
        variants: [
          { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
        ],
      },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("repo path does not exist"))).toBe(true);
  });

  it("errors when cli is set to claude", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: tempDir,
        cli: "claude",
        variants: [
          { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
        ],
      },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("claude") && e.includes("not supported"))).toBe(true);
  });

  it("errors when docker-compose.yml is missing", () => {
    writeValidProfile("test", { skipCompose: true });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("docker-compose.yml not found"))).toBe(true);
  });

  it("errors when no variants are defined", () => {
    writeValidProfile("test", {
      profileJson: { repo: tempDir, variants: [] },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("at least one variant is required"))).toBe(true);
  });

  it("errors when variants is not an array", () => {
    writeValidProfile("test", {
      profileJson: { repo: tempDir, variants: "nope" },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("at least one variant is required"))).toBe(true);
  });

  it("errors when stage agent name is missing", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: tempDir,
        variants: [{ stages: [{ role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
      },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("agent name is required"))).toBe(true);
  });

  it("errors when variant agent does not match an .agent.md file", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: tempDir,
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
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes('agent "nonexistent" not found'))).toBe(true);
    expect(c.errors.some((e) => e.includes("Available agents: ralph"))).toBe(true);
  });

  it("warns when variant has no match.projects", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: tempDir,
        variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { commentTrigger: "@go" } }],
      },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.warnings.some((w) => w.includes("no match.projects defined"))).toBe(true);
  });

  it("errors when variant has no commentTrigger", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: tempDir,
        variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT] } }],
      },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("commentTrigger is required"))).toBe(true);
  });

  it("errors when revisionStatuses has values not in statuses", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: tempDir,
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
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes('revisionStatuses value "Reopened" is not in statuses'))).toBe(true);
  });

  it("passes when revisionStatuses is a subset of statuses", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: tempDir,
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
    validateProfiles(c);
    // Should not have any revisionStatuses errors
    expect(c.errors.filter((e) => e.includes("revisionStatuses"))).toHaveLength(0);
  });

  describe("skill validation", () => {
    it("errors when referenced skill does not exist", () => {
      mkdirSync(join(tempDir, "shared", "skills"), { recursive: true });
      writeValidProfile("test", {
        profileJson: {
          repo: tempDir,
          variants: [
            {
              stages: [{ agent: "ralph", role: "primary", skills: ["nonexistent-skill"] }],
              match: { projects: [PROJECT], commentTrigger: "@go" },
            },
          ],
        },
      });
      const c = collector();
      validateProfiles(c);
      expect(c.errors.some((e) => e.includes('skill "nonexistent-skill" not found'))).toBe(true);
    });

    it("passes when referenced skill exists", () => {
      const skillDir = join(tempDir, "shared", "skills", "my-skill");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), "# Skill");
      writeValidProfile("test", {
        profileJson: {
          repo: tempDir,
          variants: [
            {
              stages: [{ agent: "ralph", role: "primary", skills: ["my-skill"] }],
              match: { projects: [PROJECT], commentTrigger: "@go" },
            },
          ],
        },
      });
      const c = collector();
      validateProfiles(c);
      expect(c.errors.filter((e) => e.includes("skill"))).toHaveLength(0);
    });

    it("checks post-task hook stage skills too", () => {
      // Arrange
      mkdirSync(join(tempDir, "shared", "skills"), { recursive: true });
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          hookStages: [{ agent: "ralph", role: "scientist", mode: "local", skills: ["run-telemetry-analysis"] }],
        }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toContainEqual(
        expect.stringMatching(/postTaskHooks\[0\]\/stages\[0\]: skill "run-telemetry-analysis" not found/),
      );
    });
  });

  describe("agent graph", () => {
    it("reports a subagent no template defines", () => {
      // Arrange
      writeValidProfile("test");
      writeFileSync(
        join(tempDir, "profiles", "test", "agents", "ralph.agent.md"),
        makeAgentTemplate("ralph", { subagents: ["ralph-reviewer-ia-gpt"] }),
      );
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toEqual([
        'profiles/test/agents: agent ralph: subagent "ralph-reviewer-ia-gpt" is not an agent of this profile',
      ]);
    });
  });

  describe("MCP server validation", () => {
    it("errors when referenced MCP server does not exist", () => {
      // Create shared/mcp-servers/ but leave it empty
      mkdirSync(join(tempDir, "shared", "mcp-servers"), { recursive: true });
      writeValidProfile("test", {
        profileJson: {
          repo: tempDir,
          mcpServers: ["nonexistent-server"],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
          ],
        },
      });
      const c = collector();
      validateProfiles(c);
      expect(c.errors.some((e) => e.includes('MCP server "nonexistent-server" not found'))).toBe(true);
    });

    it("passes when referenced MCP server exists", () => {
      const serverDir = join(tempDir, "shared", "mcp-servers", "my-server");
      mkdirSync(serverDir, { recursive: true });
      writeFileSync(join(serverDir, "mcp-server.json"), JSON.stringify({ command: "node", args: ["dist/index.js"] }));

      writeValidProfile("test", {
        profileJson: {
          repo: tempDir,
          mcpServers: ["my-server"],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
          ],
        },
      });
      const c = collector();
      validateProfiles(c);
      expect(c.errors.filter((e) => e.includes("MCP server"))).toHaveLength(0);
    });
  });

  it("errors when repoPat env var is not set", () => {
    delete process.env.ADO_PAT;
    writeValidProfile("ralph-docs");
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("ADO_PAT") && e.includes("not set"))).toBe(true);
  });

  it("validates multiple profiles in a single run", () => {
    writeValidProfile("profile-a");
    writeValidProfile("profile-b", {
      profileJson: {
        repo: tempDir,
        variants: [
          { stages: [{ agent: "ralph", role: "primary" }], match: { projects: ["DOC"], commentTrigger: "@docs" } },
        ],
      },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors).toHaveLength(0);
  });

  it("reports schema errors with their profile.json location", () => {
    // Arrange
    writeValidProfile("test", {
      profileJson: { ...profileWithStages([{ agent: "ralph", role: "primary" }]), dataSource: "" },
    });
    const c = collector();

    // Act
    validateProfiles(c);

    // Assert
    expect(c.errors).toEqual(["profiles/test/dataSource: dataSource is required"]);
  });

  it("reports a profile that lists an MCP server twice", () => {
    // Arrange
    writeMcpServer("srv", 9100);
    writeValidProfile("test", {
      profileJson: { ...profileWithStages([{ agent: "ralph", role: "primary" }]), mcpServers: ["srv", "srv"] },
    });
    const c = collector();

    // Act
    validateProfiles(c);

    // Assert
    expect(c.errors.some((e) => e.includes("duplicate MCP server(s): srv"))).toBe(true);
  });

  it("returns the resolved variants of every valid profile", () => {
    // Arrange
    writeValidProfile("profile-a");
    writeValidProfile("profile-b", { profileJson: { repo: "/nonexistent/path/12345", variants: "nope" } });
    const c = collector();

    // Act
    const resolved = validateProfiles(c);

    // Assert
    expect(resolved.map((p) => p.variantKey)).toEqual(["profile-a:ralph:@ralph"]);
  });

  describe("stage cli", () => {
    it("rejects claude once per profile, naming every stage that runs it", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary", cli: "claude" }], {
          hookStages: [{ agent: "ralph", role: "analyzer", mode: "local", cli: "claude" }],
        }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      const claudeErrors = c.errors.filter((e) => e.includes('cli "claude"'));
      expect(claudeErrors).toHaveLength(1);
      expect(claudeErrors[0]).toContain("not supported yet");
      expect(claudeErrors[0]).toContain("variants[0]/stages[0]");
      expect(claudeErrors[0]).toContain("variants[0]/postTaskHooks[0]/stages[0]");
    });

    it("reports an unknown stage cli", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary", cli: "gemini" }]),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test\/variants\[0\]\/stages\[0\]\/cli: /);
    });

    it.each([
      ["effort", { effort: "high" }],
      ["maxBudgetUsd", { maxBudgetUsd: 5 }],
    ])("rejects %s on a Copilot stage", (option, setting) => {
      // Arrange
      writeValidProfile("test", { profileJson: profileWithStages([{ agent: "ralph", role: "primary", ...setting }]) });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toEqual([
        `profiles/test/variants[0]/stages[0]: ${option} is a Claude Code option, but this stage runs cli "${CliType.Copilot}"`,
      ]);
    });

    it("rejects githubMcpTools when no stage runs Copilot", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          profile: { cli: "claude", githubMcpTools: ["get_file_contents"] },
        }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors.some((e) => e.startsWith("profiles/test: githubMcpTools only affects Copilot stages"))).toBe(
        true,
      );
    });

    it("accepts githubMcpTools when a post-task hook stage runs Copilot", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          profile: { cli: "claude", githubMcpTools: ["get_file_contents"] },
          hookStages: [{ agent: "ralph", role: "analyzer", mode: "local", cli: "copilot" }],
        }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors.filter((e) => e.includes("githubMcpTools"))).toEqual([]);
    });
  });

  describe("models", () => {
    it("rejects a stage model the stage cli does not accept, with the replacement", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary", model: "opus" }]),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test\/variants\[0\]\/stages\[0\]: model "opus" is a Claude Code alias/);
      expect(c.errors[0]).toContain('"claude-opus-4.6"');
    });

    it("reports an invalid profile-level model once, at the profile", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: {
          repo: tempDir,
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
      validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test: model "opus" is a Claude Code alias/);
    });

    it("reports an invalid variant-level model at the variant", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          variant: { model: "claude-opus-4-6" },
        }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test\/variants\[0\]: model "claude-opus-4-6" is a Claude Code model id/);
    });

    it("rejects a stage that switches cli but inherits the model chosen for the profile cli", () => {
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
      validateProfiles(c);

      // Assert
      const modelErrors = c.errors.filter((e) => e.includes("model"));
      expect(modelErrors).toHaveLength(1);
      expect(modelErrors[0]).toContain('profiles/test/variants[0]/stages[1]: runs cli "claude"');
      expect(modelErrors[0]).toContain('model "claude-sonnet-4" chosen for cli "copilot"');
    });

    it("accepts a stage that switches cli and sets a model for it", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "reviewer", cli: "claude", model: "sonnet" }], {
          profile: { model: "claude-sonnet-4.6" },
        }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors.filter((e) => e.includes("model"))).toEqual([]);
    });

    it("validates post-task hook stage models", () => {
      // Arrange
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          hookStages: [{ agent: "ralph", role: "analyzer", mode: "local", model: "sonnet" }],
        }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toMatch(/^profiles\/test\/variants\[0\]\/postTaskHooks\[0\]\/stages\[0\]: model "sonnet"/);
    });
  });

  describe("variant-level MCP servers", () => {
    it("enforces requiredConfig for a server declared only on the variant", () => {
      // Arrange
      writeMcpServer("ado", 9100, { requiredConfig: ["ADO_PROJECT", "ADO_REPO"] });
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], { variant: { mcpServers: ["ado"] } }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toContain('MCP server "ado" requires config [ADO_PROJECT, ADO_REPO]');
      expect(c.errors[0]).toContain("variants[0]");
    });

    it("accepts requiredConfig provided by the variant-level entry", () => {
      // Arrange
      writeMcpServer("ado", 9100, { requiredConfig: ["ADO_PROJECT"] });
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], {
          variant: { mcpServers: [{ name: "ado", env: { ADO_PROJECT: "Docs" } }] },
        }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toEqual([]);
    });

    it("rejects a variant entry whose env drops config the profile entry provided", () => {
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
      validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toContain('MCP server "ado" requires config [ADO_PROJECT]');
    });

    it("reports missing profile-level config once, naming every affected variant", () => {
      // Arrange
      writeMcpServer("ado", 9100, { requiredConfig: ["ADO_PROJECT"] });
      writeValidProfile("test", {
        profileJson: {
          repo: tempDir,
          mcpServers: ["ado"],
          variants: [
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } },
            { stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@again" } },
          ],
        },
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors).toHaveLength(1);
      expect(c.errors[0]).toContain("variants[0], variants[1]");
    });

    it("errors when a variant-level server does not exist", () => {
      // Arrange
      writeMcpServer("ado", 9100);
      writeValidProfile("test", {
        profileJson: profileWithStages([{ agent: "ralph", role: "primary" }], { variant: { mcpServers: ["missing"] } }),
      });
      const c = collector();

      // Act
      validateProfiles(c);

      // Assert
      expect(c.errors.some((e) => e.includes('MCP server "missing" not found'))).toBe(true);
    });
  });

  describe("sidecar ports", () => {
    function validateWithServers(...servers: [string, number, Record<string, unknown>?][]): string[] {
      for (const [name, port, manifest] of servers) writeMcpServer(name, port, manifest);
      writeValidProfile("test", {
        profileJson: { ...profileWithStages([{ agent: "ralph", role: "primary" }]), mcpServers: [servers[0][0]] },
      });
      const c = collector();
      validateProfiles(c);
      return c.errors;
    }

    it("reports two servers on the same sidecarPort", () => {
      // Act
      const errors = validateWithServers(["jira", 9100], ["ado", 9100]);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("MCP sidecar port 9100 is used by both");
      expect(errors[0]).toContain('MCP server "jira"');
      expect(errors[0]).toContain('MCP server "ado"');
    });

    it("reports a server on the port a filtered custom server's upstream uses", () => {
      // Act
      const errors = validateWithServers(["jira", 9100, { tools: ["jira_add_comment"] }], ["late", 19100]);

      // Assert
      expect(errors).toEqual([
        expect.stringContaining(
          'MCP sidecar port 19100 is used by both MCP server "late" and the upstream port of MCP server "jira" (sidecarPort + 10000)',
        ),
      ]);
    });

    it("reports a server on the gateway health port", () => {
      // Act
      const errors = validateWithServers(["jira", 9000]);

      // Assert
      expect(errors).toEqual([
        expect.stringContaining(
          'MCP sidecar port 9000 is used by both the sidecar health endpoint and MCP server "jira"',
        ),
      ]);
    });

    it("reports a filtered custom server whose upstream port would pass 65535", () => {
      // Act
      const errors = validateWithServers(["jira", 60000, { tools: ["jira_add_comment"] }]);

      // Assert
      expect(errors).toEqual([expect.stringContaining('MCP server "jira": sidecarPort 60000 leaves no room')]);
    });

    it.each([
      ["an unfiltered custom server", { type: "custom" }],
      ["an npm server, which the sidecar reaches over stdio", { type: "npm", tools: ["browser_navigate"] }],
    ])("claims no upstream port for %s", (_label, manifest) => {
      // Act
      const errors = validateWithServers(["first", 9103, manifest], ["second", 19103]);

      // Assert
      expect(errors).toEqual([]);
    });
  });
});
