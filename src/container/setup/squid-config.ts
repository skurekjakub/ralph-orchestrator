import { readFileSync } from "node:fs";
import { loadMcpManifest } from "./mcp-manifest.js";

/**
 * Generate a profile-specific squid.conf by injecting MCP server proxy domains
 * into the baseline configuration.
 *
 * Reads the shared baseline squid.conf, replaces the `# MCP_PROXY_DOMAINS` marker
 * with ACL entries collected from each enabled MCP server's `proxyDomains` field.
 *
 * @param baselineSquidPath Path to `shared/security/squid.conf` (baseline template).
 * @param mcpServersDir Absolute path to `shared/mcp-servers/` on the host.
 * @param serverNames List of MCP server names enabled for this profile.
 * @returns Complete squid.conf content with profile-specific domain allowlist.
 */
export function generateProfileSquidConf(
  baselineSquidPath: string,
  mcpServersDir: string,
  serverNames: string[],
): string {
  const baseline = readFileSync(baselineSquidPath, "utf-8");

  const domains = new Set<string>();
  for (const name of serverNames) {
    const manifest = loadMcpManifest(mcpServersDir, name);
    for (const d of manifest.proxyDomains ?? []) domains.add(d);
  }

  if (domains.size === 0) {
    return baseline.replace("# MCP_PROXY_DOMAINS", "# (no MCP proxy domains for this profile)");
  }

  const aclLines = [
    "# MCP server domains (auto-generated from profile mcpServers)",
    ...[...domains].sort().map((d) => `acl allowed_domains dstdomain ${d}`),
  ];

  return baseline.replace("# MCP_PROXY_DOMAINS", aclLines.join("\n"));
}
