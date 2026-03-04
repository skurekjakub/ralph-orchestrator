import { Dirent, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { resolvePath } from "../util/path.js";
import { discoverMcpServers, loadMcpManifest } from "../container/setup/mcp-manifest.js";
import { VcsProvider } from "../config/types.js";
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

      if (v.stages != null && !Array.isArray(v.stages)) {
        errors.push(`${vPrefix}: stages must be an array`);
        continue;
      }
      const stages = v.stages ?? [];
      if (stages.length === 0) {
        errors.push(`${vPrefix}: at least one stage is required`);
      }
      for (let si = 0; si < stages.length; si++) {
        const s = stages[si];
        const sPrefix = `${vPrefix}/stages[${si}]`;
        if (!s?.agent) {
          errors.push(`${sPrefix}: agent name is required`);
        } else if (agentFiles.length > 0 && !availableAgents.includes(s.agent)) {
          errors.push(
            `${sPrefix}: agent "${s.agent}" not found in ${prefix}/agents/\n` +
            `  Available agents: ${availableAgents.join(", ")}\n` +
            `  Agent files use the pattern: <name>.agent.md`
          );
        }
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

    // Validate that the git PAT env var is set for repo sync
    const vcsProvider = p.vcsProvider ?? VcsProvider.Ado;
    const repoPat: string = p.repoPat ?? (vcsProvider === VcsProvider.GitHub ? "GH_TOKEN" : "ADO_PAT");
    if (!process.env[repoPat]) {
      errors.push(
        `${prefix}: env var ${repoPat} is not set (required for repo-sync hook)\n` +
        `  Set ${repoPat} in .env or change repoPat in profile.json`
      );
    }

    validateMcpServers(p, resolve(process.cwd(), "shared/mcp-servers"), prefix, errors);
    validateVariantSkills(p, resolve(process.cwd(), "shared/skills"), prefix, errors);

    if (Array.isArray(p.githubMcpTools) && p.githubMcpTools.length === 0) {
      errors.push(
        `${prefix}: githubMcpTools is an empty array — list at least one tool name, or use false to disable the server`,
      );
    }
  }

  validateTriggerUniqueness(allVariants, errors);
}

/**
 * Validate that all skills referenced by each variant exist in shared/skills/
 * (searching subdirectories recursively).
 */
function validateVariantSkills(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON structure
  profile: any,
  skillsDir: string,
  prefix: string,
  errors: string[],
): void {
  if (!Array.isArray(profile.variants)) return;
  for (let i = 0; i < profile.variants.length; i++) {
    const v = profile.variants[i];
    if (!Array.isArray(v?.stages)) continue;
    for (let si = 0; si < v.stages.length; si++) {
      const stage = v.stages[si];
      if (stage?.skills != null && !Array.isArray(stage.skills)) continue;
      const skills = stage?.skills ?? [];
      if (skills.length === 0) continue;
      const sPrefix = `${prefix}/variants[${i}]/stages[${si}]`;
      for (const skill of skills) {
        if (typeof skill !== "string") continue;
        if (!findSkillDirSync(skillsDir, skill)) {
          errors.push(
            `${sPrefix}: skill "${skill}" not found in shared/skills/\n` +
            `  Create shared/skills/${skill}/`
          );
        }
      }
    }
  }
}

/** Synchronous recursive search for a skill directory by name. */
function findSkillDirSync(skillsDir: string, name: string): boolean {
  // Fast path: flat layout
  if (existsSync(join(skillsDir, name, "SKILL.md"))) return true;

  // Recursive search through subdirectories
  let entries: Dirent[];
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true }) as Dirent[];
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".build") continue;
    const nested = join(skillsDir, entry.name);
    if (existsSync(join(nested, name, "SKILL.md"))) return true;
    if (findSkillDirSync(nested, name)) return true;
  }
  return false;
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
 * Also checks that sidecarPort values are unique across all servers and that
 * profiles provide all `requiredConfig` env vars declared by each manifest.
 */
function validateMcpServers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validating unknown JSON structure
  profile: any,
  mcpServersDir: string,
  prefix: string,
  errors: string[],
): void {
  const rawEntries: unknown[] = profile.mcpServers ?? [];
  if (rawEntries.length === 0) return;

  // Parse mixed mcpServers entries to extract names and per-server configs
  const serverNames: string[] = [];
  const serverConfigs: Record<string, Record<string, string>> = {};
  for (const entry of rawEntries) {
    if (typeof entry === "string") {
      serverNames.push(entry);
    } else if (entry && typeof entry === "object" && "name" in entry) {
      const obj = entry as { name: string; env?: Record<string, string> };
      serverNames.push(obj.name);
      if (obj.env && Object.keys(obj.env).length > 0) {
        serverConfigs[obj.name] = obj.env;
      }
    }
  }

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

  for (const serverName of serverNames) {
    if (!available.includes(serverName)) {
      errors.push(
        `${prefix}: MCP server "${serverName}" not found in shared/mcp-servers/\n` +
        `  Available servers: ${available.length > 0 ? available.join(", ") : "(none)"}\n` +
        `  Create shared/mcp-servers/${serverName}/mcp-server.json`
      );
      continue;
    }

    // Cross-check requiredConfig from manifest against profile-level configs
    try {
      const manifest = loadMcpManifest(mcpServersDir, serverName);
      if (manifest.requiredConfig && manifest.requiredConfig.length > 0) {
        const provided = serverConfigs[serverName] ?? {};
        const missing = manifest.requiredConfig.filter((k) => !(k in provided));
        if (missing.length > 0) {
          errors.push(
            `${prefix}: MCP server "${serverName}" requires config [${missing.join(", ")}] ` +
            `but the profile does not provide them\n` +
            `  Add an object entry in mcpServers with env: { ${missing.map((k) => `"${k}": "..."`).join(", ")} }`
          );
        }
      }
    } catch {
      // manifest load errors handled elsewhere
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
