import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateUrlPathRules,
  parseSquidDomains,
  parseSquidHostLoopbackPorts,
  generateAllowedUrls,
  writeCopilotConfig,
} from "../../src/container/setup/url-restrictions.js";
import type { UrlPathRules } from "../../src/container/setup/url-restrictions.js";

function createTempDir(): string {
  const dir = join(tmpdir(), `ralph-url-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(dir: string, name: string, manifest: Record<string, unknown>): void {
  const serverDir = join(dir, name);
  mkdirSync(serverDir, { recursive: true });
  writeFileSync(join(serverDir, "mcp-server.json"), JSON.stringify(manifest));
}

describe("URL Restrictions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("generateUrlPathRules", () => {
    it("collects allowedUrlPaths from enabled MCP server manifests", () => {
      writeManifest(tempDir, "jira-kentico", {
        name: "jira-kentico",
        command: "node",
        args: ["dist/bundle.mjs"],
        allowedUrlPaths: { "api.atlassian.com": ["/ex/jira/cloud-42/"] },
      });
      writeManifest(tempDir, "ado", {
        name: "ado",
        command: "npx",
        args: ["-y", "@azure-devops/mcp", "MyOrg"],
        allowedUrlPaths: { "dev.azure.com": ["/MyOrg/"] },
      });

      const rules = generateUrlPathRules(tempDir, ["jira-kentico", "ado"]);
      expect(rules.rules).toHaveLength(2);
      expect(rules.rules[0]).toEqual({
        domain: "api.atlassian.com",
        allowedPaths: ["/ex/jira/cloud-42/"],
      });
      expect(rules.rules[1]).toEqual({
        domain: "dev.azure.com",
        allowedPaths: ["/MyOrg/"],
      });
    });

    it("skips servers without allowedUrlPaths", () => {
      writeManifest(tempDir, "playwright", {
        name: "playwright",
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
      });
      writeManifest(tempDir, "ado", {
        name: "ado",
        command: "npx",
        args: ["-y", "@azure-devops/mcp", "Org"],
        allowedUrlPaths: { "dev.azure.com": ["/Org/"] },
      });

      const rules = generateUrlPathRules(tempDir, ["playwright", "ado"]);
      expect(rules.rules).toHaveLength(1);
      expect(rules.rules[0].domain).toBe("dev.azure.com");
    });

    it("merges paths when multiple servers share a domain", () => {
      writeManifest(tempDir, "server-a", {
        name: "server-a",
        command: "node",
        args: [],
        allowedUrlPaths: { "api.example.com": ["/v1/"] },
      });
      writeManifest(tempDir, "server-b", {
        name: "server-b",
        command: "node",
        args: [],
        allowedUrlPaths: { "api.example.com": ["/v2/"] },
      });

      const rules = generateUrlPathRules(tempDir, ["server-a", "server-b"]);
      expect(rules.rules).toHaveLength(1);
      expect(rules.rules[0].domain).toBe("api.example.com");
      expect(rules.rules[0].allowedPaths).toEqual(["/v1/", "/v2/"]);
    });

    it("returns empty rules when no servers have path restrictions", () => {
      writeManifest(tempDir, "playwright", {
        name: "playwright",
        command: "npx",
        args: [],
      });

      const rules = generateUrlPathRules(tempDir, ["playwright"]);
      expect(rules.rules).toEqual([]);
    });

    it("returns empty rules for empty server list", () => {
      const rules = generateUrlPathRules(tempDir, []);
      expect(rules.rules).toEqual([]);
    });

    it("skips servers whose manifest cannot be loaded", () => {
      const rules = generateUrlPathRules(tempDir, ["nonexistent"]);
      expect(rules.rules).toEqual([]);
    });

    it("sorts rules by domain", () => {
      writeManifest(tempDir, "z-server", {
        name: "z-server",
        command: "node",
        args: [],
        allowedUrlPaths: { "z.example.com": ["/z/"] },
      });
      writeManifest(tempDir, "a-server", {
        name: "a-server",
        command: "node",
        args: [],
        allowedUrlPaths: { "a.example.com": ["/a/"] },
      });

      const rules = generateUrlPathRules(tempDir, ["z-server", "a-server"]);
      expect(rules.rules[0].domain).toBe("a.example.com");
      expect(rules.rules[1].domain).toBe("z.example.com");
    });
  });

  describe("parseSquidDomains", () => {
    it("extracts domains from acl allowed_domains dstdomain lines", () => {
      const conf = [
        "acl localnet src 10.0.0.0/8",
        "acl allowed_domains dstdomain .github.com",
        "acl allowed_domains dstdomain api.atlassian.com",
        "acl allowed_domains dstdomain .dev.azure.com",
        "http_access allow allowed_domains",
      ].join("\n");

      expect(parseSquidDomains(conf)).toEqual([
        ".github.com",
        "api.atlassian.com",
        ".dev.azure.com",
      ]);
    });

    it("returns empty array for empty input", () => {
      expect(parseSquidDomains("")).toEqual([]);
    });

    it("ignores comments and unrelated acl lines", () => {
      const conf = [
        "# acl allowed_domains dstdomain .evil.com",
        "acl localnet src 10.0.0.0/8",
        "acl allowed_domains dstdomain .npmjs.org",
      ].join("\n");

      expect(parseSquidDomains(conf)).toEqual([".npmjs.org"]);
    });
  });

  describe("parseSquidHostLoopbackPorts", () => {
    it("extracts ports from host_loopback_ports acl", () => {
      const conf = "acl host_loopback_ports port 80 443 4500";
      expect(parseSquidHostLoopbackPorts(conf)).toEqual([80, 443, 4500]);
    });

    it("returns empty array when no host_loopback_ports acl", () => {
      const conf = "acl allowed_domains dstdomain .github.com";
      expect(parseSquidHostLoopbackPorts(conf)).toEqual([]);
    });

    it("deduplicates ports across multiple lines", () => {
      const conf = [
        "acl host_loopback_ports port 4500",
        "acl host_loopback_ports port 4500 8080",
      ].join("\n");
      const ports = parseSquidHostLoopbackPorts(conf);
      expect(ports).toContain(4500);
      expect(ports).toContain(8080);
      expect(ports.filter((p) => p === 4500)).toHaveLength(1);
    });
  });

  describe("generateAllowedUrls", () => {
    it("emits path-scoped patterns for path-restricted domains", () => {
      const rules: UrlPathRules = {
        rules: [
          { domain: "api.atlassian.com", allowedPaths: ["/ex/jira/cloud-42/"] },
          { domain: "dev.azure.com", allowedPaths: ["/MyOrg/"] },
        ],
      };

      const urls = generateAllowedUrls(
        ["api.atlassian.com", ".dev.azure.com"],
        rules,
      );

      expect(urls).toContain("https://api.atlassian.com/ex/jira/cloud-42/*");
      expect(urls).toContain("https://dev.azure.com/MyOrg/*");
    });

    it("emits domain-level patterns for unrestricted domains", () => {
      const urls = generateAllowedUrls(
        [".github.com", "registry.npmjs.org"],
        { rules: [] },
      );

      expect(urls).toContain("https://*.github.com");
      expect(urls).toContain("https://registry.npmjs.org");
    });

    it("deduplicates and sorts the output", () => {
      const urls = generateAllowedUrls(
        [".github.com", ".github.com", "api.github.com"],
        { rules: [] },
      );

      expect(urls).toEqual([
        "https://*.github.com",
        "https://api.github.com",
      ]);
    });

    it("handles mix of restricted and unrestricted domains", () => {
      const rules: UrlPathRules = {
        rules: [{ domain: "dev.azure.com", allowedPaths: ["/Org/"] }],
      };

      const urls = generateAllowedUrls(
        [".dev.azure.com", ".github.com", "registry.npmjs.org"],
        rules,
      );

      expect(urls).toContain("https://dev.azure.com/Org/*");
      expect(urls).toContain("https://*.github.com");
      expect(urls).toContain("https://registry.npmjs.org");
      // Should not have a wildcard for dev.azure.com
      expect(urls).not.toContain("https://*.dev.azure.com");
    });

    it("handles wildcard rule domains with leading dot", () => {
      const rules: UrlPathRules = {
        rules: [
          { domain: ".atlassian.com", allowedPaths: ["/ex/jira/cloud-99/"] },
        ],
      };

      const urls = generateAllowedUrls([".atlassian.com"], rules);

      expect(urls).toContain("https://*.atlassian.com/ex/jira/cloud-99/*");
      expect(urls).not.toContain("https://*.atlassian.com");
    });

    it("returns empty array for empty inputs", () => {
      expect(generateAllowedUrls([], { rules: [] })).toEqual([]);
    });

    it("includes host loopback patterns for each allowed port", () => {
      const urls = generateAllowedUrls([".github.com"], { rules: [] }, [4500, 8080]);

      expect(urls).toContain("http://host.docker.internal:4500/*");
      expect(urls).toContain("http://host.docker.internal:8080/*");
      expect(urls).toContain("https://*.github.com");
    });
  });

  describe("writeCopilotConfig", () => {
    it("writes copilot-config.json with allowed_urls derived from squid.conf and path rules", () => {
      const buildDir = join(tempDir, "build");
      mkdirSync(buildDir, { recursive: true });

      writeFileSync(
        join(buildDir, "squid.conf"),
        [
          "acl allowed_domains dstdomain api.atlassian.com",
          "acl allowed_domains dstdomain .dev.azure.com",
          "acl allowed_domains dstdomain .github.com",
          "acl host_loopback dstdomain host.docker.internal",
          "acl host_loopback_ports port 4500",
        ].join("\n"),
      );

      const rules: UrlPathRules = {
        rules: [
          { domain: "api.atlassian.com", allowedPaths: ["/ex/jira/cloud-1/"] },
          { domain: "dev.azure.com", allowedPaths: ["/TestOrg/"] },
        ],
      };

      writeCopilotConfig(buildDir, rules);

      const outPath = join(buildDir, "copilot-config.json");
      expect(existsSync(outPath)).toBe(true);

      const config = JSON.parse(readFileSync(outPath, "utf-8"));
      expect(config.allowed_urls).toContain("https://api.atlassian.com/ex/jira/cloud-1/*");
      expect(config.allowed_urls).toContain("https://dev.azure.com/TestOrg/*");
      expect(config.allowed_urls).toContain("https://*.github.com");
      expect(config.allowed_urls).toContain("http://host.docker.internal:4500/*");
    });

    it("does nothing when squid.conf does not exist", () => {
      const buildDir = join(tempDir, "build");
      mkdirSync(buildDir, { recursive: true });

      writeCopilotConfig(buildDir, { rules: [] });

      expect(existsSync(join(buildDir, "copilot-config.json"))).toBe(false);
    });
  });
});
