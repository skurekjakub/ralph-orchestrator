import type { IJiraConfig } from "../config/types.js";
import type { IJiraClient } from "./client.js";
import type { JiraIssue } from "./types.js";
import type { Logger } from "../logger.js";
import { consoleLogger } from "../logger.js";
import { toErrorMessage } from "../util/error.js";

/** Public contract for the JIRA issue poller. */
export interface IJiraPoller {
  /** Start polling. Fires the first poll immediately, then repeats on interval. */
  start(): void;
  /** Stop polling and clear the interval timer. */
  stop(): void;
  /** Register a callback invoked whenever new issues are added to the buffer. */
  onIssues(callback: () => void): void;
  /** Retrieve and clear all accumulated issues since the last drain. */
  drain(): JiraIssue[];
}

/**
 * Periodically polls JIRA for issues matching the configured JQL queries.
 *
 * Fires immediately on {@link start}, then repeats on `pollIntervalMs`.
 * Multiple JQL queries are supported; results are deduplicated by issue key
 * both within and across poll cycles. The buffer always holds the latest
 * version of each issue (most recent poll wins). Duplicate suppression
 * across cycles is cosmetic — the {@link OperationLedger} is the real dedup gate.
 *
 * Discovered issues accumulate in an internal buffer. Use {@link drain}
 * to retrieve and clear the buffer from the main loop.
 */
export class JiraPoller implements IJiraPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private logger: Logger;
  private buffer = new Map<string, JiraIssue>();
  private issuesCallback: (() => void) | null = null;

  private client: IJiraClient;
  private config: IJiraConfig;

  constructor({ jiraClient, jiraConfig, logger }: {
    jiraClient: IJiraClient;
    jiraConfig: IJiraConfig;
    logger?: Logger;
  }) {
    this.client = jiraClient;
    this.config = jiraConfig;
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
    const issues = [...this.buffer.values()];
    this.buffer.clear();
    return issues;
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
        for (const issue of allIssues) {
          this.buffer.set(issue.key, issue);
        }
        this.issuesCallback?.();
      }

      this.logger.info(`Polling for Ralph requests... ${allIssues.length} candidate issues`);
    } catch (err) {
      this.logger.error(`JIRA poll failed: ${toErrorMessage(err)}`);
    }
  }
}
