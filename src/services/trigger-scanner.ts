import { extractAdfText } from "../jira/field-extractor.js";
import { OrchestratorComments } from "./orchestrator-comments.js";
import type { JiraClient } from "../jira/client.js";
import type { JiraIssue, JiraComment } from "../jira/types.js";
import type { AgentProfile } from "../config.js";
import type { ProfileRouter } from "./profile-router.js";
import type { OperationLedger } from "./operation-ledger.js";
import type { Logger } from "../logger.js";

/**
 * Scans JIRA issue comments for trigger strings and plans operations in the ledger.
 *
 * For each issue × profile combination:
 * 1. Checks if the issue matches the profile's project/status rules
 * 2. Fetches comments once per issue (lazy, shared across profiles)
 * 3. Compares each comment against the profile's `commentTrigger`
 * 4. Plans unconsumed triggers as pending operations
 * 5. Posts an acknowledgment comment for each new trigger
 *
 * Tracks each issue's `updated` timestamp.
 * If an issue hasn't been updated since its last scan, comment fetching is
 * skipped entirely. This reduces JIRA API calls from N (all matching issues)
 * to only the issues with new activity.
 */
export class TriggerScanner {
  /**
   * Maps issue key → the `updated` timestamp from the last scan.
   * Used to skip comment fetching for issues that haven't changed.
   */
  private lastScanTimestamps = new Map<string, string>();

  constructor(
    private jiraClient: JiraClient,
    private router: ProfileRouter,
    private ledger: OperationLedger,
    private logger: Logger,
  ) {}

  /**
   * Scan a batch of polled issues for trigger comments.
   * @returns The number of new operations planned.
   */
  async scan(issues: JiraIssue[], profiles: readonly AgentProfile[]): Promise<number> {
    const startMs = Date.now();
    let planned = 0;
    let skipped = 0;
    let commentsFetched = 0;
    let alreadyConsumed = 0;
    let profileMismatches = 0;

    for (const issue of issues) {
      const updated = issue.fields.updated;
      if (updated && this.lastScanTimestamps.get(issue.key) === updated) {
        skipped++;
        continue;
      }

      let comments: JiraComment[] | null = null;
      let issueMatchedAnyProfile = false;
      const matchedVariants: string[] = [];
      let issueTriggerCount = 0;
      let issueConsumedCount = 0;

      for (const profile of profiles) {
        const trigger = profile.match.commentTrigger;
        if (!trigger) continue;

        if (!this.router.matchesProjectAndStatus(issue, profile)) {
          profileMismatches++;
          continue;
        }

        issueMatchedAnyProfile = true;
        const variant = `${profile.id}:${profile.agentName}`;
        matchedVariants.push(variant);

        if (!comments) {
          try {
            comments = await this.jiraClient.getComments(issue.key);
            commentsFetched++;
          } catch (err) {
            this.logger.warn(
              `Failed to fetch comments for ${issue.key}: ${err instanceof Error ? err.message : String(err)}`
            );
            comments = [];
          }
        }

        const consumedIds = this.ledger.getConsumedTriggerIds(issue.key, variant);

        for (const comment of comments) {
          if (consumedIds.has(comment.id)) {
            alreadyConsumed++;
            issueConsumedCount++;
            continue;
          }

          const text = typeof comment.body === "string"
            ? comment.body
            : extractAdfText(comment.body);

          if (!text.toLowerCase().includes(trigger.toLowerCase())) continue;

          this.ledger.plan(issue.key, {
            variant,
            triggerCommentId: comment.id,
            commentTimestamp: comment.created,
          });

          planned++;
          issueTriggerCount++;
          this.logger.info(
            `Planned ${variant} on ${issue.key} (trigger comment ${comment.id})`
          );

          await this.jiraClient.addComment(
            issue.key,
            OrchestratorComments.ack(profile.displayName)
          ).catch((err) => {
            this.logger.warn(`Failed to post ack comment on ${issue.key}: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
      }

      if (issueMatchedAnyProfile) {
        this.logger.info(
          `  ${issue.key} [${issue.fields.status.name}]: ${comments?.length ?? 0} comments, ${issueTriggerCount} triggers, ${issueConsumedCount} consumed (${matchedVariants.join(", ")})`
        );
      }

      if (updated && issueMatchedAnyProfile) {
        this.lastScanTimestamps.set(issue.key, updated);
      }
    }

    const elapsedMs = Date.now() - startMs;
    const scanned = issues.length - skipped;
    this.logger.info(
      `Trigger scan: ${issues.length} issues (${scanned} scanned, ${skipped} unchanged) → ${planned} planned, ${alreadyConsumed} consumed, ${commentsFetched} API calls [${elapsedMs}ms]`
    );

    return planned;
  }

  /** Clear the scan cache (e.g. for testing). */
  clearCache(): void {
    this.lastScanTimestamps.clear();
  }
}
