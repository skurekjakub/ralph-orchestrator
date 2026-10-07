import { readFileSync } from "node:fs";

const PROFILE_DOMAINS_MARKER = "# {{PROFILE_DOMAINS}}";

/** Domains one task's agent container may reach, besides the baseline's. */
export interface SquidDomains {
  /** Domains the task's agent CLIs need (their model APIs). */
  readonly cliDomains: readonly string[];
  /** The profile's `allowlistDomains`. */
  readonly profileDomains: readonly string[];
}

/**
 * Stand-in definition used when no domain is allowed: the baseline's `http_access allow allowed_domains` needs
 * the ACL to exist or Squid refuses to start. A source address that no client has matches nothing.
 */
const EMPTY_ALLOWLIST_ACL = "acl allowed_domains src 0.0.0.0/32";

/** An `acl allowed_domains` block under a heading, or nothing when `domains` is empty. */
function aclBlock(heading: string, domains: readonly string[]): string[] {
  if (domains.length === 0) return [];
  return [`# ${heading}`, ...domains.map((d) => `acl allowed_domains dstdomain ${d}`)];
}

/**
 * Build a task's squid.conf from the shared baseline, injecting the agent CLIs' domains and the profile's
 * `allowlistDomains` at the `{{PROFILE_DOMAINS}}` marker.
 *
 * The baseline allows no provider; each agent CLI's model API is allowed only for tasks whose container
 * stages run that CLI. A domain listed twice is written once. When no domain is allowed at all (a variant of
 * local-only stages without `allowlistDomains`), an ACL that matches nothing is written instead.
 *
 * @param baselineSquidPath Path to `shared/security/squid.conf`.
 * @returns squid.conf content.
 */
export function generateProfileSquidConf(
  baselineSquidPath: string,
  { cliDomains, profileDomains }: SquidDomains,
): string {
  const baseline = readFileSync(baselineSquidPath, "utf-8");
  const cli = [...new Set(cliDomains)];
  const profile = [...new Set(profileDomains)].filter((d) => !cli.includes(d));

  const lines = [...aclBlock("Agent CLI domains", cli), ...aclBlock("Profile-specific domains", profile)];
  return baseline.replace(PROFILE_DOMAINS_MARKER, lines.length > 0 ? lines.join("\n") : EMPTY_ALLOWLIST_ACL);
}
