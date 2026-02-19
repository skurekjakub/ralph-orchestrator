import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** Configuration for auto-discovered resource mounts. */
export interface ResourceConfig {
  mountBase: string;
}

/**
 * Discover resource files in a profile's `resources/` directory and generate
 * Docker Compose volume mount lines.
 *
 * Recursively scans `profileDir/resources/` for files (ignoring directories)
 * and produces `:ro` volume mounts under `/workspace/<mountBase>/`.
 *
 * @param profileDir Absolute path to the profile directory (e.g. `profiles/ralph-docs`).
 * @param config Resource config with the container mount base path.
 * @returns Array of volume mount strings (YAML-ready, indented for `services.app.volumes`).
 */
export function generateResourceVolumeMounts(
  profileDir: string,
  config: ResourceConfig,
): string[] {
  const resourcesDir = join(profileDir, "resources");
  if (!existsSync(resourcesDir)) return [];

  const mounts: string[] = [];
  const files = collectFiles(resourcesDir, resourcesDir);

  for (const relPath of files) {
    const hostPath = `./resources/${relPath}`;
    const containerPath = `/workspace/${config.mountBase}/${relPath}`;
    mounts.push(`      - ${hostPath}:${containerPath}:ro`);
  }

  return mounts;
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
