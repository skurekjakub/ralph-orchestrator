import type { AgentProfile } from "../config.js";

/**
 * Build JQL queries dynamically from agent profile matching rules.
 *
 * Generates one JQL per profile by combining:
 * - `project = <project>` (one query per project if multiple)
 * - `summary ~ "<keyword>"` (OR'd if multiple keywords; omitted for catch-all)
 * - `status IN ("status1", "status2")` (combines `statuses` and `revisionStatuses`;
 *   omitted if neither is specified)
 *
 * Returned queries are deduplicated (identical strings removed).
 */
export function buildJqlFromProfiles(profiles: readonly AgentProfile[]): string[] {
  const queries = new Set<string>();

  for (const profile of profiles) {
    const allStatuses = [...new Set([
      ...(profile.match.statuses ?? []),
      ...(profile.match.revisionStatuses ?? []),
    ])];

    for (const project of profile.match.projects) {
      const clauses: string[] = [`project = ${project}`];

      if (profile.match.keywords.length > 0) {
        if (profile.match.keywords.length === 1) {
          clauses.push(`summary ~ "${profile.match.keywords[0]}"`);
        } else {
          const parts = profile.match.keywords
            .map((kw) => `summary ~ "${kw}"`)
            .join(" OR ");
          clauses.push(`(${parts})`);
        }
      }

      if (allStatuses.length === 1) {
        clauses.push(`status = "${allStatuses[0]}"`);
      } else if (allStatuses.length > 1) {
        const list = allStatuses.map((s) => `"${s}"`).join(", ");
        clauses.push(`status IN (${list})`);
      }

      queries.add(`${clauses.join(" AND ")} ORDER BY created ASC`);
    }
  }

  return [...queries];
}
