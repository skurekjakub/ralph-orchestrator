import { extractAdfText } from "../jira/adf-converter.js";
import type { IIssueManager } from "./jira-issue-manager.js";
import type { JiraIssue, JiraComment } from "../jira/types.js";
import type { AgentProfile } from "../config.js";
import type { IProfileRouter } from "./profile-router.js";
import type { IOperationLedger } from "./operation-ledger.js";
import type { Logger } from "../logger.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Word-boundary trigger match. The trigger must appear as a standalone word,
 * optionally followed by `,` or `:`. This prevents `@Ralph` from matching
 * inside `@RalphAutocomplete`.
 */
function matchesTrigger(text: string, trigger: string): boolean {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\s|\\b)${escaped}(?=[,:;.!?\\s]|$)`, "i");
  return re.test(text);
}

export { matchesTrigger };

/** Public contract for the comment trigger scanner. */
export interface ITriggerScanner {
  /** Scan a batch of polled issues for trigger comments. Returns the number of new operations planned. */
  scan(issues: JiraIssue[], profiles: readonly AgentProfile[]): Promise<number>;
  /** Clear the scan cache (e.g. for testing). */
  clearCache(): void;
}

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
 *
 * The timestamp cache is persisted to disk so it survives orchestrator restarts.
 * Without persistence, every startup would re-fetch comments for all matching
 * issues (potentially hundreds of API calls).
 */
export class TriggerScanner implements ITriggerScanner {
  /**
   * Maps issue key → the `updated` timestamp from the last scan.
   * Used to skip comment fetching for issues that haven't changed.
   */
  private lastScanTimestamps = new Map<string, string>();

  /** Path to the on-disk JSON cache file. Null = in-memory only (tests). */
  private readonly cachePath: string | null;

  constructor(
    private issueManager: IIssueManager,
    private router: IProfileRouter,
    private ledger: IOperationLedger,
    private logger: Logger,
    cachePath?: string,
  ) {
    this.cachePath = cachePath ?? null;
    this.loadCache();
  }

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
          continue;
        }

        issueMatchedAnyProfile = true;
        const variant = profile.variantKey;
        matchedVariants.push(variant);

        if (!comments) {
          try {
            comments = await this.issueManager.getComments(issue.key);
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

          if (!matchesTrigger(text, trigger)) continue;

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

          await this.issueManager.postAckComment(
            issue.key,
            profile.displayName,
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

    if (scanned > 0) this.persistCache();

    return planned;
  }

  /** Clear the scan cache (e.g. for testing). */
  clearCache(): void {
    this.lastScanTimestamps.clear();
    this.persistCache();
  }

  /** Load the timestamp cache from disk. Silently ignores missing/corrupt files. */
  private loadCache(): void {
    if (!this.cachePath) return;
    try {
      const raw = readFileSync(this.cachePath, "utf-8");
      const data: Record<string, string> = JSON.parse(raw);
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string") {
          this.lastScanTimestamps.set(key, value);
        }
      }
      this.logger.info(`Loaded trigger cache: ${this.lastScanTimestamps.size} entries`);
    } catch {
      // File doesn't exist yet or is corrupt — start fresh
    }
  }

  /** Write the timestamp cache to disk. */
  private persistCache(): void {
    if (!this.cachePath) return;
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true });
      const data: Record<string, string> = Object.fromEntries(this.lastScanTimestamps);
      writeFileSync(this.cachePath, JSON.stringify(data, null, 2));
    } catch (err) {
      this.logger.warn(`Failed to persist trigger cache: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
