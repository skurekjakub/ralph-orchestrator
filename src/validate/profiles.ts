import { Dirent, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ZodError } from "zod";
import { resolvePath } from "../util/path.js";
import { toErrorMessage } from "../util/error.js";
import { discoverMcpServers, loadMcpManifest, type McpServerManifest } from "../container/setup/mcp-manifest.js";
import { resolveProfileVariants } from "../config/profile-variants.js";
import { profileFileSchema } from "../config/schemas.js";
import type { IAgentProfile } from "../config/types.js";
import { validateStageClis } from "./stages.js";
import type { ValidationCollector } from "./types.js";

/**
 * Validate every `profiles/<id>/profile.json`: its schema, the repo, compose file, agents, skills
 * and MCP servers it references, its stages' CLIs and models, and the repo-sync PAT.
 *
 * A profile that breaks the schema gets only its schema errors reported.
 *
 * @returns The resolved variants of every profile that passed the schema, for checks that span
 *   profiles.
 */
export function validateProfiles({ errors, warnings }: ValidationCollector): IAgentProfile[] {
  const profilesDir = resolve(process.cwd(), "profiles");

  if (!existsSync(profilesDir)) {
    errors.push(
      `profiles/ directory not found at ${profilesDir}\n` +
        `  Create profile directories under profiles/ with a profile.json in each`,
    );
    return [];
  }

  let dirs: string[];
  try {
    dirs = readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    errors.push(`Cannot read profiles directory: ${profilesDir}`);
    return [];
  }

  if (dirs.length === 0) {
    errors.push(`No profile directories found in ${profilesDir}`);
    return [];
  }

  /** Collected across all profiles for cross-profile trigger uniqueness check. */
  const allVariants: VariantTriggerInfo[] = [];
  const resolved: IAgentProfile[] = [];

  for (const dirName of dirs) {
    const profileJsonPath = join(profilesDir, dirName, "profile.json");
    const prefix = `profiles/${dirName}`;

    if (!existsSync(profileJsonPath)) {
      errors.push(`${prefix}: profile.json not found`);
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
    } catch (e) {
      errors.push(`${prefix}: profile.json is not valid JSON: ${toErrorMessage(e)}`);
      continue;
    }

    const composePath = resolve(process.cwd(), `profiles/${dirName}/docker-compose.yml`);
    if (!existsSync(composePath)) {
      errors.push(`${prefix}: docker-compose.yml not found\n` + `  Create profiles/${dirName}/docker-compose.yml`);
    }

    const parsed = profileFileSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(...formatSchemaIssues(prefix, parsed.error));
      continue;
    }
    const profile = parsed.data;

    const repoPath = resolvePath(profile.repo);
    if (!existsSync(repoPath)) {
      errors.push(
        `${prefix}: repo path does not exist: ${repoPath}\n` +
          `  Clone the repository or update the path in profile.json`,
      );
    }

    let variants: IAgentProfile[];
    try {
      variants = resolveProfileVariants(profile, dirName);
    } catch (e) {
      errors.push(toErrorMessage(e));
      continue;
    }

    const agentsDir = join(profilesDir, dirName, "agents");
    const agentFiles = existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith(".agent.md")) : [];
    const availableAgents = agentFiles.map((f) => f.replace(".agent.md", ""));

    profile.variants.forEach((v, i) => {
      const vPrefix = `${prefix}/variants[${i}]`;

      v.stages.forEach((stage, si) => {
        if (agentFiles.length > 0 && !availableAgents.includes(stage.agent)) {
          errors.push(
            `${vPrefix}/stages[${si}]: agent "${stage.agent}" not found in ${prefix}/agents/\n` +
              `  Available agents: ${availableAgents.join(", ")}\n` +
              `  Agent files use the pattern: <name>.agent.md`,
          );
        }
      });

      if (v.match.projects.length === 0) {
        warnings.push(`${vPrefix}: no match.projects defined — this variant won't match any issues`);
      } else {
        allVariants.push({
          profileId: dirName,
          variantIndex: i,
          projects: v.match.projects,
          trigger: v.match.commentTrigger,
        });
      }

      const { statuses, revisionStatuses } = v.match;
      if (revisionStatuses.length > 0 && statuses.length > 0) {
        const statusesLower = new Set(statuses.map((st) => st.toLowerCase()));
        for (const rs of revisionStatuses) {
          if (!statusesLower.has(rs.toLowerCase())) {
            errors.push(
              `${vPrefix}: revisionStatuses value "${rs}" is not in statuses [${statuses.join(", ")}]\n` +
                `  revisionStatuses must be a subset of statuses`,
            );
          }
        }
      }
    });

    validateStageClis(profile, variants, prefix, errors);

    const { repoPat } = variants[0];
    if (!process.env[repoPat]) {
      errors.push(
        `${prefix}: env var ${repoPat} is not set (required for repo-sync hook)\n` +
          `  Set ${repoPat} in .env or change repoPat in profile.json`,
      );
    }

    validateMcpServers(variants, resolve(process.cwd(), "shared/mcp-servers"), prefix, errors);
    validateVariantSkills(variants, resolve(process.cwd(), "shared/skills"), prefix, errors);

    resolved.push(...variants);
  }

  validateTriggerUniqueness(allVariants, errors);
  return resolved;
}

/** One error per schema issue, located by its profile.json path (`profiles/x/variants[0]/stages[1]/cli`). */
function formatSchemaIssues(prefix: string, error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.reduce<string>((acc, segment) => {
      if (typeof segment === "number") return `${acc}[${segment}]`;
      return acc === "" ? String(segment) : `${acc}/${String(segment)}`;
    }, "");
    return path === "" ? `${prefix}: ${issue.message}` : `${prefix}/${path}: ${issue.message}`;
  });
}

/**
 * Validate that all skills referenced by each variant's stages exist in shared/skills/
 * (searching subdirectories recursively).
 */
function validateVariantSkills(
  variants: readonly IAgentProfile[],
  skillsDir: string,
  prefix: string,
  errors: string[],
): void {
  variants.forEach((variant, i) => {
    variant.stages.forEach((stage, si) => {
      for (const skill of stage.skills) {
        if (!findSkillDirSync(skillsDir, skill)) {
          errors.push(
            `${prefix}/variants[${i}]/stages[${si}]: skill "${skill}" not found in shared/skills/\n` +
              `  Create shared/skills/${skill}/`,
          );
        }
      }
    });
  });
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
 * Validate the MCP servers each variant runs: profile-level servers plus its own.
 *
 * Checks that every server exists in shared/mcp-servers/, that sidecarPort values are unique
 * across all servers, and that each variant's effective server config provides every
 * `requiredConfig` env var the manifest declares. A missing-config finding shared by several
 * variants is reported once, naming them all.
 */
function validateMcpServers(
  variants: readonly IAgentProfile[],
  mcpServersDir: string,
  prefix: string,
  errors: string[],
): void {
  const serverNames = [...new Set(variants.flatMap((v) => v.mcpServers))];
  if (serverNames.length === 0) return;

  const available = discoverMcpServers(mcpServersDir);

  const portMap = new Map<number, string>();
  for (const serverName of available) {
    try {
      const manifest = loadMcpManifest(mcpServersDir, serverName);
      const existing = portMap.get(manifest.sidecarPort);
      if (existing) {
        errors.push(
          `MCP server "${serverName}" and "${existing}" both use sidecarPort ${manifest.sidecarPort}\n` +
            `  Each server must have a unique sidecarPort`,
        );
      } else {
        portMap.set(manifest.sidecarPort, serverName);
      }
    } catch {
      // loadMcpManifest already validates — errors will surface at startup
    }
  }

  const manifests = new Map<string, McpServerManifest>();
  for (const serverName of serverNames) {
    if (!available.includes(serverName)) {
      errors.push(
        `${prefix}: MCP server "${serverName}" not found in shared/mcp-servers/\n` +
          `  Available servers: ${available.length > 0 ? available.join(", ") : "(none)"}\n` +
          `  Create shared/mcp-servers/${serverName}/mcp-server.json`,
      );
      continue;
    }
    try {
      manifests.set(serverName, loadMcpManifest(mcpServersDir, serverName));
    } catch {
      // manifest load errors handled elsewhere
    }
  }

  const missingConfig = new Map<string, { server: string; missing: string[]; variants: string[] }>();
  variants.forEach((variant, i) => {
    for (const serverName of variant.mcpServers) {
      const required = manifests.get(serverName)?.requiredConfig ?? [];
      const provided = variant.mcpServerConfigs[serverName] ?? {};
      const missing = required.filter((k) => !(k in provided));
      if (missing.length === 0) continue;
      const key = `${serverName}:${missing.join(",")}`;
      const finding = missingConfig.get(key) ?? { server: serverName, missing, variants: [] };
      finding.variants.push(`variants[${i}]`);
      missingConfig.set(key, finding);
    }
  });

  for (const { server, missing, variants: affected } of missingConfig.values()) {
    errors.push(
      `${prefix}: MCP server "${server}" requires config [${missing.join(", ")}], missing for ${affected.join(", ")}\n` +
        `  Add an object entry in mcpServers (profile or variant level) with env: { ${missing.map((k) => `"${k}": "..."`).join(", ")} }`,
    );
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
export function validateTriggerUniqueness(variants: readonly VariantTriggerInfo[], errors: string[]): void {
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
            `  A single comment would trigger both variants. Each trigger must be unique across variants that share projects`,
        );
      }
    }
  }
}
