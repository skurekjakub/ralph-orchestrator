/**
 * Tests for validateConfigFile — config.json structure plus the checks that need both config.json
 * and the profiles (CLI credentials under the configured claudeAuth).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ValidationCollector } from "../../src/validate/types";
import { validateConfigFile } from "../../src/validate/config";
import { makeAgentTemplate } from "../helpers/factories";

const CREDENTIAL_VARS = ["ADO_PAT", "GH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];

let tempDir: string;
let origCwd: string;
let savedEnv: Record<string, string | undefined>;

function collector(): ValidationCollector {
  return { errors: [], warnings: [] };
}

/** Write config.json plus one valid profile whose single stage runs `cli`. */
function writeFixture(config: Record<string, unknown>, cli: string) {
  writeFileSync(
    join(tempDir, "config.json"),
    JSON.stringify({
      dataSources: { jira: { type: "jira", connection: { baseUrl: "https://x", cloudId: "c" } } },
      ...config,
    }),
  );
  const profileDir = join(tempDir, "profiles", "docs");
  mkdirSync(join(profileDir, "agents"), { recursive: true });
  writeFileSync(join(profileDir, "agents", "ralph.agent.md"), makeAgentTemplate("ralph"));
  writeFileSync(join(profileDir, "docker-compose.yml"), "services:\n  app: {}\n");
  writeFileSync(
    join(profileDir, "profile.json"),
    JSON.stringify({
      repoUrl: "https://dev.azure.com/org/project/_git/docs",
      dataSource: "jira",
      cli,
      variants: [
        { stages: [{ agent: "ralph", role: "primary" }], match: { projects: ["DOC"], commentTrigger: "@go" } },
      ],
    }),
  );
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "validate-config-"));
  origCwd = process.cwd();
  process.chdir(tempDir);
  savedEnv = {};
  for (const v of CREDENTIAL_VARS) {
    savedEnv[v] = process.env[v];
    delete process.env[v];
  }
  process.env.ADO_PAT = "ado";
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(tempDir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v !== undefined) process.env[k] = v;
    else delete process.env[k];
  }
});

describe("validateConfigFile", () => {
  it("passes when the Copilot stages' GH_TOKEN is set", async () => {
    // Arrange
    writeFixture({}, "copilot");
    process.env.GH_TOKEN = "ghp";
    const c = collector();

    // Act
    await validateConfigFile(c);

    // Assert
    expect(c.errors).toEqual([]);
  });

  it("requires GH_TOKEN when a stage runs Copilot", async () => {
    // Arrange
    writeFixture({}, "copilot");
    const c = collector();

    // Act
    await validateConfigFile(c);

    // Assert
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain('Missing env var GH_TOKEN for cli "copilot" (used by profiles/docs)');
  });

  it("requires the OAuth token for Claude stages by default", async () => {
    // Arrange
    writeFixture({}, "claude");
    const c = collector();

    // Act
    await validateConfigFile(c);

    // Assert
    expect(c.errors.some((e) => e.includes("Missing env var CLAUDE_CODE_OAUTH_TOKEN"))).toBe(true);
    expect(c.errors.some((e) => e.includes("GH_TOKEN"))).toBe(false);
  });

  it("requires the API key for Claude stages when claudeAuth is api-key", async () => {
    // Arrange
    writeFixture({ claudeAuth: "api-key" }, "claude");
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth";
    const c = collector();

    // Act
    await validateConfigFile(c);

    // Assert
    expect(c.errors.some((e) => e.includes("Missing env var ANTHROPIC_API_KEY"))).toBe(true);
  });

  it("reports an unknown claudeAuth and skips the credential check", async () => {
    // Arrange
    writeFixture({ claudeAuth: "password" }, "copilot");
    const c = collector();

    // Act
    await validateConfigFile(c);

    // Assert
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toMatch(/^config\.json: claudeAuth: /);
  });
});
