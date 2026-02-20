import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateProfileSquidConf } from "../../src/container/setup/squid-config.js";
import { createTempDir, writeManifest } from "../helpers/mcp-fs.js";

describe("Squid Config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("generateProfileSquidConf", () => {
    let baselinePath: string;

    beforeEach(() => {
      baselinePath = join(tempDir, "squid-baseline.conf");
      writeFileSync(baselinePath, [
        "acl allowed_domains dstdomain .github.com",
        "",
        "# MCP_PROXY_DOMAINS",
        "",
        "http_access allow allowed_domains",
      ].join("\n"));
    });

    it("injects MCP proxy domains from manifests", () => {
      writeManifest(tempDir, "jira", {
        name: "jira",
        type: "custom",
        command: "node",
        args: ["dist/bundle.mjs"],
        sidecarPort: 9100,
        proxyDomains: [".atlassian.com", ".atlassian.net"],
      });

      const result = generateProfileSquidConf(baselinePath, tempDir, ["jira"]);
      expect(result).toContain("acl allowed_domains dstdomain .atlassian.com");
      expect(result).toContain("acl allowed_domains dstdomain .atlassian.net");
      expect(result).toContain("auto-generated from profile mcpServers");
    });

    it("deduplicates domains from multiple servers", () => {
      writeManifest(tempDir, "server-a", {
        name: "a", type: "npm", command: "npx", args: [],
        sidecarPort: 9100,
        proxyDomains: [".example.com", ".shared.org"],
      });
      writeManifest(tempDir, "server-b", {
        name: "b", type: "npm", command: "npx", args: [],
        sidecarPort: 9101,
        proxyDomains: [".shared.org", ".other.com"],
      });

      const result = generateProfileSquidConf(baselinePath, tempDir, ["server-a", "server-b"]);
      const matches = result.match(/\.shared\.org/g);
      expect(matches).toHaveLength(1);
      expect(result).toContain(".example.com");
      expect(result).toContain(".other.com");
    });

    it("produces fallback comment when no servers have proxy domains", () => {
      writeManifest(tempDir, "no-domains", {
        name: "no-domains", type: "npm", command: "npx", args: [],
        sidecarPort: 9100,
      });

      const result = generateProfileSquidConf(baselinePath, tempDir, ["no-domains"]);
      expect(result).toContain("no MCP proxy domains");
      expect(result).not.toContain("auto-generated");
    });

    it("preserves baseline content around the marker", () => {
      writeManifest(tempDir, "srv", {
        name: "srv", type: "npm", command: "npx", args: [],
        sidecarPort: 9100,
        proxyDomains: [".test.io"],
      });

      const result = generateProfileSquidConf(baselinePath, tempDir, ["srv"]);
      expect(result).toContain("acl allowed_domains dstdomain .github.com");
      expect(result).toContain("http_access allow allowed_domains");
    });
  });
});
