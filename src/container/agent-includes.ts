import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const INCLUDE_PATTERN = /^<!-- include: (.+?) -->$/gm;

/**
 * Resolve include markers in agent files.
 *
 * Reads agent template files from agentDir, replaces include markers with
 * content from includesDir, and writes the resolved files to agentDir/.build/.
 *
 * The .build/ directory is what Docker compose should mount. The template
 * files in agentDir are the source of truth.
 */
export function resolveAgentIncludes(agentDir: string, includesDir: string): void {
  const buildDir = join(agentDir, ".build");
  if (!existsSync(buildDir)) {
    mkdirSync(buildDir, { recursive: true });
  }

  const files = readdirSync(agentDir).filter((f) => f.endsWith(".agent.md"));

  for (const file of files) {
    const templatePath = join(agentDir, file);
    let content = readFileSync(templatePath, "utf-8");

    content = content.replace(INCLUDE_PATTERN, (_match, includeName: string) => {
      const includePath = join(includesDir, includeName.trim());
      if (!existsSync(includePath)) {
        throw new Error(
          `Agent include not found: ${includeName} (referenced in ${file}, expected at ${includePath})`
        );
      }
      return readFileSync(includePath, "utf-8").trimEnd();
    });

    writeFileSync(join(buildDir, file), content, "utf-8");
  }
}

/**
 * Resolve includes for all profiles in the workspace.
 *
 * Scans profile agent directories and resolves includes from
 * shared/agent-includes/. Call this before starting any containers.
 */
export function resolveAllProfileIncludes(rootDir?: string): void {
  const root = rootDir ?? process.cwd();
  const includesDir = resolve(root, "shared/agent-includes");

  if (!existsSync(includesDir)) return;

  const profilesDir = resolve(root, "profiles");
  if (!existsSync(profilesDir)) return;

  for (const profileId of readdirSync(profilesDir)) {
    const agentDir = join(profilesDir, profileId, "agents");
    if (existsSync(agentDir)) {
      resolveAgentIncludes(agentDir, includesDir);
    }
  }
}
