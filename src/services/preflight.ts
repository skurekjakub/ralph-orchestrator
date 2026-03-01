import type { IResourceManager } from "./task-resource-manager.js";
import type { WorkItemComment, WorkItem } from "../datasource/types.js";

export type PreflightResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Context gathered by the orchestrator and passed to preflight checks. */
export interface PreflightContext {
  comments: WorkItemComment[];
  /** Latest handoff.md attachment content, or null if not found. */
  handoffContent: string | null;
  /** PR URL extracted from comments (most recent first), or null. */
  prUrl: string | null;
}

type PreflightCheck = (workItem: WorkItem, ctx: PreflightContext) => PreflightResult;

const PR_URL_PATTERN = /https?:\/\/(?:github\.com|dev\.azure\.com|bitbucket\.org)[^\s)>]+\/pull(?:request|-requests)?\/\d+/i;

function findPrUrl(comments: WorkItemComment[]): string | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const match = comments[i].body.match(PR_URL_PATTERN);
    if (match) return match[0];
  }
  return null;
}

const PREFLIGHT_CHECKS: Record<string, PreflightCheck> = {
  "review-ready": (_workItem, ctx) => {
    if (!ctx.prUrl) return { ok: false, reason: "No PR URL found in comments" };
    if (!ctx.handoffContent) return { ok: false, reason: "No handoff.md attachment found" };
    return { ok: true };
  },
  "revision-ready": (_workItem, ctx) => {
    if (!ctx.prUrl) return { ok: false, reason: "No PR URL found in comments — revision requires an existing pull request" };
    if (!ctx.handoffContent) return { ok: false, reason: "No handoff.md attachment found — revision requires a previous handoff" };
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
  resources: IResourceManager,
  source: string,
  workItemId: string,
  comments: WorkItemComment[],
): Promise<PreflightContext> {
  const handoffContent = await resources.fetchHandoff(source, workItemId);

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
  workItem: WorkItem,
  ctx: PreflightContext,
): PreflightResult {
  const check = PREFLIGHT_CHECKS[name];
  if (!check) return { ok: true };
  return check(workItem, ctx);
}
