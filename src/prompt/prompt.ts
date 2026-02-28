import type { WorkItem } from "../datasource/types.js";
import { PromptSectionSource, type PromptSection } from "./prompt-auditor.js";
import { normalizeContent } from "./normalizer.js";

/** Delimiter wrapping untrusted JIRA data in the prompt. */
const UNTRUSTED_BEGIN = "--- BEGIN UNTRUSTED JIRA DATA ---";
const UNTRUSTED_END = "--- END UNTRUSTED JIRA DATA ---";

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

/** Return value of {@link buildPromptWithSections}. */
export interface PromptWithSections {
  /** The assembled prompt string ready for the CLI. */
  prompt: string;
  /** Labelled sections of untrusted content for audit. */
  sections: PromptSection[];
}

/**
 * Build the CLI prompt from a JIRA issue and return both the prompt
 * string and labelled sections for prompt-injection auditing.
 *
 * Untrusted content (description, custom fields, comments, handoff) is wrapped
 * in `--- BEGIN/END UNTRUSTED JIRA DATA ---` delimiters so the agent can
 * distinguish system instructions from user-provided data.
 *
 * @see buildPrompt — convenience wrapper that returns only the string.
 */
export function buildPromptWithSections(
  workItem: WorkItem,
  context?: IssueContext,
): PromptWithSections {
  const parts: string[] = [];
  const sections: PromptSection[] = [];

  if (context?.isRevision) {
    parts.push(
      [
        `Mode: REVISION`,
        ``,
        `This is a revision of a previous attempt. The issue has been reviewed and moved back to revision status.`,
        ``,
        `You MUST follow the Revision Workflow (not the standard workflow):`,
        `1. Find the existing pull request (branch pattern: ralph/${workItem.id}-*)`,
        `2. Read ALL PR review threads/comments for inline feedback`,
        `3. Switch to the existing branch and make the requested changes`,
        `4. Do NOT create a new branch — work on the existing one`,
        `5. Push updates, respond to PR comments, and update the handoff file`,
      ].join("\n"),
    );

    if (context.handoffContent) {
      const normalized = normalizeContent(context.handoffContent);
      sections.push({ source: PromptSectionSource.Handoff, fieldName: "handoff", content: normalized });
      parts.push(
        `Previous Handoff File:\n${"=".repeat(40)}\n${normalized}\n${"=".repeat(40)}`,
      );
    }
  }

  parts.push(
    `JIRA Issue: ${workItem.id}`,
    `Title: ${workItem.title}`,
  );

  // ── Untrusted data boundary ──
  const untrustedParts: string[] = [];

  if (workItem.description) {
    const descStr = normalizeContent(workItem.description);
    untrustedParts.push(`Description:\n${descStr}`);
    sections.push({ source: PromptSectionSource.WorkItemField, fieldName: "description", content: descStr });
  }

  if (workItem.labels.length > 0) {
    untrustedParts.push(`Labels: ${workItem.labels.join(", ")}`);
  }

  if (workItem.components.length > 0) {
    untrustedParts.push(
      `Components: ${workItem.components.join(", ")}`
    );
  }

  if (workItem.priority) {
    untrustedParts.push(`Priority: ${workItem.priority}`);
  }

  for (const [label, value] of workItem.customFields) {
    const normalized = normalizeContent(value);
    untrustedParts.push(`${label}: ${normalized}`);
    sections.push({ source: PromptSectionSource.WorkItemField, fieldName: label, content: normalized });
  }

  if (context?.comments && context.comments.length > 0) {
    const joined = normalizeContent(context.comments.join("\n---\n"));
    untrustedParts.push(`JIRA Comments (oldest first):\n${joined}`);
    sections.push({ source: PromptSectionSource.Comment, fieldName: "comments", content: joined });
  }

  if (untrustedParts.length > 0) {
    parts.push(
      UNTRUSTED_BEGIN,
      ...untrustedParts,
      UNTRUSTED_END,
    );
  }

  return { prompt: parts.join("\n\n"), sections };
}

/**
 * Build the CLI prompt from a JIRA issue.
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
export function buildPrompt(workItem: WorkItem, context?: IssueContext): string {
  return buildPromptWithSections(workItem, context).prompt;
}
