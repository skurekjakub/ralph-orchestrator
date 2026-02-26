import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateAgentVolumeMounts, generateSkillVolumeMounts } from "../../src/container/setup/artifact-mounts.js";

describe("generateAgentVolumeMounts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "artifact-mounts-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty array when agents directory does not exist", () => {
    expect(generateAgentVolumeMounts(tempDir)).toEqual([]);
  });

  it("discovers .agent.md files and generates mounts", () => {
    const agentsDir = join(tempDir, "agents");
    mkdirSync(agentsDir);
    writeFileSync(join(agentsDir, "ralph.ralph.agent.md"), "# Agent");
    writeFileSync(join(agentsDir, "ralph.malph.agent.md"), "# Agent");

    const mounts = generateAgentVolumeMounts(tempDir);

    expect(mounts).toHaveLength(2);
    expect(mounts[0]).toContain("ralph.malph.agent.md:/workspace/.github/agents/ralph.malph.agent.md:ro");
    expect(mounts[1]).toContain("ralph.ralph.agent.md:/workspace/.github/agents/ralph.ralph.agent.md:ro");
  });

  it("ignores non-.agent.md files", () => {
    const agentsDir = join(tempDir, "agents");
    mkdirSync(agentsDir);
    writeFileSync(join(agentsDir, "ralph.ralph.agent.md"), "# Agent");
    writeFileSync(join(agentsDir, "README.md"), "# Readme");

    const mounts = generateAgentVolumeMounts(tempDir);

    expect(mounts).toHaveLength(1);
    expect(mounts[0]).toContain("ralph.ralph.agent.md");
  });

  it("points mounts to .build/ directory", () => {
    const agentsDir = join(tempDir, "agents");
    mkdirSync(agentsDir);
    writeFileSync(join(agentsDir, "ralph.agent.md"), "# Agent");

    const mounts = generateAgentVolumeMounts(tempDir);
    const buildDir = join(tempDir, ".build");

    expect(mounts[0]).toContain(`${buildDir}/ralph.agent.md`);
  });
});

describe("generateSkillVolumeMounts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "skill-mounts-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty array when no skills declared", () => {
    expect(generateSkillVolumeMounts(tempDir, [])).toEqual([]);
  });

  it("generates directory mounts for declared skills", () => {
    const mounts = generateSkillVolumeMounts(tempDir, ["git-workflow", "jira-conventions"]);

    expect(mounts).toHaveLength(2);
    expect(mounts[0]).toContain(`${join(tempDir, "git-workflow")}:/workspace/.github/skills/git-workflow:ro`);
    expect(mounts[1]).toContain(`${join(tempDir, "jira-conventions")}:/workspace/.github/skills/jira-conventions:ro`);
  });
});
