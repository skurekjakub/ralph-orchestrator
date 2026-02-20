import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateComposeOverlay } from "../../src/container/setup/compose-overlay.js";

function createTempDir(): string {
  const dir = join(tmpdir(), `ralph-overlay-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(dir: string, name: string, manifest: Record<string, unknown>): void {
  const serverDir = join(dir, name);
  mkdirSync(serverDir, { recursive: true });
  writeFileSync(join(serverDir, "mcp-server.json"), JSON.stringify(manifest));
}

describe("Compose Overlay", () => {
  describe("generateComposeOverlay with extraVolumes", () => {
    it("includes extra volumes in the generated overlay", () => {
      const mcpDir = createTempDir();
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"],
      });

      const buildDir = join(mcpDir, ".build");
      mkdirSync(buildDir, { recursive: true });

      const extraVolumes = [
        "      - ./resources/data.md:/workspace/res/data.md:ro",
      ];

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], buildDir, extraVolumes);

      expect(overlay).toContain("# Resource files");
      expect(overlay).toContain("./resources/data.md:/workspace/res/data.md:ro");
      expect(overlay).toContain("mcp-servers:ro");
      expect(overlay).toContain("copilot-config.json:/workspace/.ralph/config.json:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("generates overlay with only resource volumes when no MCP servers", () => {
      const mcpDir = createTempDir();

      const extraVolumes = [
        "      - ./resources/guide.md:/workspace/res/guide.md:ro",
      ];

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir, extraVolumes);

      expect(overlay).toContain("# Resource files");
      expect(overlay).toContain("./resources/guide.md:/workspace/res/guide.md:ro");
      expect(overlay).not.toContain("mcp-servers:ro");
      expect(overlay).toContain("copilot-config.json:/workspace/.ralph/config.json:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });
  });

  describe("generateComposeOverlay environment variables", () => {
    it("always mounts mcp-config.json even with no MCP servers", () => {
      const mcpDir = createTempDir();

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir);

      expect(overlay).toContain("mcp-config.json:/workspace/.ralph/mcp-config.json:ro");
      expect(overlay).not.toContain("mcp-servers:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("always injects base env vars even with no MCP servers", () => {
      const mcpDir = createTempDir();

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir);

      expect(overlay).toContain("environment:");
      expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
      expect(overlay).toContain('ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"');
      expect(overlay).toContain('CLAUDE_CODE_DISABLE_AUTOUPDATER: "1"');
      expect(overlay).toContain('CLAUDE_CODE_DISABLE_COST_WARNINGS: "1"');

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("does not inject MCP server env vars into container environment", () => {
      const mcpDir = createTempDir();
      writeManifest(mcpDir, "jira", {
        name: "jira", command: "node", args: [],
        requiredEnv: ["JIRA_PAT", "JIRA_EMAIL"],
      });

      const overlay = generateComposeOverlay(mcpDir, ["jira"], mcpDir);

      // Base vars present
      expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
      expect(overlay).toContain('ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"');
      // MCP-specific secrets NOT present (embedded in mcp-config.json instead)
      expect(overlay).not.toContain("JIRA_PAT");
      expect(overlay).not.toContain("JIRA_EMAIL");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("does not duplicate base vars when MCP server declares them", () => {
      const mcpDir = createTempDir();
      writeManifest(mcpDir, "special", {
        name: "special", command: "node", args: [],
        requiredEnv: ["GH_TOKEN", "CUSTOM_VAR"],
      });

      const overlay = generateComposeOverlay(mcpDir, ["special"], mcpDir);

      const ghTokenLines = overlay.split("\n").filter((l: string) => l.includes("GH_TOKEN"));
      expect(ghTokenLines).toHaveLength(1);
      // MCP-specific env var not injected into compose
      expect(overlay).not.toContain("CUSTOM_VAR");

      rmSync(mcpDir, { recursive: true, force: true });
    });
  });
});
