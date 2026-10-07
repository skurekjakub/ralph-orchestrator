import { join } from "node:path";
import { RALPH_CONTAINER_DIR } from "../workspace-paths";

/** URL-only MCP config inside the agent container, read by every agent CLI. */
export const MCP_CONFIG_CONTAINER_PATH = `${RALPH_CONTAINER_DIR}/mcp-config.json`;

/**
 * Build args injected into every service that bind-mounts the host workspace.
 * Ensures the container process runs as the same UID/GID as the host user so
 * it can write to bind-mounted directories.
 */
const HOST_BUILD_ARGS: Readonly<Record<string, string>> = {
  HOST_UID: "${HOST_UID}",
  HOST_GID: "${HOST_GID}",
};

/** Everything one task's compose overlay is generated from. */
export interface ComposeOverlayOptions {
  /** Absolute path to `shared/mcp-servers/` on the host. */
  readonly mcpServersDir: string;
  /** MCP servers the sidecar runs; none means no sidecar service. */
  readonly serverNames: readonly string[];
  /** Absolute path to the profile's build directory on the host. */
  readonly buildDir: string;
  /** Absolute path to `shared/mcp-sidecar/` on the host. */
  readonly sidecarDir: string;
  /** Extra `app` bind mounts in compose short syntax: the agent CLIs' artifacts and the profile's resources. */
  readonly appVolumes: readonly string[];
  /** `app` environment: the agent CLIs' settings and credential references. */
  readonly appEnv: Readonly<Record<string, string>>;
  /** `app` image build args besides the host UID/GID (the pinned agent CLI versions). */
  readonly appBuildArgs: Readonly<Record<string, string>>;
  /** Sidecar container environment from the MCP servers' `sidecarEnv`. */
  readonly sidecarEnv: Readonly<Record<string, string>>;
  /** Whether `<buildDir>/pre-init.sh` exists and must be mounted into the sidecar. */
  readonly hasPreInit: boolean;
}

/** A double-quoted YAML scalar. */
function quoted(value: string): string {
  return JSON.stringify(value);
}

/** `key: "value"` lines at `indent`. */
function mappingLines(indent: string, entries: Readonly<Record<string, string>>): string[] {
  return Object.entries(entries).map(([key, value]) => `${indent}${key}: ${quoted(value)}`);
}

/**
 * Generate a Docker Compose overlay YAML that adds the agent CLIs' build args, environment and mounts to
 * the `app` service and defines the MCP sidecar service.
 *
 * The overlay follows the same merge pattern as the security overlay:
 * `docker compose -f base.yml -f security.yml -f overlay.yml`
 *
 * MCP servers run in a dedicated sidecar container. The agent container only
 * receives URL-based mcp-config.json entries — no server code or secrets.
 *
 * @returns YAML string for `docker-compose.overlay.yml`.
 */
export function generateComposeOverlay(options: ComposeOverlayOptions): string {
  const { mcpServersDir, serverNames, buildDir, sidecarDir, appVolumes, appEnv, appBuildArgs, sidecarEnv } = options;
  const lines: string[] = [];

  lines.push("# Auto-generated compose overlay — do not edit");
  lines.push("# Regenerated per task from the profile config and the variant's agent CLIs");
  lines.push("");
  lines.push("services:");

  lines.push("  app:");
  lines.push("    build:");
  lines.push("      args:");
  lines.push(...mappingLines("        ", { ...HOST_BUILD_ARGS, ...appBuildArgs }));
  if (Object.keys(appEnv).length > 0) {
    lines.push("    environment:");
    lines.push(...mappingLines("      ", appEnv));
  }
  // No MCP server code or secrets are mounted into the agent container.
  lines.push("    volumes:");
  lines.push("      # Generated MCP config — contains HTTP URLs for servers inside mcp-sidecar");
  lines.push(`      - ${join(buildDir, "mcp-config.json")}:${MCP_CONFIG_CONTAINER_PATH}:ro`);
  lines.push("      # Hides .ralph/ from git (blocks everything including itself)");
  lines.push(`      - ${join(buildDir, ".gitignore")}:${RALPH_CONTAINER_DIR}/.gitignore:ro`);
  if (appVolumes.length > 0) {
    lines.push("      # Agent CLI settings, agents, skills and resource files");
    lines.push(...appVolumes.map((volume) => `      - ${volume}`));
  }
  if (serverNames.length > 0) {
    // Shared attachment directory — agent writes files here, sidecar reads them.
    // Used by tools like jira_add_attachment that need file access across containers.
    lines.push("      # Shared attachment exchange directory");
    lines.push(`      - ${join(buildDir, "attachments")}:/tmp/mcp-attachments`);
    lines.push("    depends_on:");
    lines.push("      mcp-sidecar:");
    lines.push("        condition: service_healthy");
  }

  // Runs MCP servers with credentials isolated from the agent container.
  if (serverNames.length > 0) {
    lines.push("");
    lines.push("  mcp-sidecar:");
    lines.push("    build:");
    lines.push(`      context: ${sidecarDir}`);
    lines.push("      dockerfile: Dockerfile");
    lines.push("      args:");
    lines.push(...mappingLines("        ", HOST_BUILD_ARGS));
    lines.push("    volumes:");
    lines.push("      # MCP server code (read-only, inaccessible to agent)");
    lines.push(`      - ${mcpServersDir}:/opt/mcp/servers:ro`);
    lines.push("      # Gateway bundle (read-only, avoids image rebuild for code changes)");
    lines.push(`      - ${join(sidecarDir, "dist")}:/opt/mcp/gateway/dist:ro`);
    lines.push("      # Entrypoint script (mounted to pick up changes without image rebuild)");
    lines.push(`      - ${join(sidecarDir, "entrypoint.sh")}:/opt/mcp/entrypoint.sh:ro`);
    lines.push("      # Gateway config with embedded secrets");
    lines.push(`      - ${join(buildDir, "gateway.json")}:/opt/mcp/config/gateway.json:ro`);
    lines.push("      # Shared attachment exchange directory (read-only in sidecar)");
    lines.push(`      - ${join(buildDir, "attachments")}:/tmp/mcp-attachments:ro`);
    lines.push("      # Repo volume for git operations (push_progress, create_pr)");
    lines.push('      - "${TARGET_REPO_PATH}:/workspace"');
    if (options.hasPreInit) {
      lines.push("      # Generated pre-init script from MCP server initScript declarations");
      lines.push(`      - ${join(buildDir, "pre-init.sh")}:/opt/mcp/pre-init.sh:ro`);
    }
    lines.push("    environment:");
    lines.push(...mappingLines("      ", { REPO_ROOT: "/workspace", ...sidecarEnv }));
    lines.push("    extra_hosts:");
    lines.push('      - "host.docker.internal:host-gateway"');
    lines.push("    networks:");
    lines.push("      ralph-internal:");
    lines.push("      ralph-sidecar-external:");
    lines.push("    security_opt:");
    lines.push('      - "no-new-privileges:true"');
    lines.push("    cap_drop:");
    lines.push("      - ALL");
    lines.push("    deploy:");
    lines.push("      resources:");
    lines.push("        limits:");
    lines.push("          memory: 24G");
    lines.push('          cpus: "8.0"');
    lines.push("          pids: 300");
  }

  lines.push("");

  return lines.join("\n");
}
