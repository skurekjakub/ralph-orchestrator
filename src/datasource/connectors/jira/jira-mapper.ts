/**
 * Maps JIRA API types to generic work item types.
 *
 * All ADF → text conversion happens here. The orchestrator never sees
 * raw JIRA shapes or Atlassian Document Format.
 */

import type { JiraIssue, JiraComment, JiraAttachment, JiraTransition } from "./jira-types.js";
import type { WorkItem, WorkItemComment, WorkItemAttachment, WorkItemTransition } from "../../types.js";
import { extractAdfText } from "./adf-converter.js";

/** Convert a JIRA issue to a generic WorkItem. */
export function mapIssueToWorkItem(issue: JiraIssue, source: string, excludeFields: string[] = []): WorkItem {
  return {
    id: issue.key,
    source,
    project: issue.key.split("-")[0],
    title: issue.fields.summary ?? "",
    description: extractAdfText(issue.fields.description),
    status: issue.fields.status?.name ?? "",
    type: issue.fields.issuetype?.name ?? "",
    priority: issue.fields.priority?.name ?? "",
    labels: issue.fields.labels ?? [],
    components: (issue.fields.components ?? []).map(c => c.name),
    created: issue.fields.created,
    updated: issue.fields.updated ?? "",
    customFields: extractCustomFields(issue, excludeFields),
    sourceData: issue,
  };
}

/** Convert a JIRA comment to a generic WorkItemComment. */
export function mapCommentToWorkItemComment(comment: JiraComment): WorkItemComment {
  return {
    id: comment.id,
    authorName: comment.author.displayName,
    authorId: comment.author.accountId,
    body: extractAdfText(comment.body),
    created: comment.created,
  };
}

/** Convert a JIRA attachment to a generic WorkItemAttachment. */
export function mapAttachmentToWorkItemAttachment(att: JiraAttachment): WorkItemAttachment {
  return {
    id: att.id,
    filename: att.filename,
    created: att.created,
  };
}

/** Convert a JIRA transition to a generic WorkItemTransition. */
export function mapTransitionToWorkItemTransition(t: JiraTransition): WorkItemTransition {
  return {
    id: t.id,
    name: t.name,
    targetStatus: t.to.name,
  };
}

/**
 * Extract known custom fields from a JIRA issue into a string map.
 *
 * Known JIRA custom field IDs on the DF project's "Documentation Feedback" issue type.
 */
const KNOWN_CUSTOM_FIELDS: Record<string, string> = {
  customfield_14800: "Page name",
  customfield_14801: "Documentation space key",
  customfield_14702: "Was this page helpful?",
  customfield_14704: "How can we make this page more helpful?",
};

function extractCustomFields(issue: JiraIssue, excludeFields: string[]): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  const excluded = new Set(excludeFields);

  for (const [fieldId, label] of Object.entries(KNOWN_CUSTOM_FIELDS)) {
    if (excluded.has(fieldId)) continue;
    const value = issue.fields[fieldId];
    if (!value) continue;
    const text = extractFieldValue(value);
    if (text.trim()) {
      fields.set(label, text.trim());
    }
  }

  // Unknown custom fields — catch-all for long string values
  for (const [key, value] of Object.entries(issue.fields)) {
    if (
      key.startsWith("customfield_") &&
      !excluded.has(key) &&
      !(key in KNOWN_CUSTOM_FIELDS) &&
      value &&
      typeof value === "string" &&
      value.length > 10
    ) {
      fields.set(key, value);
    }
  }

  return fields;
}

function extractFieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return String(value);

  const obj = value as Record<string, unknown>;

  // {value: "..."} wrapper (select/radio/checkbox fields)
  if (obj.value && typeof obj.value === "string") return obj.value;

  // ADF document
  if (obj.type === "doc") return extractAdfText(obj);

  return JSON.stringify(obj, null, 2);
}
