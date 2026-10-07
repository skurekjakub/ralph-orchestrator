import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseSquidDomains,
  parseSquidHostLoopbackPorts,
  generateAllowedUrls,
  writeCopilotConfig,
} from "../../src/container/setup/url-restrictions";
import { createTempDir } from "../helpers/mcp-fs";
import { createMockLogger } from "../helpers/mocks";

describe("URL Restrictions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
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

      expect(parseSquidDomains(conf)).toEqual([".github.com", "api.atlassian.com", ".dev.azure.com"]);
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
      const conf = ["acl host_loopback_ports port 4500", "acl host_loopback_ports port 4500 8080"].join("\n");
      const ports = parseSquidHostLoopbackPorts(conf);
      expect(ports).toContain(4500);
      expect(ports).toContain(8080);
      expect(ports.filter((p) => p === 4500)).toHaveLength(1);
    });
  });

  describe("generateAllowedUrls", () => {
    it("emits wildcard patterns for dot-prefixed domains", () => {
      const urls = generateAllowedUrls([".github.com", ".anthropic.com"]);

      expect(urls).toContain("https://*.github.com");
      expect(urls).toContain("https://*.anthropic.com");
    });

    it("emits exact patterns for non-dot domains", () => {
      const urls = generateAllowedUrls(["registry.npmjs.org", "api.github.com"]);

      expect(urls).toContain("https://registry.npmjs.org");
      expect(urls).toContain("https://api.github.com");
    });

    it("deduplicates and sorts the output", () => {
      const urls = generateAllowedUrls([".github.com", ".github.com", "api.github.com"]);

      expect(urls).toEqual(["https://*.github.com", "https://api.github.com"]);
    });

    it("returns empty array for empty inputs", () => {
      expect(generateAllowedUrls([])).toEqual([]);
    });

    it("includes host loopback patterns for each allowed port", () => {
      const urls = generateAllowedUrls([".github.com"], [4500, 8080]);

      expect(urls).toContain("http://host.docker.internal:4500/*");
      expect(urls).toContain("http://host.docker.internal:8080/*");
      expect(urls).toContain("https://*.github.com");
    });
  });

  describe("writeCopilotConfig", () => {
    it("writes copilot-config.json with allowed_urls derived from squid.conf", () => {
      const buildDir = join(tempDir, "build");
      mkdirSync(buildDir, { recursive: true });

      writeFileSync(
        join(buildDir, "squid.conf"),
        [
          "acl allowed_domains dstdomain .githubcopilot.com",
          "acl allowed_domains dstdomain .anthropic.com",
          "acl allowed_domains dstdomain .npmjs.org",
          "acl host_loopback dstdomain host.docker.internal",
          "acl host_loopback_ports port 4500",
        ].join("\n"),
      );

      writeCopilotConfig(buildDir, createMockLogger());

      const outPath = join(buildDir, "copilot-config.json");
      expect(existsSync(outPath)).toBe(true);

      const config = JSON.parse(readFileSync(outPath, "utf-8"));
      expect(config.allowed_urls).toContain("https://*.githubcopilot.com");
      expect(config.allowed_urls).toContain("https://*.anthropic.com");
      expect(config.allowed_urls).toContain("https://*.npmjs.org");
      expect(config.allowed_urls).toContain("http://host.docker.internal:4500/*");
    });

    it("writes nothing and warns when squid.conf does not exist", () => {
      // Arrange
      const buildDir = join(tempDir, "build");
      mkdirSync(buildDir, { recursive: true });
      const logger = createMockLogger();

      // Act
      writeCopilotConfig(buildDir, logger);

      // Assert
      expect(existsSync(join(buildDir, "copilot-config.json"))).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("No squid.conf"));
    });
  });
});
