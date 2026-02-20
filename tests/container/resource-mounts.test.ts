import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateResourceVolumeMounts } from "../../src/container/setup/resource-mounts.js";

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
});
