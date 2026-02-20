import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { generateMcpConfig } from "../../src/container/setup/mcp-config.js";

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

      const secrets = { DISCORD_BOT_TOKEN: "tok-123", DISCORD_CHANNEL_ID: "ch-456" };
      const config = generateMcpConfig(tempDir, ["discord-hitl"], secrets);
      const entry = config.mcpServers["discord-hitl"];
      expect(entry.command).toBe("node");
      expect(entry.args[0]).toContain("/workspace/.ralph/mcp-servers/discord-hitl");
      expect(entry.env).toEqual({ DISCORD_BOT_TOKEN: "tok-123", DISCORD_CHANNEL_ID: "ch-456" });
    });

    it("generates empty config for no servers", () => {
      const config = generateMcpConfig(tempDir, []);
      expect(config.mcpServers).toEqual({});
    });

    it("includes tool allowlist when manifest declares tools", () => {
      writeManifest(tempDir, "ado", {
        name: "ado",
        type: "npm",
        command: "npx",
        args: ["-y", "@azure-devops/mcp"],
        tools: ["ado_create_pull_request", "ado_list_pull_requests"],
      });

      const config = generateMcpConfig(tempDir, ["ado"]);
      expect(config.mcpServers.ado.tools).toEqual([
        "ado_create_pull_request",
        "ado_list_pull_requests",
      ]);
    });

    it("omits tools field when manifest has no tools", () => {
      writeManifest(tempDir, "playwright", {
        name: "playwright",
        type: "npm",
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
      });

      const config = generateMcpConfig(tempDir, ["playwright"]);
      expect(config.mcpServers.playwright.tools).toBeUndefined();
    });

    it("omits env block when no secrets are available", () => {
      writeManifest(tempDir, "no-secrets", {
        name: "no-secrets",
        type: "npm",
        command: "npx",
        args: ["-y", "test"],
        requiredEnv: ["MISSING_TOKEN"],
      });

      const config = generateMcpConfig(tempDir, ["no-secrets"], {});
      expect(config.mcpServers["no-secrets"].env).toBeUndefined();
    });

    it("omits tools field when manifest has empty tools array", () => {
      writeManifest(tempDir, "test-server", {
        name: "test-server",
        type: "npm",
        command: "npx",
        args: ["-y", "test"],
        tools: [],
      });

      const config = generateMcpConfig(tempDir, ["test-server"]);
      expect(config.mcpServers["test-server"].tools).toBeUndefined();
    });
  });
});
