/**
 * Tests for validateSecurityInfra — validates that the shared security
 * overlay, Squid config, and profile compose files are compatible.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ValidationCollector } from "../../src/validate/types.js";
import { validateSecurityInfra } from "../../src/validate/security.js";

let tempDir: string;
let origCwd: string;

function collector(): ValidationCollector {
  return { errors: [], warnings: [] };
}

/** Set up the minimal security infrastructure files. */
function writeSecurityFiles() {
  const secDir = join(tempDir, "shared", "security");
  mkdirSync(secDir, { recursive: true });
  writeFileSync(join(secDir, "docker-compose.security.yml"), "# security overlay");
  writeFileSync(join(secDir, "squid.conf"), "# squid config");
}

/** Create a profile with a docker-compose.yml containing the given content. */
function writeProfile(profileId: string, composeContent: string) {
  const dir = join(tempDir, "profiles", profileId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "docker-compose.yml"), composeContent);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "validate-security-"));
  origCwd = process.cwd();
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

describe("validateSecurityInfra", () => {
  it("errors when security overlay compose file is missing", () => {
    mkdirSync(join(tempDir, "shared", "security"), { recursive: true });
    writeFileSync(join(tempDir, "shared", "security", "squid.conf"), "# squid");

    const c = collector();
    validateSecurityInfra(c);
    expect(c.errors.some((e) => e.includes("docker-compose.security.yml not found"))).toBe(true);
  });

  it("errors when squid.conf is missing", () => {
    mkdirSync(join(tempDir, "shared", "security"), { recursive: true });
    writeFileSync(join(tempDir, "shared", "security", "docker-compose.security.yml"), "# overlay");

    const c = collector();
    validateSecurityInfra(c);
    expect(c.errors.some((e) => e.includes("squid.conf not found"))).toBe(true);
  });

  it("passes when both security files exist and no profiles violate rules", () => {
    writeSecurityFiles();
    writeProfile("ralph-docs", ["services:", "  app:", "    networks:", "      - ralph-internal"].join("\n"));

    const c = collector();
    validateSecurityInfra(c);
    expect(c.errors).toHaveLength(0);
  });

  it("errors when profile compose is missing ralph-internal network", () => {
    writeSecurityFiles();
    writeProfile("ralph-docs", ["services:", "  app:", "    image: node:20"].join("\n"));

    const c = collector();
    validateSecurityInfra(c);
    expect(c.errors.some((e) => e.includes("missing ralph-internal network"))).toBe(true);
  });

  it("errors when profile compose mounts Docker socket", () => {
    writeSecurityFiles();
    writeProfile(
      "ralph-docs",
      [
        "services:",
        "  app:",
        "    networks:",
        "      - ralph-internal",
        "    volumes:",
        "      - /var/run/docker.sock:/var/run/docker.sock",
      ].join("\n"),
    );

    const c = collector();
    validateSecurityInfra(c);
    expect(c.errors.some((e) => e.includes("Docker socket mount detected"))).toBe(true);
  });

  it("checks multiple profiles independently", () => {
    writeSecurityFiles();
    writeProfile("good-profile", ["services:", "  app:", "    networks:", "      - ralph-internal"].join("\n"));
    writeProfile("bad-profile", ["services:", "  app:", "    image: node:20"].join("\n"));

    const c = collector();
    validateSecurityInfra(c);
    // Only bad-profile should have errors
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toContain("bad-profile");
  });

  it("skips validation when profiles/ directory does not exist", () => {
    writeSecurityFiles();
    // No profiles/ directory
    const c = collector();
    validateSecurityInfra(c);
    expect(c.errors).toHaveLength(0);
  });

  it("skips profiles without docker-compose.yml", () => {
    writeSecurityFiles();
    mkdirSync(join(tempDir, "profiles", "no-compose"), { recursive: true });

    const c = collector();
    validateSecurityInfra(c);
    expect(c.errors).toHaveLength(0);
  });
});
