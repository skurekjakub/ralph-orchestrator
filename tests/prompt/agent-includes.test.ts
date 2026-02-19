import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveAgentIncludes, resolveAllProfileIncludes } from "../../src/container/setup/agent-includes.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "includes-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("resolveAgentIncludes", () => {
  it("replaces include markers with file content", () => {
    const agentDir = join(tempDir, "agents");
    const includesDir = join(tempDir, "includes");
    mkdirSync(agentDir);
    mkdirSync(includesDir);

    writeFileSync(join(includesDir, "jira-api.md"), "## JIRA API\nCurl commands here.");
    writeFileSync(
      join(agentDir, "ralph.agent.md"),
      "# Ralph\n\n<!-- include: jira-api.md -->\n\n## Workflow\nDo stuff.",
    );

    resolveAgentIncludes(agentDir, includesDir);

    const resolved = readFileSync(join(agentDir, ".build", "ralph.agent.md"), "utf-8");
    expect(resolved).toContain("## JIRA API");
    expect(resolved).toContain("Curl commands here.");
    expect(resolved).not.toContain("<!-- include:");
    expect(resolved).toContain("## Workflow");
  });

  it("handles multiple includes in one file", () => {
    const agentDir = join(tempDir, "agents");
    const includesDir = join(tempDir, "includes");
    mkdirSync(agentDir);
    mkdirSync(includesDir);

    writeFileSync(join(includesDir, "a.md"), "Section A");
    writeFileSync(join(includesDir, "b.md"), "Section B");
    writeFileSync(
      join(agentDir, "test.agent.md"),
      "# Test\n<!-- include: a.md -->\n---\n<!-- include: b.md -->",
    );

    resolveAgentIncludes(agentDir, includesDir);

    const resolved = readFileSync(join(agentDir, ".build", "test.agent.md"), "utf-8");
    expect(resolved).toContain("Section A");
    expect(resolved).toContain("Section B");
  });

  it("throws on missing include", () => {
    const agentDir = join(tempDir, "agents");
    const includesDir = join(tempDir, "includes");
    mkdirSync(agentDir);
    mkdirSync(includesDir);

    writeFileSync(
      join(agentDir, "test.agent.md"),
      "<!-- include: nonexistent.md -->",
    );

    expect(() => resolveAgentIncludes(agentDir, includesDir)).toThrow("Agent include not found");
  });

  it("leaves files without markers unchanged", () => {
    const agentDir = join(tempDir, "agents");
    const includesDir = join(tempDir, "includes");
    mkdirSync(agentDir);
    mkdirSync(includesDir);

    const content = "# Agent\nNo includes here.";
    writeFileSync(join(agentDir, "plain.agent.md"), content);

    resolveAgentIncludes(agentDir, includesDir);

    const resolved = readFileSync(join(agentDir, ".build", "plain.agent.md"), "utf-8");
    expect(resolved).toBe(content);
  });

  it("resolves indented include markers", () => {
    const agentDir = join(tempDir, "agents");
    const includesDir = join(tempDir, "includes");
    mkdirSync(agentDir);
    mkdirSync(includesDir);

    writeFileSync(join(includesDir, "refs.md"), "Link: https://example.com");
    writeFileSync(
      join(agentDir, "test.agent.md"),
      "# Agent\n\n   <!-- include: refs.md -->\n\nDone.",
    );

    resolveAgentIncludes(agentDir, includesDir);

    const resolved = readFileSync(join(agentDir, ".build", "test.agent.md"), "utf-8");
    expect(resolved).toContain("Link: https://example.com");
    expect(resolved).not.toContain("<!-- include:");
  });

  it("ignores non-.agent.md files", () => {
    const agentDir = join(tempDir, "agents");
    const includesDir = join(tempDir, "includes");
    mkdirSync(agentDir);
    mkdirSync(includesDir);

    writeFileSync(join(agentDir, "readme.md"), "<!-- include: something.md -->");
    writeFileSync(join(agentDir, "test.agent.md"), "# Agent");

    resolveAgentIncludes(agentDir, includesDir);

    const buildFiles = require("node:fs").readdirSync(join(agentDir, ".build"));
    expect(buildFiles).toEqual(["test.agent.md"]);
  });
});

describe("resolveAllProfileIncludes", () => {
  it("processes all profiles in a workspace", () => {
    const root = tempDir;
    const includesDir = join(root, "shared", "agent-includes");
    mkdirSync(includesDir, { recursive: true });
    writeFileSync(join(includesDir, "common.md"), "Shared content");

    const profile1 = join(root, "profiles", "p1", "agents");
    const profile2 = join(root, "profiles", "p2", "agents");
    mkdirSync(profile1, { recursive: true });
    mkdirSync(profile2, { recursive: true });

    writeFileSync(join(profile1, "a.agent.md"), "<!-- include: common.md -->");
    writeFileSync(join(profile2, "b.agent.md"), "<!-- include: common.md -->");

    resolveAllProfileIncludes(root);

    expect(readFileSync(join(profile1, ".build", "a.agent.md"), "utf-8")).toBe("Shared content");
    expect(readFileSync(join(profile2, ".build", "b.agent.md"), "utf-8")).toBe("Shared content");
  });

  it("does nothing when shared/agent-includes does not exist", () => {
    resolveAllProfileIncludes(tempDir);
  });
});
