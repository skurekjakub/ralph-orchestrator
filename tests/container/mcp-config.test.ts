import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { generateMcpConfig, generateGatewayConfig } from "../../src/container/setup/mcp-config.js";
import { createTempDir, writeManifest } from "../helpers/mcp-fs.js";

describe("MCP Config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("generateMcpConfig", () => {
    it("generates URL-based config for npm-type servers", () => {
      writeManifest(tempDir, "playwright", {
        name: "playwright",
        type: "npm",
        command: "npx",
        args: ["@playwright/mcp"],
        sidecarPort: 9103,
      });

      const config = generateMcpConfig(tempDir, ["playwright"]);
      expect(config.mcpServers.playwright).toEqual({
        type: "http",
        url: "http://mcp-sidecar:9103/mcp",
      });
    });

    it("generates URL-based config for custom servers", () => {
      writeManifest(tempDir, "discord-hitl", {
        name: "discord-hitl",
        type: "custom",
        command: "node",
        args: ["dist/index.js"],
        containerPath: "/opt/mcp/servers/discord-hitl",
        sidecarPort: 9102,
        requiredEnv: ["DISCORD_BOT_TOKEN", "DISCORD_CHANNEL_ID"],
      });

      const config = generateMcpConfig(tempDir, ["discord-hitl"]);
      const entry = config.mcpServers["discord-hitl"];
      expect(entry).toEqual({
        type: "http",
        url: "http://mcp-sidecar:9102/mcp",
      });
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
        sidecarPort: 9101,
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
        args: ["@playwright/mcp"],
        sidecarPort: 9103,
      });

      const config = generateMcpConfig(tempDir, ["playwright"]);
      expect(config.mcpServers.playwright.tools).toBeUndefined();
    });

    it("omits tools field when manifest has empty tools array", () => {
      writeManifest(tempDir, "test-server", {
        name: "test-server",
        type: "npm",
        command: "npx",
        args: ["-y", "test"],
        sidecarPort: 9200,
        tools: [],
      });

      const config = generateMcpConfig(tempDir, ["test-server"]);
      expect(config.mcpServers["test-server"].tools).toBeUndefined();
    });

    it("does not include secrets in URL-mode config", () => {
      writeManifest(tempDir, "jira", {
        name: "jira",
        type: "custom",
        command: "node",
        args: ["dist/bundle.js"],
        containerPath: "/opt/mcp/servers/jira",
        sidecarPort: 9100,
        requiredEnv: ["JIRA_PAT", "JIRA_EMAIL"],
      });

      const config = generateMcpConfig(tempDir, ["jira"]);
      const entry = config.mcpServers.jira;
      expect(entry).not.toHaveProperty("env");
      expect(entry).not.toHaveProperty("command");
      expect(entry).not.toHaveProperty("args");
      expect(JSON.stringify(entry)).not.toContain("JIRA_PAT");
    });
  });

  describe("generateGatewayConfig", () => {
    it("generates gateway config for custom server with secrets", () => {
      writeManifest(tempDir, "jira", {
        name: "jira",
        type: "custom",
        command: "node",
        args: ["dist/bundle.js"],
        containerPath: "/opt/mcp/servers/jira",
        sidecarPort: 9100,
        requiredEnv: ["JIRA_PAT", "JIRA_EMAIL"],
      });

      const secrets = { JIRA_PAT: "secret-pat", JIRA_EMAIL: "test@test.com" };
      const config = generateGatewayConfig(tempDir, ["jira"], secrets);
      expect(config.servers).toHaveLength(1);
      expect(config.servers[0]).toEqual({
        name: "jira",
        type: "custom",
        port: 9100,
        command: "node",
        args: ["/opt/mcp/servers/jira/dist/bundle.js"],
        env: { JIRA_PAT: "secret-pat", JIRA_EMAIL: "test@test.com" },
      });
    });

    it("generates gateway config for npm server without secrets", () => {
      writeManifest(tempDir, "playwright", {
        name: "playwright",
        type: "npm",
        command: "npx",
        args: ["@playwright/mcp"],
        sidecarPort: 9103,
      });

      const config = generateGatewayConfig(tempDir, ["playwright"]);
      expect(config.servers).toHaveLength(1);
      expect(config.servers[0]).toEqual({
        name: "playwright",
        type: "npm",
        port: 9103,
        command: "npx",
        args: ["@playwright/mcp"],
        env: {},
      });
    });

    it("generates gateway config with multiple servers", () => {
      writeManifest(tempDir, "jira", {
        name: "jira", type: "custom", command: "node", args: ["dist/bundle.js"],
        containerPath: "/opt/mcp/servers/jira", sidecarPort: 9100, requiredEnv: ["JIRA_PAT"],
      });
      writeManifest(tempDir, "ado", {
        name: "ado", type: "custom", command: "node", args: ["dist/bundle.js"],
        containerPath: "/opt/mcp/servers/ado", sidecarPort: 9101, requiredEnv: ["ADO_PAT"],
      });

      const secrets = { JIRA_PAT: "j-pat", ADO_PAT: "a-pat" };
      const config = generateGatewayConfig(tempDir, ["jira", "ado"], secrets);
      expect(config.servers).toHaveLength(2);
      expect(config.servers[0].name).toBe("jira");
      expect(config.servers[1].name).toBe("ado");
      expect(config.servers[0].env).toEqual({ JIRA_PAT: "j-pat" });
      expect(config.servers[1].env).toEqual({ ADO_PAT: "a-pat" });
    });

    it("omits secrets not present in env", () => {
      writeManifest(tempDir, "discord", {
        name: "discord", type: "custom", command: "node", args: ["dist/bundle.mjs"],
        containerPath: "/opt/mcp/servers/discord", sidecarPort: 9102,
        requiredEnv: ["DISCORD_BOT_TOKEN", "DISCORD_CHANNEL_ID"],
        optionalEnv: ["DISCORD_TASK_CONTEXT"],
      });

      const secrets = { DISCORD_BOT_TOKEN: "tok" };
      const config = generateGatewayConfig(tempDir, ["discord"], secrets);
      expect(config.servers[0].env).toEqual({ DISCORD_BOT_TOKEN: "tok" });
    });

    it("generates empty servers list for no servers", () => {
      const config = generateGatewayConfig(tempDir, []);
      expect(config.servers).toEqual([]);
    });

    it("excludes manifests on disk that are not in the requested server list", () => {
      writeManifest(tempDir, "server-a", {
        name: "server-a", type: "npm", command: "npx", args: ["-y", "a"], sidecarPort: 9100,
      });
      writeManifest(tempDir, "server-b", {
        name: "server-b", type: "npm", command: "npx", args: ["-y", "b"], sidecarPort: 9101,
      });
      writeManifest(tempDir, "server-c", {
        name: "server-c", type: "npm", command: "npx", args: ["-y", "c"], sidecarPort: 9102,
      });

      const config = generateGatewayConfig(tempDir, ["server-b"]);

      expect(config.servers).toHaveLength(1);
      expect(config.servers[0].name).toBe("server-b");
      expect(config.servers[0].port).toBe(9101);
    });
  });
});
