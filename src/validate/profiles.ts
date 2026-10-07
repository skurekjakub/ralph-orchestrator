import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ZodError } from "zod";
import { resolvePath } from "../util/path";
import { toErrorMessage } from "../util/error";
import {
  discoverMcpServers,
  loadMcpManifest,
  MCP_GATEWAY_HEALTH_PORT,
  MCP_UPSTREAM_PORT_OFFSET,
  upstreamPortOf,
  type McpServerManifest,
} from "../container/setup/mcp-manifest";
import { resolveProfileVariants } from "../config/profile-variants";
import { profileFileSchema } from "../config/schemas";
import type { IAgentProfile } from "../config/types";
import { discoverSkills } from "../container/setup/skill-includes";
import { validateAgentGraph } from "./agents";
import { locateStages, validateStageClis } from "./stages";
import type { ValidationCollector } from "./types";

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

    profile.variants.forEach((v, i) => {
      const vPrefix = `${prefix}/variants[${i}]`;

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
    validateAgentGraph(variants, join(profilesDir, dirName, "agents"), prefix, errors);

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

/** Validate that every skill a variant or post-task hook stage mounts exists in shared/skills/. */
function validateVariantSkills(
  variants: readonly IAgentProfile[],
  skillsDir: string,
  prefix: string,
  errors: string[],
): void {
  const available = discoverSkills(skillsDir);
  for (const { stage, path } of locateStages(variants)) {
    for (const skill of stage.skills) {
      if (!available.has(skill)) {
        errors.push(
          `${prefix}/${path}: skill "${skill}" not found in shared/skills/\n  Create shared/skills/${skill}/`,
        );
      }
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
 * Validate the MCP servers each variant runs: profile-level servers plus its own.
 *
 * Checks that every server exists in shared/mcp-servers/, that no two servers share a sidecar
 * port (see {@link validateSidecarPorts}), and that each variant's effective server config provides
 * every `requiredConfig` env var the manifest declares. A missing-config finding shared by several
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
  validateSidecarPorts(mcpServersDir, available, errors);

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
 * Check that the ports the sidecar opens never collide: the gateway health endpoint, every server's
 * `sidecarPort`, and the loopback upstream port (`sidecarPort + MCP_UPSTREAM_PORT_OFFSET`) of each
 * custom server with a `tools` allowlist, which must also be a valid port. Covers every server in
 * shared/mcp-servers/, because a profile's effective set changes per variant. Manifests that fail to
 * load are skipped here; startup reports them when it loads them.
 */
function validateSidecarPorts(mcpServersDir: string, serverNames: readonly string[], errors: string[]): void {
  const maxPort = 65535;
  const owners = new Map<number, string>([[MCP_GATEWAY_HEALTH_PORT, "the sidecar health endpoint"]]);
  const claim = (port: number, owner: string): void => {
    const existing = owners.get(port);
    if (existing === undefined) {
      owners.set(port, owner);
      return;
    }
    errors.push(
      `MCP sidecar port ${port} is used by both ${existing} and ${owner}\n` +
        `  Pick a sidecarPort that is free and, for a custom server with tools, leaves sidecarPort + ${MCP_UPSTREAM_PORT_OFFSET} free too`,
    );
  };

  const manifests: McpServerManifest[] = [];
  for (const serverName of serverNames) {
    try {
      manifests.push(loadMcpManifest(mcpServersDir, serverName));
    } catch {
      continue;
    }
  }
  for (const manifest of manifests) claim(manifest.sidecarPort, `MCP server "${manifest.name}"`);
  for (const manifest of manifests) {
    const upstreamPort = upstreamPortOf(manifest);
    if (upstreamPort === undefined) continue;
    if (upstreamPort > maxPort) {
      errors.push(
        `MCP server "${manifest.name}": sidecarPort ${manifest.sidecarPort} leaves no room for its upstream port ` +
          `(${manifest.sidecarPort} + ${MCP_UPSTREAM_PORT_OFFSET} > ${maxPort})\n  Pick a sidecarPort of at most ${maxPort - MCP_UPSTREAM_PORT_OFFSET}`,
      );
      continue;
    }
    claim(
      upstreamPort,
      `the upstream port of MCP server "${manifest.name}" (sidecarPort + ${MCP_UPSTREAM_PORT_OFFSET})`,
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
