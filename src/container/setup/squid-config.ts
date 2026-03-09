import { readFileSync } from "node:fs";

const PROFILE_DOMAINS_MARKER = "# {{PROFILE_DOMAINS}}";

/**
 * Build a per-profile squid.conf by reading the shared baseline and injecting
 * profile-level allowlist domains at the `{{PROFILE_DOMAINS}}` marker.
 *
 * The baseline only allows AI provider endpoints (Copilot, Anthropic).
 * Each profile declares additional domains it needs (package registries,
 * Azure DevOps feeds, etc.) via `allowlistDomains` in profile.json.
 *
 * @param baselineSquidPath Path to `shared/security/squid.conf`.
 * @param profileDomains Additional domains to allow for this profile.
 * @returns squid.conf content with profile domains injected.
 */
export function generateProfileSquidConf(baselineSquidPath: string, profileDomains: string[] = []): string {
  const baseline = readFileSync(baselineSquidPath, "utf-8");

  if (profileDomains.length === 0) {
    return baseline.replace(PROFILE_DOMAINS_MARKER, "# (no profile-specific domains)");
  }

  const domainLines = profileDomains
    .map((d) => `acl allowed_domains dstdomain ${d}`)
    .join("\n");
  const block = `# Profile-specific domains\n${domainLines}`;

  return baseline.replace(PROFILE_DOMAINS_MARKER, block);
}
