import type { JiraIssue } from "./jira-types";

/**
 * Patterns that identify boilerplate JIRA field content — form templates,
 * placeholder text, and empty field scaffolds that provide no value to agents.
 */
const BOILERPLATE_PATTERNS: RegExp[] = [/please copy and use this template/i, /\{color:grey\}/i, /^-{3,}\s*$/m];

/**
 * Pre-processes JIRA issues before they reach the prompt builder.
 *
 * Strips custom fields that contain boilerplate template content (e.g. empty
 * form scaffolds) or fields explicitly excluded by ID. This reduces prompt
 * noise and prevents agents from treating template placeholders as task data.
 */
export class JiraIssueParser {
  private readonly excludedFieldIds: Set<string>;

  /**
   * @param excludedFieldIds Custom field IDs to always exclude
   *   (e.g. `["customfield_19181", "customfield_19222"]`).
   */
  constructor(excludedFieldIds: readonly string[] = []) {
    this.excludedFieldIds = new Set(excludedFieldIds);
  }

  /**
   * Return a shallow copy of the issue with noisy custom fields removed.
   *
   * A custom field is removed if:
   * 1. Its ID is in the explicit exclusion list, OR
   * 2. Its string value matches a known boilerplate pattern
   *
   * Non-custom fields (summary, description, status, etc.) are never removed.
   */
  parse(issue: JiraIssue): JiraIssue {
    const cleanedFields: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(issue.fields)) {
      if (!key.startsWith("customfield_")) {
        cleanedFields[key] = value;
        continue;
      }

      if (this.excludedFieldIds.has(key)) continue;
      if (typeof value === "string" && this.isBoilerplate(value)) continue;

      cleanedFields[key] = value;
    }

    return { key: issue.key, fields: cleanedFields as JiraIssue["fields"] };
  }

  private isBoilerplate(value: string): boolean {
    return BOILERPLATE_PATTERNS.every((p) => p.test(value));
  }
}
