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
 */
export class TriggerScanner {
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
    let planned = 0;

    for (const issue of issues) {
      let comments: JiraComment[] | null = null;

      for (const profile of profiles) {
        const trigger = profile.match.commentTrigger;
        if (!trigger) continue;

        if (!this.router.matchesProjectAndStatus(issue, profile)) continue;

        if (!comments) {
          try {
            comments = await this.jiraClient.getComments(issue.key);
          } catch (err) {
            this.logger.warn(
              `Failed to fetch comments for ${issue.key}: ${err instanceof Error ? err.message : String(err)}`
            );
            comments = [];
          }
        }

        const variant = `${profile.id}:${profile.agentName}`;
        const consumedIds = this.ledger.getConsumedTriggerIds(issue.key, variant);

        for (const comment of comments) {
          if (consumedIds.has(comment.id)) continue;

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
          this.logger.info(
            `Planned ${variant} on ${issue.key} (trigger comment ${comment.id})`
          );

          await this.jiraClient.addComment(
            issue.key,
            OrchestratorComments.ack(profile.agentName)
          ).catch((err) => {
            this.logger.warn(`Failed to post ack comment on ${issue.key}: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
      }
    }

    return planned;
  }
}
