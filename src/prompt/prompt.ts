import type { WorkItem } from "../datasource/types.js";
import { PromptSectionSource, type PromptSection } from "./prompt-auditor.js";
import { normalizeContent } from "./normalizer.js";

/**
 * Context about an issue provided to the agent alongside the work item fields.
 *
 * For standard tasks, this includes any existing comments (which may
 * contain observations or context from human reviewers).
 * For revision tasks, this also includes the previous `handoff.md` attachment.
 */
export interface IssueContext {
  /** Formatted comments (author + timestamp + body text). */
  comments: string[];
  /** When true, the agent follows the revision workflow. */
  isRevision: boolean;
  /** Content of the most recent `handoff.md` attachment (revision only). */
  handoffContent?: string | null;
  /** Parsed trigger parameters from the invoking comment (e.g. release_notes, codesamples). */
  triggerParams?: Record<string, string>;
}

/** Return value of {@link buildPromptWithSections}. */
export interface PromptWithSections {
  /** The assembled prompt string ready for the CLI. */
  prompt: string;
  /** Labelled sections of untrusted content for audit. */
  sections: PromptSection[];
}

/**
 * Build the CLI prompt from a work item and return both the prompt
 * string and labelled sections for prompt-injection auditing.
 *
 * Untrusted content (description, custom fields, comments, handoff) is
 * included as-is — the agent template's prompt-security section trains
 * the agent to treat task data as information, not instructions.
 *
 * When `triggerParams` are provided, actionable reminders are appended
 * after the JIRA data so the agent sees them alongside the task context.
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

  const dataParts: string[] = [];

  if (workItem.description) {
    const descStr = normalizeContent(workItem.description);
    dataParts.push(`Description:\n${descStr}`);
    sections.push({ source: PromptSectionSource.WorkItemField, fieldName: "description", content: descStr });
  }

  if (workItem.labels.length > 0) {
    dataParts.push(`Labels: ${workItem.labels.join(", ")}`);
  }

  if (workItem.components.length > 0) {
    dataParts.push(
      `Components: ${workItem.components.join(", ")}`
    );
  }

  if (workItem.priority) {
    dataParts.push(`Priority: ${workItem.priority}`);
  }

  for (const [label, value] of workItem.customFields) {
    const normalized = normalizeContent(value);
    dataParts.push(`${label}: ${normalized}`);
    sections.push({ source: PromptSectionSource.WorkItemField, fieldName: label, content: normalized });
  }

  if (context?.comments && context.comments.length > 0) {
    const joined = normalizeContent(context.comments.join("\n---\n"));
    dataParts.push(`JIRA Comments (oldest first):\n${joined}`);
    sections.push({ source: PromptSectionSource.Comment, fieldName: "comments", content: joined });
  }

  if (dataParts.length > 0) {
    parts.push(...dataParts);
  }

  // ── Trigger-param nudges ──
  const nudges = buildTriggerNudges(context?.triggerParams, workItem.id);
  if (nudges.length > 0) {
    parts.push(nudges.join("\n"));
  }

  return { prompt: parts.join("\n\n"), sections };
}

/**
 * Map of trigger parameters to prompt nudge text.
 *
 * Each nudge is a reminder appended to the end of the user prompt so the
 * agent sees it alongside the JIRA data rather than only in system context.
 */
const TRIGGER_NUDGES: Record<string, (taskId: string) => string> = {
  release_notes: (taskId) =>
    `⚠️ REMINDER: Write release notes for this task (see ralph-write-release-notes skill). Output to .ralph/tasks/${taskId}/release-notes.md and include in the handoff.`,
  codesamples: () =>
    `⚠️ REMINDER: This task involves the code samples project ralph-codesamples-project skill. Build with \`npm run codesamples:build\` before committing any .cs files.`,
};

/**
 * Build prompt nudge lines for active trigger parameters.
 *
 * Only returns nudges for params that have a registered mapping in
 * {@link TRIGGER_NUDGES} and are truthy in the provided params record.
 */
function buildTriggerNudges(
  triggerParams: Record<string, string> | undefined,
  taskId: string,
): string[] {
  if (!triggerParams) return [];

  const nudges: string[] = [];
  for (const [key, builder] of Object.entries(TRIGGER_NUDGES)) {
    if (triggerParams[key]) {
      nudges.push(builder(taskId));
    }
  }
  return nudges;
}

/**
 * Build the CLI prompt from a work item.
 *
 * Convenience wrapper around {@link buildPromptWithSections} that
 * returns only the prompt string.
 */
export function buildPrompt(workItem: WorkItem, context?: IssueContext): string {
  return buildPromptWithSections(workItem, context).prompt;
}
