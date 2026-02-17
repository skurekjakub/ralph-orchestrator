import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { resolvePath } from "../util/path.js";
import type { ValidationCollector } from "./types.js";

export function validateProfiles({ errors, warnings }: ValidationCollector): void {
  const profilesDir = resolve(process.cwd(), "profiles");

  if (!existsSync(profilesDir)) {
    errors.push(
      `profiles/ directory not found at ${profilesDir}\n` +
      `  Create profile directories under profiles/ with a profile.json in each`
    );
    return;
  }

  let dirs: string[];
  try {
    dirs = readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    errors.push(`Cannot read profiles directory: ${profilesDir}`);
    return;
  }

  if (dirs.length === 0) {
    errors.push(`No profile directories found in ${profilesDir}`);
    return;
  }

  for (const dirName of dirs) {
    const profileJsonPath = join(profilesDir, dirName, "profile.json");
    const prefix = `profiles/${dirName}`;

    if (!existsSync(profileJsonPath)) {
      errors.push(`${prefix}: profile.json not found`);
      continue;
    }

    let p: any;
    try {
      p = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
    } catch (e) {
      errors.push(`${prefix}: profile.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (!p.repo) {
      errors.push(`${prefix}: repo path is required`);
    } else {
      const repoPath = resolvePath(p.repo);
      if (!existsSync(repoPath)) {
        errors.push(
          `${prefix}: repo path does not exist: ${repoPath}\n` +
          `  Clone the repository or update the path in profile.json`
        );
      }
    }

    const composePath = resolve(process.cwd(), `profiles/${dirName}/docker-compose.yml`);
    if (!existsSync(composePath)) {
      errors.push(
        `${prefix}: docker-compose.yml not found\n` +
        `  Create profiles/${dirName}/docker-compose.yml`
      );
    }

    const variants = p.variants;
    if (!Array.isArray(variants) || variants.length === 0) {
      errors.push(`${prefix}: at least one variant is required`);
      continue;
    }

    const agentsDir = join(profilesDir, dirName, "agents");
    const agentFiles = existsSync(agentsDir)
      ? readdirSync(agentsDir).filter((f) => f.endsWith(".agent.md"))
      : [];
    const availableAgents = agentFiles.map((f) => f.replace(".agent.md", ""));

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const vPrefix = `${prefix}/variants[${i}]`;

      if (!v.agent) {
        errors.push(`${vPrefix}: agent name is required`);
      } else if (agentFiles.length > 0 && !availableAgents.includes(v.agent)) {
        errors.push(
          `${vPrefix}: agent "${v.agent}" not found in ${prefix}/agents/\n` +
          `  Available agents: ${availableAgents.join(", ")}\n` +
          `  Agent files use the pattern: <name>.agent.md`
        );
      }

      if (!v.match?.projects?.length) {
        warnings.push(`${vPrefix}: no match.projects defined — this variant won't match any issues`);
      }

      if (!v.match?.commentTrigger) {
        errors.push(`${vPrefix}: match.commentTrigger is required`);
      }

      const revisionStatuses: string[] = v.match?.revisionStatuses ?? [];
      const statuses: string[] = v.match?.statuses ?? [];
      if (revisionStatuses.length > 0 && statuses.length > 0) {
        const statusesLower = new Set(statuses.map((s: string) => s.toLowerCase()));
        for (const rs of revisionStatuses) {
          if (!statusesLower.has(rs.toLowerCase())) {
            errors.push(
              `${vPrefix}: revisionStatuses value "${rs}" is not in statuses [${statuses.join(", ")}]\n` +
              `  revisionStatuses must be a subset of statuses`
            );
          }
        }
      }
    }

    validateAgentMounts(composePath, agentsDir, agentFiles, prefix, errors);
  }
}

/**
 * Verify that every .agent.md file in the agents/ directory has a matching
 * volume mount in docker-compose.yml sourcing from agents/.build/<filename>.
 */
function validateAgentMounts(
  composePath: string,
  _agentsDir: string,
  agentFiles: string[],
  prefix: string,
  errors: string[],
): void {
  if (!existsSync(composePath) || agentFiles.length === 0) return;

  let composeContent: string;
  try {
    composeContent = readFileSync(composePath, "utf-8");
  } catch {
    return;
  }

  for (const agentFile of agentFiles) {
    const expectedMount = `./agents/.build/${agentFile}`;
    if (!composeContent.includes(expectedMount)) {
      errors.push(
        `${prefix}: agent file "${agentFile}" has no volume mount in docker-compose.yml\n` +
        `  Add a mount: ${expectedMount}:/workspace/.github/agents/${agentFile}:ro`
      );
    }
  }
}
