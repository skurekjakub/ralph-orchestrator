import { extractAdfText } from "../jira/adf-converter.js";
import type { IIssueManager } from "./jira-issue-manager.js";
import type { JiraIssue, JiraComment } from "../jira/types.js";
import type { IAgentProfile, IAppConfig } from "../config.js";
import type { IProfileRouter } from "./profile-router.js";
import type { IOperationLedger } from "./operation-ledger.js";
import { OrchestratorComments } from "./orchestrator-comments.js";
import type { Logger } from "../logger.js";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { toErrorMessage } from "../util/error.js";

/** Escape a trigger string for use in a RegExp. */
function escapeTrigger(trigger: string): string {
  return trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary trigger match. The trigger must appear as a standalone word,
 * optionally followed by `,`, `:`, `(`, or end-of-string. This prevents
 * `@Ralph` from matching inside `@RalphAutocomplete`.
 */
function matchesTrigger(text: string, trigger: string): boolean {
  const re = new RegExp(`(?:^|\\s|\\b)${escapeTrigger(trigger)}(?=[,:;.!?(\\s]|$)`, "i");
  return re.test(text);
}

/**
 * Extract parenthesized parameters from a trigger comment.
 *
 * Given text `"@Ralph(codesamples, verbose) please review"` and trigger `"@Ralph"`,
 * returns `["codesamples", "verbose"]`. Returns an empty array when no parenthesized
 * suffix is present or when the parens are empty.
 */
function parseTriggerParams(text: string, trigger: string): string[] {
  const re = new RegExp(`(?:^|\\s|\\b)${escapeTrigger(trigger)}\\(([^)]+)\\)`, "i");
  const match = re.exec(text);
  if (!match) return [];
  return match[1].split(",").map((p) => p.trim()).filter(Boolean);
}

export { matchesTrigger, parseTriggerParams };

/** Public contract for the comment trigger scanner. */
export interface ITriggerScanner {
  /** Scan a batch of polled issues for trigger comments. Returns the number of new operations planned. */
  scan(issues: JiraIssue[], profiles: readonly IAgentProfile[]): Promise<number>;
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
  private cacheLoaded = false;

  /** Path to the on-disk JSON cache file. Null = in-memory only. Settable for test injection. */
  cachePath: string | null = join("cache", "trigger-cache.json");

  private issueManager: IIssueManager;
  private router: IProfileRouter;
  private ledger: IOperationLedger;
  private logger: Logger;
  private allowedUsers: readonly string[];

  constructor({ issueManager, router, ledger, logger, config }: {
    issueManager: IIssueManager;
    router: IProfileRouter;
    ledger: IOperationLedger;
    logger: Logger;
    config: IAppConfig;
  }) {
    this.issueManager = issueManager;
    this.router = router;
    this.ledger = ledger;
    this.logger = logger;
    this.allowedUsers = config.allowedUsers ?? [];
  }

  /**
   * Scan a batch of polled issues for trigger comments.
   * @returns The number of new operations planned.
   */
  async scan(issues: JiraIssue[], profiles: readonly IAgentProfile[]): Promise<number> {
    this.ensureCacheLoaded();
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
              `Failed to fetch comments for ${issue.key}: ${toErrorMessage(err)}`
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

          if (this.allowedUsers.length > 0 && !this.allowedUsers.includes(comment.author.accountId)) {
            const reason = `User ${comment.author.displayName} (${comment.author.accountId}) not in allowedUsers`;
            this.logger.info(`Rejecting trigger on ${issue.key} — ${reason}`);

            this.ledger.reject(issue.key, {
              variant,
              triggerCommentId: comment.id,
              commentTimestamp: comment.created,
              reason,
            });

            await this.issueManager.postComment(
              issue.key,
              OrchestratorComments.userNotAllowed(profile.displayName, comment.author.displayName),
            ).catch((err) => {
              this.logger.warn(`Failed to post rejection comment on ${issue.key}: ${toErrorMessage(err)}`);
            });

            continue;
          }

          const triggerParams = parseTriggerParams(text, trigger);

          this.ledger.plan(issue.key, {
            variant,
            triggerCommentId: comment.id,
            commentTimestamp: comment.created,
            ...(triggerParams.length > 0 ? { triggerParams } : {}),
          });

          planned++;
          issueTriggerCount++;
          this.logger.info(
            `Planned ${variant} on ${issue.key} (trigger comment ${comment.id})`
          );

          await this.issueManager.postAckComment(
            issue.key,
            profile.displayName,
            triggerParams,
          ).catch((err) => {
            this.logger.warn(`Failed to post ack comment on ${issue.key}: ${toErrorMessage(err)}`);
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

  /** Load cache on first access (lazy). */
  private ensureCacheLoaded(): void {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    this.loadCache();
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

  /** Write the timestamp cache to disk atomically (temp file + rename). */
  private persistCache(): void {
    if (!this.cachePath) return;
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true });
      const data: Record<string, string> = Object.fromEntries(this.lastScanTimestamps);
      const tmp = `${this.cachePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(data, null, 2));
      renameSync(tmp, this.cachePath);
    } catch (err) {
      this.logger.warn(`Failed to persist trigger cache: ${toErrorMessage(err)}`);
    }
  }
}
