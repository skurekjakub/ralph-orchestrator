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
 * 2. Issue status must match either `statuses` (new work) or `revisionStatuses` (revision)
 *    — if both arrays are empty, any status matches
 * 3. If `profile.match.keywords` is non-empty, at least one keyword must
 *    appear (case-insensitive) in the issue summary
 * 4. Empty keywords = match all issues in that project (catch-all)
 * 5. If `commentTrigger` is set, at least one comment must contain the trigger string (case-insensitive)
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
   * When a candidate variant has `commentTrigger` set, the router fetches
   * issue comments via the injected {@link CommentFetcher} and checks for
   * a case-insensitive substring match. If no fetcher was provided, the
   * trigger is silently skipped (the variant can still match on other criteria).
   *
   * @returns The matched profile and revision flag, or null if no profile matches.
   */
  async match(issue: JiraIssue): Promise<ProfileMatchResult | null> {
    const issueProject = issue.key.split("-")[0];
    const summaryLower = issue.fields.summary.toLowerCase();
    const issueStatus = issue.fields.status?.name?.toLowerCase() ?? "";

    let commentTexts: string[] | null = null;

    for (const profile of this.profiles) {
      if (!profile.match.projects.includes(issueProject)) continue;

      const statuses = profile.match.statuses ?? [];
      const revStatuses = profile.match.revisionStatuses ?? [];

      const statusesMatch = statuses.length > 0 &&
        statuses.some((s) => s.toLowerCase() === issueStatus);
      const revisionMatch = revStatuses.length > 0 &&
        revStatuses.some((s) => s.toLowerCase() === issueStatus);
      const noStatusFilter = statuses.length === 0 && revStatuses.length === 0;

      if (!statusesMatch && !revisionMatch && !noStatusFilter) continue;

      if (profile.match.keywords.length > 0) {
        const keywordMatch = profile.match.keywords.some(
          (kw) => summaryLower.includes(kw.toLowerCase())
        );
        if (!keywordMatch) continue;
      }

      if (profile.match.commentTrigger && this.fetchComments) {
        if (!commentTexts) {
          commentTexts = await this.fetchComments(issue.key);
        }
        const triggerLower = profile.match.commentTrigger.toLowerCase();
        const found = commentTexts.some((t) => t.toLowerCase().includes(triggerLower));
        if (!found) continue;
      }

      return { profile, isRevision: revisionMatch && !statusesMatch };
    }

    return null;
  }

  /** Get all configured profile IDs. */
  get profileIds(): string[] {
    return this.profiles.map((p) => p.id);
  }
}
