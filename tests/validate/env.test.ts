/**
 * Tests for validateEnvFile — validates .env file presence and required/optional env vars.
 *
 * Uses a real temp directory with .env fixtures and manipulates process.env
 * to test the env var discovery logic.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ValidationCollector } from "../../src/validate/types.js";
import { validateEnvFile } from "../../src/validate/env.js";

let tempDir: string;
let origCwd: string;
let savedEnv: Record<string, string | undefined>;

const REQUIRED_VARS = ["GH_TOKEN", "ADO_PAT"];
const OPTIONAL_VARS = ["ADO_PAT_XPERIENCE", "DASHBOARD_URL", "DASHBOARD_SECRET"];

function collector(): ValidationCollector {
  return { errors: [], warnings: [] };
}

/** Write a .env file with the given key=value pairs. */
function writeEnv(vars: Record<string, string>) {
  const content = Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(join(tempDir, ".env"), content);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "validate-env-"));
  origCwd = process.cwd();
  process.chdir(tempDir);

  // Save and clear all relevant env vars so process.env doesn't interfere
  savedEnv = {};
  for (const v of [...REQUIRED_VARS, ...OPTIONAL_VARS]) {
    savedEnv[v] = process.env[v];
    delete process.env[v];
  }
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(tempDir, { recursive: true, force: true });
  // Restore env vars
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v !== undefined) process.env[k] = v;
    else delete process.env[k];
  }
});

describe("validateEnvFile", () => {
  it("errors when .env file does not exist", () => {
    const c = collector();
    validateEnvFile(c);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain(".env file not found");
  });

  it("errors for each missing required env var", () => {
    writeEnv({});
    const c = collector();
    validateEnvFile(c);

    for (const varName of REQUIRED_VARS) {
      expect(c.errors.some((e) => e.includes(varName))).toBe(true);
    }
  });

  it("no errors when all required env vars are in .env file", () => {
    writeEnv({
      GH_TOKEN: "ghp_abc",
      ADO_PAT: "ado_abc",
    });
    const c = collector();
    validateEnvFile(c);
    expect(c.errors).toHaveLength(0);
  });

  it("accepts required env vars from process.env (not just .env file)", () => {
    writeEnv({}); // empty file
    process.env.GH_TOKEN = "from-env";
    process.env.ADO_PAT = "from-env";

    const c = collector();
    validateEnvFile(c);
    expect(c.errors).toHaveLength(0);
  });

  it("warns for missing optional env vars", () => {
    writeEnv({
      GH_TOKEN: "ghp_abc",
      ADO_PAT: "ado_abc",
    });
    const c = collector();
    validateEnvFile(c);

    for (const varName of OPTIONAL_VARS) {
      expect(c.warnings.some((w) => w.includes(varName))).toBe(true);
    }
  });

  it("no warnings when optional env vars are set", () => {
    writeEnv({
      GH_TOKEN: "ghp_abc",
      ADO_PAT: "ado_abc",
      ADO_PAT_XPERIENCE: "xp_abc",
      DASHBOARD_URL: "https://dashboard.test",
      DASHBOARD_SECRET: "secret",
    });
    const c = collector();
    validateEnvFile(c);
    expect(c.warnings).toHaveLength(0);
  });

  it("parses quoted values in .env", () => {
    writeEnv({
      JIRA_PAT: '"quoted-token"',
      JIRA_EMAIL: "'single-quoted@test.com'",
      GH_TOKEN: "unquoted",
      ADO_PAT: "also-unquoted",
    });
    const c = collector();
    validateEnvFile(c);
    expect(c.errors).toHaveLength(0);
  });

  it("ignores comments and blank lines in .env", () => {
    writeFileSync(join(tempDir, ".env"), [
      "# This is a comment",
      "",
      "JIRA_PAT=token",
      "  # Another comment",
      "JIRA_EMAIL=test@test.com",
      "",
      "GH_TOKEN=ghp_abc",
      "ADO_PAT=ado_abc",
    ].join("\n"));

    const c = collector();
    validateEnvFile(c);
    expect(c.errors).toHaveLength(0);
  });

  it("skips lines without = sign", () => {
    writeFileSync(join(tempDir, ".env"), [
      "JIRA_PAT=token",
      "JIRA_EMAIL=test@test.com",
      "GH_TOKEN=ghp_abc",
      "ADO_PAT=ado_abc",
      "MALFORMED_LINE",
    ].join("\n"));

    const c = collector();
    validateEnvFile(c);
    expect(c.errors).toHaveLength(0); // MALFORMED_LINE is silently skipped
  });
});
