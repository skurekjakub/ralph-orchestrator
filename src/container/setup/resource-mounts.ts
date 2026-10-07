import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { IResourceMountConfig } from "../../config/types";

/**
 * Discover resource files in a profile's `resources/` directory and generate read-only bind mounts.
 *
 * Recursively scans `profileDir/resources/` for files (ignoring directories) and mounts each one under
 * `/workspace/<mountBase>/`. Host paths are relative to the profile directory, which is the compose project
 * directory.
 *
 * @param profileDir Absolute path to the profile directory (e.g. `profiles/ralph-docs`).
 * @param config Resource config with the container mount base path.
 * @returns Mounts in compose short syntax, sorted by file path.
 */
export function generateResourceVolumeMounts(profileDir: string, config: IResourceMountConfig): string[] {
  const resourcesDir = join(profileDir, "resources");
  if (!existsSync(resourcesDir)) return [];

  return collectFiles(resourcesDir, resourcesDir).map(
    (relPath) => `./resources/${relPath}:/workspace/${config.mountBase}/${relPath}:ro`,
  );
}

/** Recursively collect file paths relative to the base directory. */
function collectFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else {
      results.push(relative(baseDir, fullPath));
    }
  }
  return results.sort();
}
