import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../../logger.js";
import { loadMcpManifest } from "./mcp-manifest.js";

/** A single URL path restriction rule for a domain. */
export interface UrlPathRule {
  /** Domain to restrict (e.g., "api.atlassian.com", "dev.azure.com"). */
  domain: string;
  /** Allowed URL path prefixes. URLs matching the domain but not any path → blocked by CLI. */
  allowedPaths: string[];
}

/** URL path restriction rules derived from MCP server manifests. */
export interface UrlPathRules {
  rules: UrlPathRule[];
}

/**
 * Generate URL path restriction rules from MCP server manifests.
 *
 * Iterates all enabled MCP servers, reads their `allowedUrlPaths` fields,
 * and merges them into domain restriction rules. Servers without
 * `allowedUrlPaths` are skipped (domain-level proxy filtering is sufficient).
 *
 * @param mcpServersDir Absolute path to `shared/mcp-servers/` on the host.
 * @param serverNames MCP server names enabled for this profile.
 * @param logger Optional logger for warning on manifest load failures.
 */
export function generateUrlPathRules(
  mcpServersDir: string,
  serverNames: string[],
  logger?: Logger,
): UrlPathRules {
  const byDomain = new Map<string, Set<string>>();

  for (const name of serverNames) {
    let manifest;
    try {
      manifest = loadMcpManifest(mcpServersDir, name);
    } catch (err) {
      logger?.warn(`Failed to load manifest for MCP server ${name}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const paths = manifest.allowedUrlPaths;
    if (!paths) continue;

    for (const [domain, allowedPaths] of Object.entries(paths)) {
      if (!domain || !Array.isArray(allowedPaths)) continue;
      let set = byDomain.get(domain);
      if (!set) {
        set = new Set();
        byDomain.set(domain, set);
      }
      for (const p of allowedPaths) {
        if (typeof p === "string" && p) set.add(p);
      }
    }
  }

  const rules: UrlPathRule[] = [...byDomain.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, paths]) => ({ domain, allowedPaths: [...paths].sort() }));

  return { rules };
}

// ── Copilot CLI config generation (URL allowlist) ────────────────────────────

/**
 * Extract allowed domains from a profile's squid.conf.
 *
 * Parses `acl allowed_domains dstdomain <domain>` lines and returns the raw
 * domain strings (e.g., `.github.com`, `api.github.com`).
 */
export function parseSquidDomains(squidConf: string): string[] {
  const domains: string[] = [];
  for (const line of squidConf.split("\n")) {
    const match = line.match(/^acl\s+allowed_domains\s+dstdomain\s+(\S+)/);
    if (match) domains.push(match[1]);
  }
  return domains;
}

/**
 * Extract host loopback ports from a profile's squid.conf.
 *
 * Parses `acl host_loopback_ports port <port> [<port>...]` lines and
 * returns the port numbers. Multiple ports on one line are supported.
 */
export function parseSquidHostLoopbackPorts(squidConf: string): number[] {
  const ports: number[] = [];
  for (const line of squidConf.split("\n")) {
    const match = line.match(/^acl\s+host_loopback_ports\s+port\s+(.+)/);
    if (!match) continue;
    for (const token of match[1].split(/\s+/)) {
      const port = parseInt(token, 10);
      if (!isNaN(port)) ports.push(port);
    }
  }
  return [...new Set(ports)];
}

/**
 * Convert a squid domain (e.g., `.github.com`, `api.github.com`) to a
 * Copilot CLI URL pattern.
 *
 * - `.github.com` → `https://*.github.com` (wildcard subdomain)
 * - `api.github.com` → `https://api.github.com` (exact domain)
 */
function squidDomainToUrlPattern(domain: string): string {
  if (domain.startsWith(".")) {
    return `https://*${domain}`;
  }
  return `https://${domain}`;
}

/**
 * Generate `allowed_urls` for the Copilot CLI config.
 *
 * For domains covered by path restriction rules, emits path-scoped patterns
 * (e.g., `https://api.atlassian.com/ex/jira/{cloudId}/*`).
 * For all other domains, emits domain-level patterns.
 * For host loopback ports, emits `http://host.docker.internal:<port>/*` patterns.
 *
 * @param squidDomains Domains extracted from the profile's squid.conf.
 * @param rules URL path restriction rules.
 * @param hostLoopbackPorts Ports from the squid host loopback ACL.
 */
export function generateAllowedUrls(
  squidDomains: string[],
  rules: UrlPathRules,
  hostLoopbackPorts: number[] = [],
): string[] {
  // Normalize rule domains: strip leading dot so both `.atlassian.com` and
  // `dev.azure.com` map to their bare form for consistent lookup.
  const rulesByDomain = new Map(
    rules.rules.map((r) => [r.domain.startsWith(".") ? r.domain.slice(1) : r.domain, r]),
  );
  const urls: string[] = [];

  for (const domain of squidDomains) {
    // Squid uses `.dev.azure.com` (wildcard) while rules may use either form.
    const baseDomain = domain.startsWith(".") ? domain.slice(1) : domain;
    const rule = rulesByDomain.get(baseDomain);

    if (rule) {
      // Path-restricted: emit one pattern per allowed path.
      // Rule domain may have a leading dot (wildcard style) — convert to `*` prefix.
      const urlDomain = rule.domain.startsWith(".")
        ? `*${rule.domain}`
        : rule.domain;
      for (const path of rule.allowedPaths) {
        const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
        urls.push(`https://${urlDomain}${cleanPath}/*`);
      }
    } else {
      urls.push(squidDomainToUrlPattern(domain));
    }
  }

  // Include host loopback patterns for each allowed port.
  for (const port of hostLoopbackPorts) {
    urls.push(`http://host.docker.internal:${port}/*`);
  }

  return [...new Set(urls)].sort();
}

/**
 * Generate and write the Copilot CLI config file with URL restrictions.
 *
 * Reads the profile's squid.conf to discover all allowed domains, then
 * applies path restrictions to sensitive domains. The resulting
 * config.json is mounted at `/workspace/.ralph/config.json` and read by
 * the Copilot CLI via `--config-dir /workspace/.ralph`.
 *
 * @param buildDir Profile build directory (`.build/`).
 * @param rules URL path restriction rules.
 */
export function writeCopilotConfig(
  buildDir: string,
  rules: UrlPathRules,
): void {
  const squidConfPath = join(buildDir, "squid.conf");
  if (!existsSync(squidConfPath)) return;

  const squidConf = readFileSync(squidConfPath, "utf-8");
  const squidDomains = parseSquidDomains(squidConf);
  const hostLoopbackPorts = parseSquidHostLoopbackPorts(squidConf);
  const allowedUrls = generateAllowedUrls(squidDomains, rules, hostLoopbackPorts);

  const config = { allowed_urls: allowedUrls };
  writeFileSync(
    join(buildDir, "copilot-config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
}
