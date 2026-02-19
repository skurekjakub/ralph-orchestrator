import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateResourceVolumeMounts } from "../../src/container/setup/resource-mounts.js";
import { generateMcpComposeOverlay, resolveAllProfileMcpConfigs } from "../../src/container/setup/mcp-config.js";

function createTempDir(): string {
  const dir = join(tmpdir(), `ralph-res-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("Resource Mounts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("generateResourceVolumeMounts", () => {
    it("discovers files in resources/ and generates mount lines", () => {
      const resourcesDir = join(tempDir, "resources");
      mkdirSync(resourcesDir, { recursive: true });
      writeFileSync(join(resourcesDir, "revisions.md"), "# Revisions");
      writeFileSync(join(resourcesDir, "style-guide.md"), "# Style Guide");

      const mounts = generateResourceVolumeMounts(tempDir, {
        mountBase: "resources/ralph-resources",
      });

      expect(mounts).toHaveLength(2);
      expect(mounts[0]).toContain("./resources/revisions.md:/workspace/resources/ralph-resources/revisions.md:ro");
      expect(mounts[1]).toContain("./resources/style-guide.md:/workspace/resources/ralph-resources/style-guide.md:ro");
    });

    it("handles nested directories", () => {
      const subDir = join(tempDir, "resources", "subdir");
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, "nested.md"), "# Nested");

      const mounts = generateResourceVolumeMounts(tempDir, {
        mountBase: "resources/data",
      });

      expect(mounts).toHaveLength(1);
      expect(mounts[0]).toContain("./resources/subdir/nested.md:/workspace/resources/data/subdir/nested.md:ro");
    });

    it("returns empty array when resources/ directory does not exist", () => {
      const mounts = generateResourceVolumeMounts(tempDir, {
        mountBase: "resources/test",
      });

      expect(mounts).toEqual([]);
    });

    it("returns empty array when resources/ is empty", () => {
      mkdirSync(join(tempDir, "resources"), { recursive: true });

      const mounts = generateResourceVolumeMounts(tempDir, {
        mountBase: "resources/test",
      });

      expect(mounts).toEqual([]);
    });

    it("sorts files alphabetically", () => {
      const resourcesDir = join(tempDir, "resources");
      mkdirSync(resourcesDir, { recursive: true });
      writeFileSync(join(resourcesDir, "zebra.md"), "z");
      writeFileSync(join(resourcesDir, "alpha.md"), "a");

      const mounts = generateResourceVolumeMounts(tempDir, {
        mountBase: "res",
      });

      expect(mounts[0]).toContain("alpha.md");
      expect(mounts[1]).toContain("zebra.md");
    });
  });

  describe("generateMcpComposeOverlay with extraVolumes", () => {
    it("includes extra volumes in the generated overlay", () => {
      const mcpDir = createTempDir();
      const serverDir = join(mcpDir, "test-server");
      mkdirSync(serverDir, { recursive: true });
      writeFileSync(
        join(serverDir, "mcp-server.json"),
        JSON.stringify({ name: "test-server", type: "npm", command: "npx", args: ["-y", "test"] }),
      );

      const buildDir = join(mcpDir, ".build");
      mkdirSync(buildDir, { recursive: true });

      const extraVolumes = [
        "      - ./resources/data.md:/workspace/res/data.md:ro",
      ];

      const overlay = generateMcpComposeOverlay(mcpDir, ["test-server"], buildDir, extraVolumes);

      expect(overlay).toContain("# Resource files");
      expect(overlay).toContain("./resources/data.md:/workspace/res/data.md:ro");
      expect(overlay).toContain("mcp-servers:ro");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("generates overlay with only resource volumes when no MCP servers", () => {
      const mcpDir = createTempDir();

      const extraVolumes = [
        "      - ./resources/guide.md:/workspace/res/guide.md:ro",
      ];

      const overlay = generateMcpComposeOverlay(mcpDir, [], mcpDir, extraVolumes);

      expect(overlay).toContain("# Resource files");
      expect(overlay).toContain("./resources/guide.md:/workspace/res/guide.md:ro");
      expect(overlay).not.toContain("mcp-servers");

      rmSync(mcpDir, { recursive: true, force: true });
    });
  });

  describe("resolveAllProfileMcpConfigs with resources", () => {
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

      resolveAllProfileMcpConfigs(rootDir);

      const overlayPath = join(profileDir, "agents/.build/docker-compose.overlay.yml");
      expect(existsSync(overlayPath)).toBe(true);

      const overlay = readFileSync(overlayPath, "utf-8");
      expect(overlay).toContain("test-file.md:/workspace/resources/ralph-resources/test-file.md:ro");

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

      resolveAllProfileMcpConfigs(rootDir);

      const overlayPath = join(profileDir, "agents/.build/docker-compose.overlay.yml");
      expect(existsSync(overlayPath)).toBe(true);

      const overlay = readFileSync(overlayPath, "utf-8");
      expect(overlay).not.toContain("# Resource files");

      rmSync(rootDir, { recursive: true, force: true });
    });
  });
});
