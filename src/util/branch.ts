/**
 * Build a task-scoped branch name from a work item id and summary.
 *
 * Format: `ralph/<taskId>-<slugified-summary>`
 * - Lowercased
 * - Non-alphanumeric chars replaced with hyphens
 * - Consecutive hyphens collapsed
 * - Trailing hyphens stripped
 * - Slug portion truncated to 80 chars
 *
 * @example slugifyBranchName("DOC-3143", "Update API docs for v2") → "ralph/DOC-3143-update-api-docs-for-v2"
 */
export function slugifyBranchName(taskId: string, summary: string): string {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");

  return slug ? `ralph/${taskId}-${slug}` : `ralph/${taskId}`;
}
