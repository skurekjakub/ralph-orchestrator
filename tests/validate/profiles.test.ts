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
import type { ValidationCollector } from "../../src/validate/types.js";
import { validateProfiles } from "../../src/validate/profiles.js";
const PROJECT = "DF";

let tempDir: string;
let origCwd: string;

function collector(): ValidationCollector {
  return { errors: [], warnings: [] };
}

/** Create a minimal valid profile directory with one variant. */
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
    writeFileSync(join(agentsDir, f), "# Agent");
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

  writeFileSync(
    join(dir, "profile.json"),
    JSON.stringify(overrides.profileJson ?? defaultJson, null, 2),
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
        variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
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
        variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
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
        variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
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
        variants: [{ stages: [{ agent: "nonexistent", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
      },
      agentFiles: ["ralph.agent.md"],
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("agent \"nonexistent\" not found"))).toBe(true);
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
        variants: [{
          stages: [{ agent: "ralph", role: "primary" }],
          match: {
            projects: [PROJECT],
            commentTrigger: "@go",
            statuses: ["In Progress", "Review"],
            revisionStatuses: ["Reopened"],
          },
        }],
      },
    });
    const c = collector();
    validateProfiles(c);
    expect(c.errors.some((e) => e.includes("revisionStatuses value \"Reopened\" is not in statuses"))).toBe(true);
  });

  it("passes when revisionStatuses is a subset of statuses", () => {
    writeValidProfile("test", {
      profileJson: {
        repo: tempDir,
        variants: [{
          stages: [{ agent: "ralph", role: "primary" }],
          match: {
            projects: [PROJECT],
            commentTrigger: "@go",
            statuses: ["In Progress", "Review"],
            revisionStatuses: ["Review"],
          },
        }],
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
          variants: [{ stages: [{ agent: "ralph", role: "primary", skills: ["nonexistent-skill"] }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
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
          variants: [{ stages: [{ agent: "ralph", role: "primary", skills: ["my-skill"] }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
        },
      });
      const c = collector();
      validateProfiles(c);
      expect(c.errors.filter((e) => e.includes("skill"))).toHaveLength(0);
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
          variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
        },
      });
      const c = collector();
      validateProfiles(c);
      expect(c.errors.some((e) => e.includes("MCP server \"nonexistent-server\" not found"))).toBe(true);
    });

    it("passes when referenced MCP server exists", () => {
      const serverDir = join(tempDir, "shared", "mcp-servers", "my-server");
      mkdirSync(serverDir, { recursive: true });
      writeFileSync(join(serverDir, "mcp-server.json"), JSON.stringify({ command: "node", args: ["dist/index.js"] }));

      writeValidProfile("test", {
        profileJson: {
          repo: tempDir,
          mcpServers: ["my-server"],
          variants: [{ stages: [{ agent: "ralph", role: "primary" }], match: { projects: [PROJECT], commentTrigger: "@go" } }],
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
});
