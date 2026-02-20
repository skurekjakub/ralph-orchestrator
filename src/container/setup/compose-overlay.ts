import { join } from "node:path";

/**
 * Base environment variables injected into every container overlay.
 * These are orchestrator-level requirements (CLI auth, config) — not MCP-specific.
 * MCP server env vars are added dynamically from manifest `requiredEnv`/`optionalEnv`.
 */
const BASE_CONTAINER_ENV: Record<string, string> = {
  GH_TOKEN: '"${GH_TOKEN}"',
  ANTHROPIC_API_KEY: '"${ANTHROPIC_API_KEY}"',
  CLAUDE_CODE_DISABLE_AUTOUPDATER: '"1"',
  CLAUDE_CODE_DISABLE_COST_WARNINGS: '"1"',
};

/**
 * Generate a Docker Compose overlay YAML that injects environment variables
 * and volumes needed by the profile.
 *
 * Environment variables come from two sources:
 * - **Base set** — always injected (CLI auth, config flags)
 * - **MCP servers** — auto-derived from manifest `requiredEnv`/`optionalEnv`
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
export function generateComposeOverlay(
  mcpServersDir: string,
  serverNames: string[],
  buildDir: string,
  extraVolumes: string[] = [],
): string {
  const lines: string[] = [
    "# Auto-generated compose overlay — do not edit",
    "# Regenerated at orchestrator startup from profile config",
    "",
    "services:",
    "  app:",
    "    environment:",
  ];

  // Base env vars (always present). MCP-specific secrets are NOT injected here —
  // they are embedded directly in mcp-config.json to prevent agent env var leakage.
  for (const [key, value] of Object.entries(BASE_CONTAINER_ENV)) {
    lines.push(`      ${key}: ${value}`);
  }

  // Always mount Copilot CLI config — also mount MCP servers/config if declared.
  lines.push("    volumes:");
  if (serverNames.length > 0) {
    lines.push("      # MCP servers directory (all manifests + custom server code)");
    lines.push(`      - ${mcpServersDir}:/workspace/.ralph/mcp-servers:ro`);
    lines.push("      # Generated MCP config (Copilot + Claude Code)");
    lines.push(`      - ${join(buildDir, "mcp-config.json")}:/workspace/.ralph/mcp-config.json:ro`);
  }
  lines.push("      # Copilot CLI config with URL restrictions");
  lines.push(`      - ${join(buildDir, "copilot-config.json")}:/workspace/.ralph/config.json:ro`);
  if (extraVolumes.length > 0) {
    lines.push("      # Resource files");
    lines.push(...extraVolumes);
  }
  lines.push("");

  return lines.join("\n");
}
