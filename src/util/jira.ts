/** Valid JIRA issue key format (e.g. `DF-123`, `DOC-4567`). */
const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;

/**
 * Throw if `key` is not a valid JIRA issue key.
 *
 * Guards any code that uses the key to construct filesystem paths or API calls.
 */
export function assertValidIssueKey(key: string): void {
  if (!ISSUE_KEY_RE.test(key)) {
    throw new Error(`Invalid JIRA issue key: "${key}"`);
  }
}
