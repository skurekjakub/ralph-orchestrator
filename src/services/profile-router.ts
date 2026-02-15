import type { AgentProfile } from "../config.js";
import type { JiraIssue } from "../jira/types.js";

/** Result of a profile match, indicating which profile matched and whether the issue is a revision. */
export interface ProfileMatchResult {
  profile: AgentProfile;
  /** True when the issue matched via `revisionStatuses` rather than `statuses`. */
  isRevision: boolean;
}

/**
 * Fetches comment text for a JIRA issue.
 * Each string in the returned array is the plain-text body of one comment.
 */
export type CommentFetcher = (issueKey: string) => Promise<string[]>;

/**
 * Routes JIRA issues to agent profiles based on matching rules.
 *
 * Matching rules (evaluated per-profile, first match wins):
 * 1. Issue project key must be in `profile.match.projects`
 * 2. Issue status must match `statuses` — if empty, any status matches
 * 3. At least one comment on the issue must contain `commentTrigger` (case-insensitive)
 *
 * Profile order in the config matters — first match wins.
 */
export class ProfileRouter {
  constructor(
    private profiles: readonly AgentProfile[],
    private fetchComments?: CommentFetcher,
  ) {}

  /**
   * Match a JIRA issue to the first matching agent profile.
   *
   * The router fetches issue comments via the injected {@link CommentFetcher}
   * and checks `commentTrigger` for a case-insensitive substring match.
   * If no fetcher was provided, the trigger check is silently skipped
   * (the variant can still match on project + status).
   *
   * @returns The matched profile and revision flag, or null if no profile matches.
   */
  async match(issue: JiraIssue): Promise<ProfileMatchResult | null> {
    const issueProject = issue.key.split("-")[0];
    const issueStatus = issue.fields.status?.name?.toLowerCase() ?? "";

    let commentTexts: string[] | null = null;

    for (const profile of this.profiles) {
      if (!profile.match.projects.includes(issueProject)) continue;

      const statuses = profile.match.statuses ?? [];
      const statusesMatch = statuses.length > 0 &&
        statuses.some((s) => s.toLowerCase() === issueStatus);
      const noStatusFilter = statuses.length === 0;

      if (!statusesMatch && !noStatusFilter) continue;

      if (profile.match.commentTrigger && this.fetchComments) {
        if (!commentTexts) {
          commentTexts = await this.fetchComments(issue.key);
        }
        const triggerLower = profile.match.commentTrigger.toLowerCase();
        const found = commentTexts.some((t) => t.toLowerCase().includes(triggerLower));
        if (!found) continue;
      }

      return { profile, isRevision: false };
    }

    return null;
  }

  /**
   * Check if an issue matches a specific profile's project and status filters.
   * Used by the orchestrator to verify an issue still matches before execution.
   */
  matchesProjectAndStatus(issue: JiraIssue, profile: AgentProfile): boolean {
    const issueProject = issue.key.split("-")[0];
    if (!profile.match.projects.includes(issueProject)) return false;

    const statuses = profile.match.statuses ?? [];
    if (statuses.length === 0) return true;

    const issueStatus = issue.fields.status?.name?.toLowerCase() ?? "";
    return statuses.some((s) => s.toLowerCase() === issueStatus);
  }

  /** Get all configured profile IDs. */
  get profileIds(): string[] {
    return this.profiles.map((p) => p.id);
  }
}
