import type { JiraClient } from "../jira/client.js";
import type { JiraComment, JiraIssue } from "../jira/types.js";
import { extractAdfText } from "../jira/adf-converter.js";

export type PreflightResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Context gathered by the orchestrator and passed to preflight checks. */
export interface PreflightContext {
  comments: JiraComment[];
  /** Latest handoff.md attachment content, or null if not found. */
  handoffContent: string | null;
  /** PR URL extracted from comments (most recent first), or null. */
  prUrl: string | null;
}

type PreflightCheck = (issue: JiraIssue, ctx: PreflightContext) => PreflightResult;

const PR_URL_PATTERN = /https?:\/\/(?:github\.com|dev\.azure\.com|bitbucket\.org)[^\s)>]+\/pull(?:request|-requests)?\/\d+/i;

function findPrUrl(comments: JiraComment[]): string | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const text = typeof comments[i].body === "string"
      ? comments[i].body as string
      : extractAdfText(comments[i].body);
    const match = text.match(PR_URL_PATTERN);
    if (match) return match[0];
  }
  return null;
}

const PREFLIGHT_CHECKS: Record<string, PreflightCheck> = {
  "review-ready": (_issue, ctx) => {
    if (!ctx.prUrl) return { ok: false, reason: "No PR URL found in comments" };
    if (!ctx.handoffContent) return { ok: false, reason: "No handoff.md attachment found" };
    return { ok: true };
  },
};

/**
 * Build a {@link PreflightContext} for an issue by fetching attachments
 * and scanning existing comments for PR URLs.
 *
 * The `comments` array is available from the trigger-scanning
 * phase — pass it in to avoid a redundant JIRA call.
 */
export async function buildPreflightContext(
  jira: JiraClient,
  issueKey: string,
  comments: JiraComment[],
): Promise<PreflightContext> {
  let handoffContent: string | null = null;

  try {
    const attachments = await jira.getAttachments(issueKey);
    const handoff = attachments
      .filter((a) => a.filename.toLowerCase().includes("handoff"))
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())[0];

    if (handoff) {
      handoffContent = await jira.downloadAttachment(handoff.content);
    }
  } catch {
    // Attachment fetch failed — proceed with null handoff
  }

  return {
    comments,
    handoffContent,
    prUrl: findPrUrl(comments),
  };
}

/**
 * Run a named preflight check. Returns `{ ok: true }` if the check name
 * is not registered (unknown checks pass by default).
 */
export function runPreflight(
  name: string,
  issue: JiraIssue,
  ctx: PreflightContext,
): PreflightResult {
  const check = PREFLIGHT_CHECKS[name];
  if (!check) return { ok: true };
  return check(issue, ctx);
}
