import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateProfileSquidConf } from "../../src/container/setup/squid-config";
import { createTempDir } from "../helpers/mcp-fs";

const BASELINE_CONTENT = [
  "acl allowed_domains dstdomain .githubcopilot.com",
  "acl allowed_domains dstdomain .anthropic.com",
  "",
  "# {{PROFILE_DOMAINS}}",
  "",
  "http_access allow allowed_domains",
  "http_access deny all",
].join("\n");

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

  it("returns baseline with placeholder comment when no profile domains provided", () => {
    const result = generateProfileSquidConf(baselinePath);
    expect(result).toContain(".githubcopilot.com");
    expect(result).toContain(".anthropic.com");
    expect(result).toContain("# (no profile-specific domains)");
    expect(result).not.toContain("{{PROFILE_DOMAINS}}");
  });

  it("injects profile domains at the marker position", () => {
    const result = generateProfileSquidConf(baselinePath, [".npmjs.org", "dev.azure.com"]);
    expect(result).toContain("acl allowed_domains dstdomain .npmjs.org");
    expect(result).toContain("acl allowed_domains dstdomain dev.azure.com");
    expect(result).toContain("# Profile-specific domains");
    expect(result).not.toContain("{{PROFILE_DOMAINS}}");
  });

  it("preserves baseline domains alongside profile domains", () => {
    const result = generateProfileSquidConf(baselinePath, [".rubygems.org"]);
    expect(result).toContain(".githubcopilot.com");
    expect(result).toContain(".anthropic.com");
    expect(result).toContain(".rubygems.org");
  });
});
