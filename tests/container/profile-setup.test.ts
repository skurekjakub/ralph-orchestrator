import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveAllProfileSetup } from "../../src/container/setup/profile-setup.js";
import { createTempDir, writeManifest } from "../helpers/mcp-fs.js";

describe("Profile Setup", () => {
  describe("resolveAllProfileSetup", () => {
    it("generates mcp-config.json and squid.conf in profile build directories", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const securityDir = join(rootDir, "shared/security");
      const profileDir = join(rootDir, "profiles/test-profile");

      mkdirSync(join(profileDir, "agents"), { recursive: true });
      mkdirSync(mcpDir, { recursive: true });
      mkdirSync(securityDir, { recursive: true });

      writeManifest(mcpDir, "test-server", {
        name: "test-server",
        type: "npm",
        command: "npx",
        args: ["-y", "test-pkg"],
        sidecarPort: 9100,
      });

      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({ mcpServers: ["test-server"] }),
      );

      writeFileSync(
        join(securityDir, "squid.conf"),
        "acl allowed_domains dstdomain .github.com\n# MCP_PROXY_DOMAINS\nhttp_access allow allowed_domains",
      );

      resolveAllProfileSetup(rootDir);

      const configPath = join(profileDir, ".build/mcp-config.json");
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.mcpServers["test-server"]).toBeDefined();
      expect(config.mcpServers["test-server"].type).toBe("http");
      expect(config.mcpServers["test-server"].url).toContain("mcp-sidecar:9100/mcp");

      // Gateway config should be generated
      const gatewayPath = join(profileDir, ".build/gateway.json");
      expect(existsSync(gatewayPath)).toBe(true);
      const gateway = JSON.parse(readFileSync(gatewayPath, "utf-8"));
      expect(gateway.servers).toHaveLength(1);
      expect(gateway.servers[0].name).toBe("test-server");
      expect(gateway.servers[0].port).toBe(9100);

      const squidPath = join(profileDir, ".build/squid.conf");
      expect(existsSync(squidPath)).toBe(true);

      const squidConf = readFileSync(squidPath, "utf-8");
      // Squid config is the static baseline — MCP server proxyDomains are no longer injected
      // (the sidecar has unrestricted direct internet access via ralph-sidecar-external)
      expect(squidConf).not.toContain(".test-domain.com");
      expect(squidConf).toContain(".github.com");

      // Attachments directory should exist and be world-writable
      const attachDir = join(profileDir, ".build/attachments");
      expect(existsSync(attachDir)).toBe(true);
      expect(statSync(attachDir).mode & 0o777).toBe(0o777);

      // .gitignore file should be generated to hide .ralph/ from git inside the container.
      // .github/skills/ and .github/agents/ are excluded via .git/info/exclude by RepoSyncHook.
      const gitignorePath = join(profileDir, ".build/.gitignore");
      expect(existsSync(gitignorePath)).toBe(true);
      expect(readFileSync(gitignorePath, "utf-8")).toBe("*\n");

      const githubGitignorePath = join(profileDir, ".build/github-gitignore");
      expect(existsSync(githubGitignorePath)).toBe(false);

      rmSync(rootDir, { recursive: true, force: true });
    });

    it("does not inject MCP env vars into compose overlay", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const profileDir = join(rootDir, "profiles/test-profile");

      mkdirSync(join(profileDir, "agents"), { recursive: true });

      writeManifest(mcpDir, "test-mcp", {
        name: "test-mcp",
        type: "custom",
        command: "node",
        args: ["index.js"],
        sidecarPort: 9100,
        requiredEnv: ["MCP_TOKEN"],
      });

      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({ mcpServers: ["test-mcp"] }),
      );

      resolveAllProfileSetup(rootDir);

      const overlayPath = join(profileDir, ".build/docker-compose.overlay.yml");
      const overlay = readFileSync(overlayPath, "utf-8");

      // Base env vars always present
      expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
      expect(overlay).toContain('ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"');
      expect(overlay).toContain('CLAUDE_CODE_DISABLE_AUTOUPDATER: "1"');
      // MCP env vars NOT in compose overlay (embedded in mcp-config.json instead)
      expect(overlay).not.toContain("MCP_TOKEN");

      rmSync(rootDir, { recursive: true, force: true });
    });

    it("generates copilot-config.json with domain-level URLs from squid.conf", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const securityDir = join(rootDir, "shared/security");
      const profileDir = join(rootDir, "profiles/test-profile");

      mkdirSync(join(profileDir, "agents"), { recursive: true });
      mkdirSync(mcpDir, { recursive: true });
      mkdirSync(securityDir, { recursive: true });

      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({ mcpServers: [] }),
      );

      writeFileSync(
        join(securityDir, "squid.conf"),
        [
          "acl allowed_domains dstdomain .githubcopilot.com",
          "acl allowed_domains dstdomain .anthropic.com",
          "acl allowed_domains dstdomain .npmjs.org",
          "http_access allow allowed_domains",
        ].join("\n"),
      );

      resolveAllProfileSetup(rootDir);

      const configPath = join(profileDir, ".build/copilot-config.json");
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.allowed_urls).toContain("https://*.githubcopilot.com");
      expect(config.allowed_urls).toContain("https://*.anthropic.com");
      expect(config.allowed_urls).toContain("https://*.npmjs.org");
      // MCP servers no longer contribute to the Copilot allowlist — sidecar has direct internet access
      expect(config.allowed_urls.some((u: string) => u.includes("atlassian"))).toBe(false);

      rmSync(rootDir, { recursive: true, force: true });
    });

    it("includes resource mounts in the generated overlay", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const profileDir = join(rootDir, "profiles/test-profile");

      mkdirSync(join(profileDir, "agents"), { recursive: true });
      mkdirSync(join(profileDir, "resources"), { recursive: true });
      mkdirSync(mcpDir, { recursive: true });

      writeFileSync(join(profileDir, "resources", "test-file.md"), "# Test");
      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({
          mcpServers: [],
          resources: { mountBase: "resources/ralph-resources" },
        }),
      );

      resolveAllProfileSetup(rootDir);

      const overlayPath = join(profileDir, ".build/docker-compose.overlay.yml");
      expect(existsSync(overlayPath)).toBe(true);

      const overlay = readFileSync(overlayPath, "utf-8");
      expect(overlay).toContain("test-file.md:/workspace/resources/ralph-resources/test-file.md:ro");

      rmSync(rootDir, { recursive: true, force: true });
    });

    it("generates per-profile gateway.json with only declared servers", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const profileDir = join(rootDir, "profiles/test-profile");

      mkdirSync(join(profileDir, "agents"), { recursive: true });
      mkdirSync(mcpDir, { recursive: true });

      writeManifest(mcpDir, "server-a", {
        name: "server-a", type: "npm", command: "npx", args: ["-y", "a"], sidecarPort: 9100,
      });
      writeManifest(mcpDir, "server-b", {
        name: "server-b", type: "npm", command: "npx", args: ["-y", "b"], sidecarPort: 9101,
      });
      writeManifest(mcpDir, "server-c", {
        name: "server-c", type: "npm", command: "npx", args: ["-y", "c"], sidecarPort: 9102,
      });

      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({ mcpServers: ["server-a", "server-c"] }),
      );

      resolveAllProfileSetup(rootDir);

      const gateway = JSON.parse(readFileSync(join(profileDir, ".build/gateway.json"), "utf-8"));
      expect(gateway.servers).toHaveLength(2);
      expect(gateway.servers.map((s: { name: string }) => s.name)).toEqual(["server-a", "server-c"]);

      rmSync(rootDir, { recursive: true, force: true });
    });

    it("skips resource mounts when resources config is not set", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const profileDir = join(rootDir, "profiles/test-profile");

      mkdirSync(join(profileDir, "agents"), { recursive: true });
      mkdirSync(mcpDir, { recursive: true });

      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({ mcpServers: [] }),
      );

      resolveAllProfileSetup(rootDir);

      const overlayPath = join(profileDir, ".build/docker-compose.overlay.yml");
      expect(existsSync(overlayPath)).toBe(true);

      const overlay = readFileSync(overlayPath, "utf-8");
      expect(overlay).not.toContain("# Agent definitions, skills, and resource files");

      rmSync(rootDir, { recursive: true, force: true });
    });

    it("includes agent mounts from agents/ directory in the overlay", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const profileDir = join(rootDir, "profiles/test-profile");

      mkdirSync(join(profileDir, "agents"), { recursive: true });
      mkdirSync(mcpDir, { recursive: true });

      writeFileSync(join(profileDir, "agents", "ralph.ralph.agent.md"), "# Agent");
      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({ mcpServers: [] }),
      );

      resolveAllProfileSetup(rootDir);

      const overlayPath = join(profileDir, ".build/docker-compose.overlay.yml");
      const overlay = readFileSync(overlayPath, "utf-8");
      expect(overlay).toContain("ralph.ralph.agent.md:/workspace/.github/agents/ralph.ralph.agent.md:ro");

      rmSync(rootDir, { recursive: true, force: true });
    });

    it("includes skill mounts from shared/skills/ in the overlay", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const skillsDir = join(rootDir, "shared/skills");
      const profileDir = join(rootDir, "profiles/test-profile");

      mkdirSync(join(profileDir, "agents"), { recursive: true });
      mkdirSync(mcpDir, { recursive: true });
      mkdirSync(join(skillsDir, "git-workflow"), { recursive: true });
      writeFileSync(join(skillsDir, "git-workflow", "SKILL.md"), "# Skill");

      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({ mcpServers: [], variants: [{ stages: [{ agent: "ralph", role: "primary", skills: ["git-workflow"] }], match: { commentTrigger: "@go" } }] }),
      );

      resolveAllProfileSetup(rootDir);

      const overlayPath = join(profileDir, ".build/docker-compose.overlay.yml");
      const overlay = readFileSync(overlayPath, "utf-8");
      expect(overlay).toContain("git-workflow:/workspace/.github/skills/git-workflow:ro");

      rmSync(rootDir, { recursive: true, force: true });
    });
  });
});
