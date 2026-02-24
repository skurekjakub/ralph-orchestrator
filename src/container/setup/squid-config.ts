import { readFileSync } from "node:fs";

/**
 * Read the shared baseline squid.conf for a profile.
 *
 * MCP servers no longer contribute proxy domains here — the MCP sidecar has
 * direct internet access via its own network (`ralph-sidecar-external`) and
 * bypasses Squid entirely. The agent container's allowlist is therefore static:
 * AI providers, package registries, and Azure DevOps for git operations.
 *
 * @param baselineSquidPath Path to `shared/security/squid.conf`.
 * @returns squid.conf content.
 */
export function generateProfileSquidConf(baselineSquidPath: string): string {
  return readFileSync(baselineSquidPath, "utf-8");
}
