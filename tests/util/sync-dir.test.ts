import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncDirectory } from "../../src/util/sync-dir";

let tmpDir: string;
let source: string;
let target: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "sync-dir-test-"));
  source = join(tmpDir, "source");
  target = join(tmpDir, "target");
  await mkdir(source);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** Writes `files` (paths relative to `dir`). */
async function writeTree(dir: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), content);
  }
}

describe("syncDirectory", () => {
  it("creates a missing target as a copy of the source tree", async () => {
    // Arrange
    await writeTree(source, { "a.md": "A", "skill/SKILL.md": "S", "skill/references/r.md": "R" });

    // Act
    await syncDirectory(source, target);

    // Assert
    expect(await readFile(join(target, "a.md"), "utf-8")).toBe("A");
    expect(await readFile(join(target, "skill", "references", "r.md"), "utf-8")).toBe("R");
  });

  it("keeps the target directory's inode and removes entries the source no longer has", async () => {
    // Arrange
    await writeTree(target, { "stale.md": "old", "gone/SKILL.md": "old", "keep.md": "old" });
    await writeTree(source, { "keep.md": "new" });
    const inode = (await stat(target)).ino;

    // Act
    await syncDirectory(source, target);

    // Assert
    expect((await stat(target)).ino).toBe(inode);
    expect(await readdir(target)).toEqual(["keep.md"]);
    expect(await readFile(join(target, "keep.md"), "utf-8")).toBe("new");
  });

  it("overwrites a changed file in place, keeping its inode for file bind mounts", async () => {
    // Arrange
    await writeTree(target, { "agent.md": "old" });
    await writeTree(source, { "agent.md": "new" });
    const inode = (await stat(join(target, "agent.md"))).ino;

    // Act
    await syncDirectory(source, target);

    // Assert
    expect((await stat(join(target, "agent.md"))).ino).toBe(inode);
    expect(await readFile(join(target, "agent.md"), "utf-8")).toBe("new");
  });

  it("does not rewrite an unchanged file", async () => {
    // Arrange
    await writeTree(target, { "agent.md": "same" });
    await writeTree(source, { "agent.md": "same" });
    const past = new Date("2000-01-01T00:00:00Z");
    await utimes(join(target, "agent.md"), past, past);

    // Act
    await syncDirectory(source, target);

    // Assert
    expect((await stat(join(target, "agent.md"))).mtime).toEqual(past);
  });

  it("keeps a persisting subdirectory's inode", async () => {
    // Arrange
    await writeTree(target, { "skill/SKILL.md": "old", "skill/extra.md": "x" });
    await writeTree(source, { "skill/SKILL.md": "new" });
    const inode = (await stat(join(target, "skill"))).ino;

    // Act
    await syncDirectory(source, target);

    // Assert
    expect((await stat(join(target, "skill"))).ino).toBe(inode);
    expect(await readdir(join(target, "skill"))).toEqual(["SKILL.md"]);
  });

  it("replaces a file with a directory and a directory with a file", async () => {
    // Arrange
    await writeTree(target, { "was-file": "f", "was-dir/x.md": "x" });
    await writeTree(source, { "was-file/inner.md": "i", "was-dir": "now a file" });

    // Act
    await syncDirectory(source, target);

    // Assert
    expect(await readFile(join(target, "was-file", "inner.md"), "utf-8")).toBe("i");
    expect(await readFile(join(target, "was-dir"), "utf-8")).toBe("now a file");
  });

  it("copies file modes so scripts stay executable", async () => {
    // Arrange
    await writeTree(source, { "run.sh": "#!/bin/sh" });
    await chmod(join(source, "run.sh"), 0o755);

    // Act
    await syncDirectory(source, target);

    // Assert
    expect((await stat(join(target, "run.sh"))).mode & 0o777).toBe(0o755);
  });

  it("empties the target for an empty source", async () => {
    // Arrange
    await writeTree(target, { "a.md": "A" });

    // Act
    await syncDirectory(source, target);

    // Assert
    expect(await readdir(target)).toEqual([]);
  });

  it("throws when the source does not exist", async () => {
    // Act & Assert
    await expect(syncDirectory(join(tmpDir, "missing"), target)).rejects.toThrow(/ENOENT/);
  });
});
