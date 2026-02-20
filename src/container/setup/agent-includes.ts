import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import type { Logger } from "../../logger.js";

const INCLUDE_PATTERN = /^[ \t]*<!-- include: (.+?) -->$/gm;

/**
 * Resolve include markers in agent files.
 *
 * Reads agent template files from agentDir, replaces include markers with
 * content from includesDir, and writes the resolved files to the profile's .build/ directory.
 *
 * The .build/ directory is what Docker compose should mount. The template
 * files in agentDir are the source of truth.
 */
export function resolveAgentIncludes(agentDir: string, includesDir: string, logger?: Logger): void {
  const profileDir = dirname(agentDir);
  const buildDir = join(profileDir, ".build");
  mkdirSync(buildDir, { recursive: true });

  const files = readdirSync(agentDir).filter((f) => f.endsWith(".agent.md"));

  for (const file of files) {
    const templatePath = join(agentDir, file);
    let content = readFileSync(templatePath, "utf-8");

    let includeCount = 0;
    content = content.replace(INCLUDE_PATTERN, (_match, includeName: string) => {
      const includePath = join(includesDir, includeName.trim());
      if (!existsSync(includePath)) {
        throw new Error(
          `Agent include not found: ${includeName} (referenced in ${file}, expected at ${includePath})`
        );
      }
      includeCount++;
      return readFileSync(includePath, "utf-8").trimEnd();
    });

    writeFileSync(join(buildDir, file), content, "utf-8");
    if (includeCount > 0) {
      logger?.info(`  → ${file}: resolved ${includeCount} include${includeCount === 1 ? "" : "s"}`);
    }
  }
}

/**
 * Resolve includes for all profiles in the workspace.
 *
 * Scans profile agent directories and resolves includes from
 * shared/agent-includes/. Call this before starting any containers.
 */
export function resolveAllProfileIncludes(rootDir?: string, logger?: Logger): void {
  const root = rootDir ?? process.cwd();
  const includesDir = resolve(root, "shared/agent-includes");

  if (!existsSync(includesDir)) {
    logger?.warn("Agent includes directory not found, skipping include resolution");
    return;
  }

  const profilesDir = resolve(root, "profiles");
  if (!existsSync(profilesDir)) return;

  for (const profileId of readdirSync(profilesDir)) {
    const agentDir = join(profilesDir, profileId, "agents");
    if (existsSync(agentDir)) {
      logger?.info(`Resolving agent includes for profile ${profileId}`);
      resolveAgentIncludes(agentDir, includesDir, logger);
    }
  }
}
