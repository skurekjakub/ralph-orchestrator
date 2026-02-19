import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateResourceVolumeMounts, type ResourceConfig } from "./resource-mounts.js";

/** MCP server types: "npm" for npx-based, "custom" for locally-built servers. */
export enum McpServerType {
  Npm = "npm",
  Custom = "custom",
}

/** Schema for shared/mcp-servers/<name>/mcp-server.json manifests. */
export interface McpServerManifest {
  name: string;
  description: string;
  type: McpServerType;
  command: string;
  args: string[];
  /** Absolute path inside the container where the custom server is mounted. Only for `type: "custom"`. */
  containerPath?: string;
  /** Env vars that must be present for the server to work. */
  requiredEnv?: string[];
  /** Optional env vars the server supports. */
  optionalEnv?: string[];
  /** Domains the server needs egress access to (for squid allowlist reference). */
  proxyDomains?: string[];
  /** Tool names this server provides (documentation / prompt-authoring reference). */
  tools?: string[];
}

/** MCP config entry for a single server (used by both Copilot and Claude Code CLIs). */
interface McpConfigEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Load an MCP server manifest from `shared/mcp-servers/<name>/mcp-server.json`.
 *
 * @throws If the manifest file doesn't exist or is malformed.
 */
export function loadMcpManifest(mcpServersDir: string, serverName: string): McpServerManifest {
  const manifestPath = join(mcpServersDir, serverName, "mcp-server.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `MCP server manifest not found: ${manifestPath}\n` +
      `  Create shared/mcp-servers/${serverName}/mcp-server.json`
    );
  }

  const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as McpServerManifest;
  if (!raw.name || !raw.command) {
    throw new Error(`Invalid MCP server manifest at ${manifestPath}: name and command are required`);
  }
  return raw;
}

/**
 * Discover all available MCP server names from the shared/mcp-servers/ directory.
 */
export function discoverMcpServers(mcpServersDir: string): string[] {
  if (!existsSync(mcpServersDir)) return [];
  return readdirSync(mcpServersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(mcpServersDir, d.name, "mcp-server.json")))
    .map((d) => d.name);
}

/**
 * Generate `mcp-config.json` content from a list of MCP server names.
 *
 * Resolves each server's manifest and builds the config entry. Custom servers
 * use their `containerPath` to build the full command path.
 *
 * @param mcpServersDir Absolute path to `shared/mcp-servers/` on the host.
 * @param serverNames List of MCP server names to include.
 * @returns Serializable mcp-config.json content.
 */
export function generateMcpConfig(
  mcpServersDir: string,
  serverNames: string[],
): { mcpServers: Record<string, McpConfigEntry> } {
  const servers: Record<string, McpConfigEntry> = {};

  for (const name of serverNames) {
    const manifest = loadMcpManifest(mcpServersDir, name);

    if (manifest.type === McpServerType.Custom && manifest.containerPath) {
      servers[name] = {
        command: manifest.command,
        args: manifest.args.map((a) => join(manifest.containerPath!, a)),
      };
    } else {
      servers[name] = {
        command: manifest.command,
        args: manifest.args,
      };
    }

    // Forward required env vars as passthrough references.
    // The actual values come from docker compose environment injection.
    const envVars = [
      ...(manifest.requiredEnv ?? []),
      ...(manifest.optionalEnv ?? []),
    ];
    if (envVars.length > 0) {
      const env: Record<string, string> = {};
      for (const v of envVars) {
        env[v] = `\${${v}}`;
      }
      servers[name].env = env;
    }
  }

  return { mcpServers: servers };
}

/**
 * Generate a Docker Compose overlay YAML that injects only the env vars
 * and volumes needed by the profile's declared MCP servers.
 *
 * The overlay follows the same merge pattern as the security overlay:
 * `docker compose -f base.yml -f security.yml -f overlay.yml`
 *
 * @param mcpServersDir Absolute path to `shared/mcp-servers/` on the host.
 * @param serverNames List of MCP server names to include.
 * @param buildDir Absolute path to the profile's build directory on the host.
 * @param extraVolumes Additional volume mount lines to include in the overlay (pre-formatted YAML).
 * @returns YAML string for `docker-compose.overlay.yml`.
 */
export function generateMcpComposeOverlay(
  mcpServersDir: string,
  serverNames: string[],
  buildDir: string,
  extraVolumes: string[] = [],
): string {
  const envVars = new Set<string>();

  for (const name of serverNames) {
    const manifest = loadMcpManifest(mcpServersDir, name);
    for (const v of manifest.requiredEnv ?? []) envVars.add(v);
    for (const v of manifest.optionalEnv ?? []) envVars.add(v);
  }

  const lines: string[] = [
    "# Auto-generated compose overlay — do not edit",
    "# Regenerated at orchestrator startup from profile config",
    "",
    "services:",
    "  app:",
  ];

  if (envVars.size > 0) {
    lines.push("    environment:");
    for (const v of [...envVars].sort()) {
      lines.push(`      ${v}: "\${${v}}"`);
    }
  }

  const hasVolumes = serverNames.length > 0 || extraVolumes.length > 0;
  if (hasVolumes) {
    lines.push("    volumes:");
    if (serverNames.length > 0) {
      lines.push("      # MCP servers directory (all manifests + custom server code)");
      lines.push(`      - ${mcpServersDir}:/workspace/.ralph/mcp-servers:ro`);
      lines.push("      # Generated MCP config (Copilot + Claude Code)");
      lines.push(`      - ${join(buildDir, "mcp-config.json")}:/workspace/.ralph/mcp-config.json:ro`);
    }
    if (extraVolumes.length > 0) {
      lines.push("      # Resource files");
      lines.push(...extraVolumes);
    }
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * Resolve MCP configs for all profiles and write them to each profile's build directory.
 *
 * For each profile that declares `mcpServers`, generates:
 * - `mcp-config.json` — MCP server configuration (used by both CLIs)
 * - `docker-compose.overlay.yml` — Compose overlay with env vars and volume mounts
 *
 * Both files go to `profiles/<id>/agents/.build/`. The compose overlay is passed as
 * a third `-f` argument to `docker compose` by {@link ComposeFileResolver}.
 *
 * @param rootDir Workspace root (defaults to cwd).
 */
export function resolveAllProfileMcpConfigs(rootDir?: string): void {
  const root = rootDir ?? process.cwd();
  const mcpServersDir = resolve(root, "shared/mcp-servers");
  const profilesDir = resolve(root, "profiles");

  if (!existsSync(profilesDir)) return;

  for (const profileId of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!profileId.isDirectory()) continue;

    const profileJsonPath = join(profilesDir, profileId.name, "profile.json");
    if (!existsSync(profileJsonPath)) continue;

    let parsed: { mcpServers?: string[]; resources?: ResourceConfig };
    try {
      parsed = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
    } catch {
      continue;
    }

    const serverNames = parsed.mcpServers ?? [];

    const config = generateMcpConfig(mcpServersDir, serverNames);

    const buildDir = join(profilesDir, profileId.name, "agents", ".build");
    if (!existsSync(buildDir)) {
      mkdirSync(buildDir, { recursive: true });
    }

    writeFileSync(
      join(buildDir, "mcp-config.json"),
      JSON.stringify(config, null, 2) + "\n",
      "utf-8",
    );

    const profileDir = join(profilesDir, profileId.name);
    const resourceVolumes = parsed.resources
      ? generateResourceVolumeMounts(profileDir, parsed.resources)
      : [];

    const overlay = generateMcpComposeOverlay(mcpServersDir, serverNames, buildDir, resourceVolumes);
    writeFileSync(
      join(buildDir, "docker-compose.overlay.yml"),
      overlay,
      "utf-8",
    );
  }
}
