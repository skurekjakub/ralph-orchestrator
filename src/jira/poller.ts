import type { JiraConfig } from "../config.js";
import type { JiraClient } from "./client.js";
import type { JiraIssue } from "./types.js";
import type { Logger } from "../logger.js";
import { consoleLogger } from "../logger.js";

/**
 * Periodically polls JIRA for issues matching the configured JQL queries.
 *
 * Fires immediately on {@link start}, then repeats on `pollIntervalMs`.
 * Multiple JQL queries are supported; results are deduplicated by issue key
 * within each poll cycle. The poller does NOT deduplicate across cycles —
 * that's the {@link OperationLedger}'s job.
 *
 * Discovered issues accumulate in an internal buffer. Use {@link drain}
 * to retrieve and clear the buffer from the main loop.
 */
export class JiraPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private logger: Logger;
  private buffer: JiraIssue[] = [];
  private issuesCallback: (() => void) | null = null;

  /**
   * @param client JIRA REST client for search queries.
   * @param config JIRA settings including JQL queries and poll interval.
   * @param logger Optional logger; defaults to {@link consoleLogger}.
   */
  constructor(
    private client: JiraClient,
    private config: JiraConfig,
    logger?: Logger,
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

  /** Register a callback invoked whenever new issues are added to the buffer. */
  onIssues(callback: () => void): void {
    this.issuesCallback = callback;
  }

  /** Retrieve and clear all accumulated issues since the last drain. */
  drain(): JiraIssue[] {
    return this.buffer.splice(0);
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
        this.buffer.push(...allIssues);
        this.issuesCallback?.();
      } else {
        this.logger.info("No new issues found");
      }
    } catch (err) {
      this.logger.error(`JIRA poll failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
