import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import {
  loadMcpManifest,
  discoverMcpServers,
  generateMcpConfig,
  resolveAllProfileMcpConfigs,
} from "../../src/container/setup/mcp-config.js";

function createTempDir(): string {
  const dir = join(tmpdir(), `ralph-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(dir: string, name: string, manifest: Record<string, unknown>): void {
  const serverDir = join(dir, name);
  mkdirSync(serverDir, { recursive: true });
  writeFileSync(join(serverDir, "mcp-server.json"), JSON.stringify(manifest));
}

describe("MCP Config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadMcpManifest", () => {
    it("loads a valid manifest", () => {
      writeManifest(tempDir, "test-server", {
        name: "test-server",
        type: "npm",
        command: "npx",
        args: ["-y", "test-package"],
      });

      const manifest = loadMcpManifest(tempDir, "test-server");
      expect(manifest.name).toBe("test-server");
      expect(manifest.command).toBe("npx");
      expect(manifest.args).toEqual(["-y", "test-package"]);
    });

    it("throws for missing manifest", () => {
      expect(() => loadMcpManifest(tempDir, "nonexistent")).toThrow("MCP server manifest not found");
    });

    it("throws for manifest without name", () => {
      writeManifest(tempDir, "bad", { command: "node", args: [] });
      expect(() => loadMcpManifest(tempDir, "bad")).toThrow("name and command are required");
    });
  });

  describe("discoverMcpServers", () => {
    it("discovers servers with manifests", () => {
      writeManifest(tempDir, "server-a", { name: "a", command: "npx", args: [] });
      writeManifest(tempDir, "server-b", { name: "b", command: "node", args: [] });
      mkdirSync(join(tempDir, "no-manifest")); // no mcp-server.json

      const servers = discoverMcpServers(tempDir);
      expect(servers).toContain("server-a");
      expect(servers).toContain("server-b");
      expect(servers).not.toContain("no-manifest");
    });

    it("returns empty for nonexistent directory", () => {
      expect(discoverMcpServers("/nonexistent")).toEqual([]);
    });
  });

  describe("generateMcpConfig", () => {
    it("generates config for npm-type servers", () => {
      writeManifest(tempDir, "playwright", {
        name: "playwright",
        type: "npm",
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
      });

      const config = generateMcpConfig(tempDir, ["playwright"]);
      expect(config.mcpServers.playwright).toEqual({
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
      });
    });

    it("generates config for custom servers with containerPath", () => {
      writeManifest(tempDir, "discord-hitl", {
        name: "discord-hitl",
        type: "custom",
        command: "node",
        args: ["dist/index.js"],
        containerPath: "/workspace/.ralph/mcp-servers/discord-hitl",
        requiredEnv: ["DISCORD_BOT_TOKEN", "DISCORD_CHANNEL_ID"],
      });

      const config = generateMcpConfig(tempDir, ["discord-hitl"]);
      const entry = config.mcpServers["discord-hitl"];
      expect(entry.command).toBe("node");
      expect(entry.args[0]).toContain("/workspace/.ralph/mcp-servers/discord-hitl");
      expect(entry.env).toBeDefined();
      expect(entry.env!.DISCORD_BOT_TOKEN).toBe("${DISCORD_BOT_TOKEN}");
    });

    it("generates empty config for no servers", () => {
      const config = generateMcpConfig(tempDir, []);
      expect(config.mcpServers).toEqual({});
    });
  });

  describe("resolveAllProfileMcpConfigs", () => {
    it("generates mcp-config.json in profile build directories", () => {
      const rootDir = createTempDir();
      const mcpDir = join(rootDir, "shared/mcp-servers");
      const profileDir = join(rootDir, "profiles/test-profile");
      const agentsDir = join(profileDir, "agents");

      mkdirSync(agentsDir, { recursive: true });
      mkdirSync(mcpDir, { recursive: true });

      writeManifest(mcpDir, "test-server", {
        name: "test-server",
        type: "npm",
        command: "npx",
        args: ["-y", "test-pkg"],
      });

      writeFileSync(
        join(profileDir, "profile.json"),
        JSON.stringify({ mcpServers: ["test-server"] }),
      );

      resolveAllProfileMcpConfigs(rootDir);

      const configPath = join(agentsDir, ".build/mcp-config.json");
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.mcpServers["test-server"]).toBeDefined();

      rmSync(rootDir, { recursive: true, force: true });
    });
  });
});
