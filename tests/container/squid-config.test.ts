import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateProfileSquidConf } from "../../src/container/setup/squid-config.js";
import { createTempDir } from "../helpers/mcp-fs.js";

const BASELINE_CONTENT = [
  "acl allowed_domains dstdomain .githubcopilot.com",
  "acl allowed_domains dstdomain .anthropic.com",
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

  it("returns the baseline content unchanged", () => {
    const result = generateProfileSquidConf(baselinePath);
    expect(result).toBe(BASELINE_CONTENT);
  });

  it("does not inject any MCP proxy domains", () => {
    const result = generateProfileSquidConf(baselinePath);
    expect(result).not.toContain("atlassian");
    expect(result).not.toContain("auto-generated");
    expect(result).not.toContain("MCP server domains");
  });
});
