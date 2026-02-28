import { join } from "node:path";

/**
 * Base environment variables injected into every container overlay.
 * These are orchestrator-level requirements (CLI auth, config) — not MCP-specific.
 */
const BASE_CONTAINER_ENV: Record<string, string> = {
  GH_TOKEN: '"${GH_TOKEN}"',
  ANTHROPIC_API_KEY: '"${ANTHROPIC_API_KEY}"',
  CLAUDE_CODE_DISABLE_AUTOUPDATER: '"1"',
  CLAUDE_CODE_DISABLE_COST_WARNINGS: '"1"',
};

/**
 * Build args injected into every service that bind-mounts the host workspace.
 * Ensures the container process runs as the same UID/GID as the host user so
 * it can write to bind-mounted directories.
 */
const HOST_BUILD_ARGS = [
  '        HOST_UID: "${HOST_UID}"',
  '        HOST_GID: "${HOST_GID}"',
];

/**
 * Generate a Docker Compose overlay YAML that injects environment variables,
 * volumes needed by the profile, and the MCP sidecar service.
 *
 * The overlay follows the same merge pattern as the security overlay:
 * `docker compose -f base.yml -f security.yml -f overlay.yml`
 *
 * MCP servers run in a dedicated sidecar container. The agent container only
 * receives URL-based mcp-config.json entries — no server code or secrets.
 *
 * @param mcpServersDir Absolute path to `shared/mcp-servers/` on the host.
 * @param serverNames List of MCP server names to include.
 * @param buildDir Absolute path to the profile's build directory on the host.
 * @param sidecarDir Absolute path to `shared/mcp-sidecar/` on the host.
 * @param extraVolumes Additional volume mount lines to include in the overlay (pre-formatted YAML).
 * @returns YAML string for `docker-compose.overlay.yml`.
 */
export function generateComposeOverlay(
  mcpServersDir: string,
  serverNames: string[],
  buildDir: string,
  sidecarDir: string,
  extraVolumes: string[] = [],
): string {
  const lines: string[] = [];

  lines.push("# Auto-generated compose overlay — do not edit");
  lines.push("# Regenerated at orchestrator startup from profile config");
  lines.push("");
  lines.push("services:");

  // ── app ──────────────────────────────────────────────────────────────────
  lines.push("  app:");
  lines.push("    build:");
  lines.push("      args:");
  lines.push(...HOST_BUILD_ARGS);
  lines.push("    environment:");
  for (const [key, value] of Object.entries(BASE_CONTAINER_ENV)) {
    lines.push(`      ${key}: ${value}`);
  }
  // Agent container volumes — URL-only MCP config, CLI config, resources.
  // No MCP server code or secrets are mounted here.
  lines.push("    volumes:");
  lines.push("      # Generated MCP config — contains HTTP URLs for servers inside mcp-sidecar");
  lines.push(`      - ${join(buildDir, "mcp-config.json")}:/workspace/.ralph/mcp-config.json:ro`);
  lines.push("      # Copilot CLI config with URL restrictions");
  lines.push(`      - ${join(buildDir, "copilot-config.json")}:/workspace/.ralph/config.json:ro`);
  lines.push("      # Hides .ralph/ from git (blocks everything including itself)");
  lines.push(`      - ${join(buildDir, ".gitignore")}:/workspace/.ralph/.gitignore:ro`);
  lines.push("      # Hides .github/ from git (agents, skills are orchestrator mounts)");
  lines.push(`      - ${join(buildDir, "github-gitignore")}:/workspace/.github/.gitignore:ro`);
  if (extraVolumes.length > 0) {
    lines.push("      # Agent definitions, skills, and resource files");
    lines.push(...extraVolumes);
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

  // ── mcp-sidecar ──────────────────────────────────────────────────────────
  // Runs MCP servers with credentials isolated from the agent container.
  if (serverNames.length > 0) {
    lines.push("");
    lines.push("  mcp-sidecar:");
    lines.push("    build:");
    lines.push(`      context: ${sidecarDir}`);
    lines.push("      dockerfile: Dockerfile");
    lines.push("      args:");
    lines.push(...HOST_BUILD_ARGS);
    lines.push("    volumes:");
    lines.push("      # MCP server code (read-only, inaccessible to agent)");
    lines.push(`      - ${mcpServersDir}:/opt/mcp/servers:ro`);
    lines.push("      # Gateway compiled code (read-only, avoids image rebuild for code changes)");
    lines.push(`      - ${join(sidecarDir, "dist")}:/opt/mcp/gateway/dist:ro`);
    lines.push("      # Gateway config with embedded secrets");
    lines.push(`      - ${join(buildDir, "gateway.json")}:/opt/mcp/config/gateway.json:ro`);
    lines.push("      # Shared attachment exchange directory (read-only in sidecar)");
    lines.push(`      - ${join(buildDir, "attachments")}:/tmp/mcp-attachments:ro`);
    lines.push("      # Repo volume for git operations (push_progress, create_pr)");
    lines.push('      - "${TARGET_REPO_PATH}:/workspace"');
    lines.push("    environment:");
    lines.push('      REPO_ROOT: "/workspace"');
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
    lines.push("          memory: 4G");
    lines.push('          cpus: "1.0"');
    lines.push("          pids: 300");
  }

  lines.push("");

  return lines.join("\n");
}
