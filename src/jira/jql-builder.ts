import type { AgentProfile } from "../config.js";

/**
 * Build JQL queries dynamically from agent profile matching rules.
 *
 * Generates one JQL per unique project+statuses combination:
 * - `project = <project>`
 * - `status IN ("status1", "status2")` (omitted if no statuses specified)
 *
 * Returned queries are deduplicated (identical strings removed).
 */
export function buildJqlFromProfiles(profiles: readonly AgentProfile[]): string[] {
  const queries = new Set<string>();

  for (const profile of profiles) {
    const allStatuses = [...new Set(profile.match.statuses ?? [])];

    for (const project of profile.match.projects) {
      const clauses: string[] = [`project = "${project}"`];

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
