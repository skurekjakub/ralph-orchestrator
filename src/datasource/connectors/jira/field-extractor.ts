import type { JiraIssue } from "./jira-types";
import { extractAdfText } from "./adf-converter";

/**
 * Known JIRA custom field IDs and their human-readable labels.
 * These map to fields on the DF project's "Documentation Feedback" issue type.
 */
const KNOWN_CUSTOM_FIELDS: Record<string, string> = {
  customfield_14800: "Page name",
  customfield_14801: "Documentation space key",
  customfield_14702: "Was this page helpful?",
  customfield_14704: "How can we make this page more helpful?",
};

/** A single extracted custom field with its human-readable label. */
export interface ExtractedField {
  /** JIRA field ID (e.g. `customfield_14800`). */
  fieldId: string;
  /** Human-readable label (e.g. `Page name`). Falls back to the raw field ID for unknown fields. */
  label: string;
  /** Extracted text value. */
  value: string;
}

/**
 * Extracts and normalizes JIRA issue fields for downstream consumption.
 *
 * Handles:
 * - Known custom fields with human-readable label mapping
 * - ADF (Atlassian Document Format) text extraction
 * - `{value: "..."}` wrapper objects (JIRA select/radio fields)
 * - Unknown custom fields (long string values only, as a catch-all)
 */
export class JiraFieldExtractor {
  /**
   * Extract all meaningful custom fields from a JIRA issue.
   *
   * Returns an array of extracted fields — known fields first (with friendly labels),
   * then any unknown custom fields with string values longer than 10 characters.
   */
  extractCustomFields(issue: JiraIssue): ExtractedField[] {
    const results: ExtractedField[] = [];

    for (const [fieldId, label] of Object.entries(KNOWN_CUSTOM_FIELDS)) {
      const value = issue.fields[fieldId];
      if (!value) continue;
      const text = this.extractFieldValue(value);
      if (text.trim()) {
        results.push({ fieldId, label, value: text.trim() });
      }
    }

    // Unknown custom fields — catch-all for long string values
    for (const [key, value] of Object.entries(issue.fields)) {
      if (
        key.startsWith("customfield_") &&
        !(key in KNOWN_CUSTOM_FIELDS) &&
        value &&
        typeof value === "string" &&
        value.length > 10
      ) {
        results.push({ fieldId: key, label: key, value });
      }
    }

    return results;
  }

  /**
   * Extract a plain text value from a JIRA field value.
   *
   * Handles multiple shapes:
   * - Plain string → returned as-is
   * - `{value: "..."}` → unwrapped (JIRA select/radio fields)
   * - ADF `{type: "doc", content: [...]}` → recursively extracted text
   * - Other objects → JSON-serialized
   */
  extractFieldValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value !== "object" || value === null) return String(value);

    const obj = value as Record<string, unknown>;

    // {value: "..."} wrapper (select/radio/checkbox fields)
    if (obj.value && typeof obj.value === "string") return obj.value;

    // ADF document
    if (obj.type === "doc") return extractAdfText(obj);

    return JSON.stringify(obj, null, 2);
  }
}
