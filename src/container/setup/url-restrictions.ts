import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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
 * Converts squid domain entries to Copilot URL patterns. For host loopback
 * ports, emits `http://host.docker.internal:<port>/*` patterns.
 *
 * @param squidDomains Domains extracted from the profile's squid.conf.
 * @param hostLoopbackPorts Ports from the squid host loopback ACL.
 */
export function generateAllowedUrls(squidDomains: string[], hostLoopbackPorts: number[] = []): string[] {
  const urls: string[] = squidDomains.map(squidDomainToUrlPattern);

  for (const port of hostLoopbackPorts) {
    urls.push(`http://host.docker.internal:${port}/*`);
  }

  return [...new Set(urls)].sort();
}

/**
 * Generate and write the Copilot CLI config file with URL restrictions.
 *
 * Reads the profile's squid.conf to discover all allowed domains and
 * converts them to Copilot URL patterns. The resulting config.json is
 * mounted at `/workspace/.ralph/config.json` and read by the Copilot CLI
 * via `--config-dir /workspace/.ralph`.
 *
 * @param buildDir Profile build directory (`.build/`).
 */
export function writeCopilotConfig(buildDir: string): void {
  const squidConfPath = join(buildDir, "squid.conf");
  if (!existsSync(squidConfPath)) return;

  const squidConf = readFileSync(squidConfPath, "utf-8");
  const squidDomains = parseSquidDomains(squidConf);
  const hostLoopbackPorts = parseSquidHostLoopbackPorts(squidConf);
  const allowedUrls = generateAllowedUrls(squidDomains, hostLoopbackPorts);

  const config = { allowed_urls: allowedUrls };
  writeFileSync(join(buildDir, "copilot-config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");
}
