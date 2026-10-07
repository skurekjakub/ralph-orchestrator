import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateProfileSquidConf } from "../../src/container/setup/squid-config";
import { createTempDir } from "../helpers/mcp-fs";

const BASELINE_CONTENT = [
  "acl allowed_domains dstdomain .baseline.example",
  "",
  "# {{PROFILE_DOMAINS}}",
  "",
  "http_access allow allowed_domains",
  "http_access deny all",
].join("\n");

/** The `acl allowed_domains` domains of a squid.conf, in order. */
function allowedDomains(conf: string): string[] {
  return conf
    .split("\n")
    .filter((line) => line.startsWith("acl allowed_domains dstdomain "))
    .map((line) => line.slice("acl allowed_domains dstdomain ".length));
}

describe("generateProfileSquidConf", () => {
  let tempDir: string;
  let baselinePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    baselinePath = join(tempDir, "squid-baseline.conf");
    writeFileSync(baselinePath, BASELINE_CONTENT);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("keeps the baseline and replaces the marker with a comment when there are no extra domains", () => {
    // Act
    const result = generateProfileSquidConf(baselinePath, { cliDomains: [], profileDomains: [] });

    // Assert
    expect(allowedDomains(result)).toEqual([".baseline.example"]);
    expect(result).toContain("# (no extra domains)");
    expect(result).not.toContain("{{PROFILE_DOMAINS}}");
  });

  it("adds the agent CLIs' domains before the profile's domains", () => {
    // Act
    const result = generateProfileSquidConf(baselinePath, {
      cliDomains: [".anthropic.com"],
      profileDomains: [".npmjs.org", "dev.azure.com"],
    });

    // Assert
    expect(allowedDomains(result)).toEqual([".baseline.example", ".anthropic.com", ".npmjs.org", "dev.azure.com"]);
    expect(result).toContain("# Agent CLI domains");
    expect(result).toContain("# Profile-specific domains");
  });

  it("lists a domain once when two CLIs, or a CLI and the profile, both need it", () => {
    // Act
    const result = generateProfileSquidConf(baselinePath, {
      cliDomains: ["github.com", ".anthropic.com", "github.com"],
      profileDomains: ["github.com", ".npmjs.org"],
    });

    // Assert
    expect(allowedDomains(result)).toEqual([".baseline.example", "github.com", ".anthropic.com", ".npmjs.org"]);
  });

  it("throws when the baseline is missing", () => {
    // Act & Assert
    expect(() =>
      generateProfileSquidConf(join(tempDir, "missing.conf"), { cliDomains: [], profileDomains: [] }),
    ).toThrow(/ENOENT/);
  });
});
