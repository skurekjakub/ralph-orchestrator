/**
 * Build a task-scoped branch name from a JIRA issue key and summary.
 *
 * Format: `ralph/<issueKey>-<slugified-summary>`
 * - Lowercased
 * - Non-alphanumeric chars replaced with hyphens
 * - Consecutive hyphens collapsed
 * - Trailing hyphens stripped
 * - Slug portion truncated to 80 chars
 *
 * @example slugifyBranchName("DOC-3143", "Update API docs for v2") → "ralph/DOC-3143-update-api-docs-for-v2"
 */
export function slugifyBranchName(issueKey: string, summary: string): string {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");

  return slug ? `ralph/${issueKey}-${slug}` : `ralph/${issueKey}`;
}
