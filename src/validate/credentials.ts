import { credentialPolicyFor } from "../cli/credential-catalog";
import type { ClaudeAuthMode, CliType, IAgentProfile } from "../config/types";
import type { ValidationCollector } from "./types";

/**
 * Validate that the credential of every CLI some stage runs is set.
 *
 * Variant stages and post-task hook stages both count. Each missing variable is reported once,
 * naming every profile whose stages need it.
 *
 * @param profiles Resolved variants of all profiles.
 * @param claudeAuth Which credential Claude Code stages authenticate with.
 * @param env Environment to check; an empty value counts as missing.
 */
export function validateCliCredentials(
  profiles: readonly IAgentProfile[],
  claudeAuth: ClaudeAuthMode,
  env: Readonly<Record<string, string | undefined>>,
  { errors }: ValidationCollector,
): void {
  const profileIdsByCli = new Map<CliType, Set<string>>();
  for (const profile of profiles) {
    const stages = [...profile.stages, ...profile.postTaskHooks.flatMap((hook) => hook.stages)];
    for (const { cli } of stages) {
      const ids = profileIdsByCli.get(cli) ?? new Set<string>();
      ids.add(profile.id);
      profileIdsByCli.set(cli, ids);
    }
  }

  for (const [cli, profileIds] of profileIdsByCli) {
    for (const { envVar, purpose } of credentialPolicyFor(cli, claudeAuth).required) {
      if (env[envVar]) continue;
      const usedBy = [...profileIds].map((id) => `profiles/${id}`).join(", ");
      errors.push(`Missing env var ${envVar} for cli "${cli}" (used by ${usedBy})\n  ${purpose}`);
    }
  }
}
