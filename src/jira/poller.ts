import type { JiraConfig } from "../config.js";
import type { JiraClient } from "./client.js";
import type { JiraIssue } from "./types.js";
import type { Logger } from "../logger.js";
import { consoleLogger } from "../logger.js";

/** Callback invoked when the poller discovers new issues. */
export type PollCallback = (issues: JiraIssue[]) => void;

/**
 * Periodically polls JIRA for issues matching the configured JQL queries.
 *
 * Fires immediately on {@link start}, then repeats on `pollIntervalMs`.
 * Multiple JQL queries are supported; results are deduplicated by issue key
 * within each poll cycle. The poller does NOT deduplicate across cycles —
 * that's the {@link OperationLedger}'s job.
 */
export class JiraPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private logger: Logger;

  /**
   * @param client JIRA REST client for search queries.
   * @param config JIRA settings including JQL queries and poll interval.
   * @param onIssuesFound Callback invoked with deduplicated issues when any are found.
   * @param logger Optional logger; defaults to {@link consoleLogger}.
   */
  constructor(
    private client: JiraClient,
    private config: JiraConfig,
    private onIssuesFound: PollCallback,
    logger?: Logger
  ) {
    this.logger = logger ?? consoleLogger;
  }

  /** Start polling. Fires the first poll immediately, then repeats on interval. */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Fire immediately, then on interval
    this.poll().catch(console.error);
    this.timer = setInterval(() => {
      this.poll().catch(console.error);
    }, this.config.pollIntervalMs);
  }

  /** Stop polling and clear the interval timer. */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      this.logger.info(`Polling JIRA (${this.config.jql.length} queries)...`);
      const allIssues: JiraIssue[] = [];
      const seen = new Set<string>();

      for (const jql of this.config.jql) {
        const issues = await this.client.searchIssues(jql);
        for (const issue of issues) {
          if (!seen.has(issue.key)) {
            seen.add(issue.key);
            allIssues.push(issue);
          }
        }
      }

      if (allIssues.length > 0) {
        allIssues.sort((a, b) =>
          a.fields.created.localeCompare(b.fields.created)
        );
        this.logger.info(`Found ${allIssues.length} issue(s) matching JQL`);
        this.onIssuesFound(allIssues);
      } else {
        this.logger.info("No new issues found");
      }
    } catch (err) {
      this.logger.error(`JIRA poll failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
