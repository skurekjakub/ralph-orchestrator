import type { JiraIssue } from "../jira/types.js";
import { JiraFieldExtractor } from "../jira/field-extractor.js";

const fieldExtractor = new JiraFieldExtractor();

/**
 * Context about an issue provided to the agent alongside the JIRA fields.
 *
 * For standard tasks, this includes any existing JIRA comments (which may
 * contain observations or context from human reviewers).
 * For revision tasks, this also includes the previous `handoff.md` attachment.
 */
export interface IssueContext {
  /** Formatted JIRA comments (author + timestamp + body text). */
  comments: string[];
  /** When true, the agent follows the revision workflow. */
  isRevision: boolean;
  /** Content of the most recent `handoff.md` attachment (revision only). */
  handoffContent?: string | null;
}

/**
 * Build the Copilot CLI prompt from a JIRA issue.
 *
 * Includes: key, summary, description (ADF serialized as JSON), labels,
 * components, priority, and named custom fields.
 *
 * When `context.isRevision` is true, the prompt includes a revision header
 * with the previous handoff content so the agent follows the revision workflow.
 *
 * JIRA comments (if any) are always appended so the agent has human reviewer
 * observations and feedback regardless of whether it's a standard or revision task.
 *
 * Custom field extraction is delegated to {@link JiraFieldExtractor}.
 */
export function buildPrompt(issue: JiraIssue, context?: IssueContext): string {
  const parts: string[] = [];

  if (context?.isRevision) {
    parts.push(
      [
        `Mode: REVISION`,
        ``,
        `This is a revision of a previous attempt. The issue has been reviewed and moved back to revision status.`,
        ``,
        `You MUST follow the Revision Workflow (not the standard workflow):`,
        `1. Find the existing pull request (branch pattern: ralph/${issue.key}-*)`,
        `2. Read ALL PR review threads/comments for inline feedback`,
        `3. Switch to the existing branch and make the requested changes`,
        `4. Do NOT create a new branch — work on the existing one`,
        `5. Push updates, respond to PR comments, and update the handoff file`,
      ].join("\n"),
    );

    if (context.handoffContent) {
      parts.push(
        `Previous Handoff File:\n${"=".repeat(40)}\n${context.handoffContent}\n${"=".repeat(40)}`,
      );
    }
  }

  parts.push(
    `JIRA Issue: ${issue.key}`,
    `Title: ${issue.fields.summary}`,
  );

  if (issue.fields.description) {
    const descStr =
      typeof issue.fields.description === "string"
        ? issue.fields.description
        : JSON.stringify(issue.fields.description, null, 2);
    parts.push(`Description:\n${descStr}`);
  }

  if (issue.fields.labels && issue.fields.labels.length > 0) {
    parts.push(`Labels: ${issue.fields.labels.join(", ")}`);
  }

  if (issue.fields.components && issue.fields.components.length > 0) {
    parts.push(
      `Components: ${issue.fields.components.map((c) => c.name).join(", ")}`
    );
  }

  if (issue.fields.priority) {
    parts.push(`Priority: ${issue.fields.priority.name}`);
  }

  for (const field of fieldExtractor.extractCustomFields(issue)) {
    parts.push(`${field.label}: ${field.value}`);
  }

  if (context?.comments && context.comments.length > 0) {
    parts.push(
      `JIRA Comments (oldest first):\n${"=".repeat(40)}\n${context.comments.join("\n---\n")}\n${"=".repeat(40)}`,
    );
  }

  return parts.join("\n\n");
}
