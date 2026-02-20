import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateProfileSquidConf } from "../../src/container/setup/squid-config.js";

function createTempDir(): string {
  const dir = join(tmpdir(), `ralph-squid-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(dir: string, name: string, manifest: Record<string, unknown>): void {
  const serverDir = join(dir, name);
  mkdirSync(serverDir, { recursive: true });
  writeFileSync(join(serverDir, "mcp-server.json"), JSON.stringify(manifest));
}

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
        proxyDomains: [".example.com", ".shared.org"],
      });
      writeManifest(tempDir, "server-b", {
        name: "b", type: "npm", command: "npx", args: [],
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
      });

      const result = generateProfileSquidConf(baselinePath, tempDir, ["no-domains"]);
      expect(result).toContain("no MCP proxy domains");
      expect(result).not.toContain("auto-generated");
    });

    it("preserves baseline content around the marker", () => {
      writeManifest(tempDir, "srv", {
        name: "srv", type: "npm", command: "npx", args: [],
        proxyDomains: [".test.io"],
      });

      const result = generateProfileSquidConf(baselinePath, tempDir, ["srv"]);
      expect(result).toContain("acl allowed_domains dstdomain .github.com");
      expect(result).toContain("http_access allow allowed_domains");
    });
  });
});
