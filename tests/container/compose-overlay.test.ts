import { describe, it, expect } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { generateComposeOverlay } from "../../src/container/setup/compose-overlay.js";
import { createTempDir, writeManifest } from "../helpers/mcp-fs.js";

describe("Compose Overlay", () => {
  describe("generateComposeOverlay with extraVolumes", () => {
    it("includes extra volumes in the generated overlay", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      mkdirSync(sidecarDir, { recursive: true });
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"], sidecarPort: 9100,
      });

      const buildDir = join(mcpDir, ".build");
      mkdirSync(buildDir, { recursive: true });

      const extraVolumes = [
        "      - ./resources/data.md:/workspace/res/data.md:ro",
      ];

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], buildDir, sidecarDir, extraVolumes);

      expect(overlay).toContain("# Resource files");
      expect(overlay).toContain("./resources/data.md:/workspace/res/data.md:ro");
      expect(overlay).toContain("copilot-config.json:/workspace/.ralph/config.json:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("generates overlay with only resource volumes when no MCP servers", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");

      const extraVolumes = [
        "      - ./resources/guide.md:/workspace/res/guide.md:ro",
      ];

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir, sidecarDir, extraVolumes);

      expect(overlay).toContain("# Resource files");
      expect(overlay).toContain("./resources/guide.md:/workspace/res/guide.md:ro");
      expect(overlay).toContain("copilot-config.json:/workspace/.ralph/config.json:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });
  });

  describe("generateComposeOverlay environment variables", () => {
    it("always mounts mcp-config.json even with no MCP servers", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir, sidecarDir);

      expect(overlay).toContain("mcp-config.json:/workspace/.ralph/mcp-config.json:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("always mounts .gitignore into .ralph directory", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir, sidecarDir);

      expect(overlay).toContain(".gitignore:/workspace/.ralph/.gitignore:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("always injects base env vars even with no MCP servers", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir, sidecarDir);

      expect(overlay).toContain("environment:");
      expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
      expect(overlay).toContain('ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"');
      expect(overlay).toContain('CLAUDE_CODE_DISABLE_AUTOUPDATER: "1"');
      expect(overlay).toContain('CLAUDE_CODE_DISABLE_COST_WARNINGS: "1"');

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("does not inject MCP server env vars into container environment", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "jira", {
        name: "jira", command: "node", args: [], sidecarPort: 9100,
        requiredEnv: ["JIRA_PAT", "JIRA_EMAIL"],
      });

      const overlay = generateComposeOverlay(mcpDir, ["jira"], mcpDir, sidecarDir);

      expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
      expect(overlay).toContain('ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"');
      // Secrets never appear in the overlay — they go to gateway.json for the sidecar
      expect(overlay).not.toContain("JIRA_PAT");
      expect(overlay).not.toContain("JIRA_EMAIL");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("does not duplicate base vars when MCP server declares them", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "special", {
        name: "special", command: "node", args: [], sidecarPort: 9100,
        requiredEnv: ["GH_TOKEN", "CUSTOM_VAR"],
      });

      const overlay = generateComposeOverlay(mcpDir, ["special"], mcpDir, sidecarDir);

      const ghTokenLines = overlay.split("\n").filter((l: string) => l.includes("GH_TOKEN"));
      expect(ghTokenLines).toHaveLength(1);
      expect(overlay).not.toContain("CUSTOM_VAR");

      rmSync(mcpDir, { recursive: true, force: true });
    });
  });

  describe("MCP sidecar service", () => {
    it("includes mcp-sidecar service when servers are declared", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"], sidecarPort: 9100,
      });

      const buildDir = join(mcpDir, ".build");
      mkdirSync(buildDir, { recursive: true });

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], buildDir, sidecarDir);

      expect(overlay).toContain("mcp-sidecar:");
      expect(overlay).toContain(`context: ${sidecarDir}`);
      expect(overlay).toContain("/opt/mcp/servers:ro");
      expect(overlay).toContain("/opt/mcp/gateway/dist:ro");
      expect(overlay).toContain("gateway.json:/opt/mcp/config/gateway.json:ro");
      expect(overlay).toContain("no-new-privileges:true");
      expect(overlay).toContain("cap_drop:");
      expect(overlay).toContain("- ALL");
      expect(overlay).toContain("memory: 4G");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("omits mcp-sidecar service when no servers", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir, sidecarDir);

      expect(overlay).not.toContain("mcp-sidecar:");
      expect(overlay).not.toContain("/opt/mcp/servers");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("app depends on mcp-sidecar when servers are declared", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"], sidecarPort: 9100,
      });

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], mcpDir, sidecarDir);

      expect(overlay).toContain("depends_on:");
      expect(overlay).toContain("mcp-sidecar:");
      expect(overlay).toContain("condition: service_healthy");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("does not mount MCP server code into agent container", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "custom", command: "node", args: ["dist/bundle.js"],
        containerPath: "/opt/mcp/servers/test-server", sidecarPort: 9100,
      });

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], mcpDir, sidecarDir);

      // Server code only appears in sidecar volumes, not app volumes
      const appSection = overlay.split("mcp-sidecar:")[0];
      expect(appSection).not.toContain("/opt/mcp/servers");
      expect(appSection).not.toContain("mcp-servers:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("mounts shared attachment volume in both app and sidecar", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"], sidecarPort: 9100,
      });

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], mcpDir, sidecarDir);

      // App gets read-write, sidecar gets read-only — bind mount from buildDir
      const sidecarStart = overlay.indexOf("\n  mcp-sidecar:\n");
      const appSection = overlay.slice(0, sidecarStart);
      const sidecarSection = overlay.slice(sidecarStart);
      expect(appSection).toContain(`${mcpDir}/attachments:/tmp/mcp-attachments`);
      expect(sidecarSection).toContain(`${mcpDir}/attachments:/tmp/mcp-attachments:ro`);

      // No named volume declaration — uses bind mount
      expect(overlay).not.toContain("volumes:\n  mcp-attachments:");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("omits attachment volume when no MCP servers", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");

      const overlay = generateComposeOverlay(mcpDir, [], mcpDir, sidecarDir);

      expect(overlay).not.toContain("/tmp/mcp-attachments");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("mounts repo volume into sidecar for git operations", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"], sidecarPort: 9100,
      });

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], mcpDir, sidecarDir);

      const sidecarStart = overlay.indexOf("\n  mcp-sidecar:\n");
      const sidecarSection = overlay.slice(sidecarStart);
      expect(sidecarSection).toContain('"${TARGET_REPO_PATH}:/workspace"');

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("sets REPO_ROOT environment variable on sidecar", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"], sidecarPort: 9100,
      });

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], mcpDir, sidecarDir);

      const sidecarStart = overlay.indexOf("\n  mcp-sidecar:\n");
      const sidecarSection = overlay.slice(sidecarStart);
      expect(sidecarSection).toContain("environment:");
      expect(sidecarSection).toContain('REPO_ROOT: "/workspace"');

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("sidecar depends on egress-proxy", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"], sidecarPort: 9100,
      });

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], mcpDir, sidecarDir);

      // Find the sidecar service definition (second occurrence — first is app's depends_on)
      const sidecarServiceIdx = overlay.indexOf("  mcp-sidecar:\n    build:");
      const sidecarSection = overlay.slice(sidecarServiceIdx);
      // Sidecar has direct internet access via ralph-sidecar-external — no egress-proxy dependency
      expect(sidecarSection).toContain("ralph-sidecar-external:");
      expect(sidecarSection).not.toContain("egress-proxy:");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("includes extra_hosts for host.docker.internal resolution", () => {
      const mcpDir = createTempDir();
      const sidecarDir = join(mcpDir, "sidecar");
      writeManifest(mcpDir, "test-server", {
        name: "test-server", type: "npm", command: "npx", args: ["-y", "test"], sidecarPort: 9100,
      });

      const overlay = generateComposeOverlay(mcpDir, ["test-server"], mcpDir, sidecarDir);

      const sidecarServiceIdx = overlay.indexOf("  mcp-sidecar:\n    build:");
      const sidecarSection = overlay.slice(sidecarServiceIdx);
      expect(sidecarSection).toContain("extra_hosts:");
      expect(sidecarSection).toContain("host.docker.internal:host-gateway");

      rmSync(mcpDir, { recursive: true, force: true });
    });
  });
});
