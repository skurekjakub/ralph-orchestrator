import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { resolvePath } from "../util/path.js";
import { discoverMcpServers, loadMcpManifest } from "../container/setup/mcp-manifest.js";
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

  /** Collected across all profiles for cross-profile trigger uniqueness check. */
  const allVariants: Array<{
    profileId: string;
    variantIndex: number;
    projects: string[];
    trigger: string;
  }> = [];

  for (const dirName of dirs) {
    const profileJsonPath = join(profilesDir, dirName, "profile.json");
    const prefix = `profiles/${dirName}`;

    if (!existsSync(profileJsonPath)) {
      errors.push(`${prefix}: profile.json not found`);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON structure
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

    if (p.cli === "claude") {
      errors.push(
        `${prefix}: cli "claude" is not supported — Claude Code CLI currently lacks sufficient security hardening. Use "copilot" (default).`
      );
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

      if (v.match?.commentTrigger && v.match?.projects?.length) {
        allVariants.push({
          profileId: dirName,
          variantIndex: i,
          projects: v.match.projects,
          trigger: v.match.commentTrigger,
        });
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
    validateMcpServers(p, resolve(process.cwd(), "shared/mcp-servers"), prefix, errors);

    if (Array.isArray(p.githubMcpTools) && p.githubMcpTools.length === 0) {
      errors.push(
        `${prefix}: githubMcpTools is an empty array — list at least one tool name, or use false to disable the server`,
      );
    }
  }

  validateTriggerUniqueness(allVariants, errors);
}

/**
 * Verify that every .agent.md file in the agents/ directory has a matching
 * volume mount in docker-compose.yml sourcing from .build/<filename>.
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
    const expectedMount = `./.build/${agentFile}`;
    if (!composeContent.includes(expectedMount)) {
      errors.push(
        `${prefix}: agent file "${agentFile}" has no volume mount in docker-compose.yml\n` +
        `  Add a mount: ${expectedMount}:/workspace/.github/agents/${agentFile}:ro`
      );
    }
  }
}

export interface VariantTriggerInfo {
  profileId: string;
  variantIndex: number;
  projects: string[];
  trigger: string;
}

/**
 * Validate that all MCP servers referenced by a profile exist in shared/mcp-servers/.
 *
 * Also checks that sidecarPort values are unique across all servers.
 */
function validateMcpServers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON structure
  profile: any,
  mcpServersDir: string,
  prefix: string,
  errors: string[],
): void {
  const mcpServers: string[] = profile.mcpServers ?? [];
  if (mcpServers.length === 0) return;

  const available = discoverMcpServers(mcpServersDir);

  const portMap = new Map<number, string>();
  for (const serverName of available) {
    try {
      const manifest = loadMcpManifest(mcpServersDir, serverName);
      const existing = portMap.get(manifest.sidecarPort);
      if (existing) {
        errors.push(
          `MCP server "${serverName}" and "${existing}" both use sidecarPort ${manifest.sidecarPort}\n` +
          `  Each server must have a unique sidecarPort`
        );
      } else {
        portMap.set(manifest.sidecarPort, serverName);
      }
    } catch {
      // loadMcpManifest already validates — errors will surface at startup
    }
  }

  for (const serverName of mcpServers) {
    if (!available.includes(serverName)) {
      errors.push(
        `${prefix}: MCP server "${serverName}" not found in shared/mcp-servers/\n` +
        `  Available servers: ${available.length > 0 ? available.join(", ") : "(none)"}\n` +
        `  Create shared/mcp-servers/${serverName}/mcp-server.json`
      );
    }
  }
}

/**
 * Verify that no two variants with overlapping projects share an identical
 * comment trigger (case-insensitive).
 *
 * The trigger scanner uses word-boundary matching, so `@Ralph` does NOT
 * match inside `@RalphAutocomplete`. Only exact (case-insensitive) trigger
 * collisions on overlapping projects are flagged.
 */
export function validateTriggerUniqueness(
  variants: readonly VariantTriggerInfo[],
  errors: string[],
): void {
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const a = variants[i];
      const b = variants[j];

      const sharedProjects = a.projects.filter((p) => b.projects.includes(p));
      if (sharedProjects.length === 0) continue;

      if (a.trigger.toLowerCase() === b.trigger.toLowerCase()) {
        const aLabel = `profiles/${a.profileId}/variants[${a.variantIndex}]`;
        const bLabel = `profiles/${b.profileId}/variants[${b.variantIndex}]`;
        errors.push(
          `Ambiguous comment trigger: "${a.trigger}" (${aLabel}) and "${b.trigger}" (${bLabel}) ` +
          `overlap on projects [${sharedProjects.join(", ")}]\n` +
          `  A single comment would trigger both variants. Each trigger must be unique across variants that share projects`
        );
      }
    }
  }
}
