/**
 * Generic work item poller for JIRA.
 *
 * Wraps {@link IWorkItemSource} (the JIRA connector's discovery interface) and
 * polls on a fixed interval. Implements {@link IWorkItemPoller} — the orchestrator
 * consumes work items via {@link drain} without knowing the source system.
 */

import type { IWorkItemSource } from "../../connector.js";
import type { IWorkItemPoller } from "../../poller.js";
import type { WorkItem } from "../../types.js";
import { consoleLogger, type Logger } from "../../../logger.js";
import { toErrorMessage } from "../../../util/error.js";

/**
 * Polls JIRA for work items matching pre-built JQL queries.
 *
 * Fires immediately on {@link start}, then repeats on `pollIntervalMs`.
 * Results are deduplicated by work item ID within and across poll cycles.
 */
export class JiraWorkItemPoller implements IWorkItemPoller {
  readonly sourceKey: string;

  private readonly connector: IWorkItemSource;
  private readonly queries: readonly string[];
  private readonly pollIntervalMs: number;
  private readonly logger: Logger;

  private buffer = new Map<string, WorkItem>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private itemsCallback: (() => void) | null = null;

  constructor(connector: IWorkItemSource, queries: readonly string[], pollIntervalMs: number, logger?: Logger) {
    this.sourceKey = connector.sourceKey;
    this.connector = connector;
    this.queries = queries;
    this.pollIntervalMs = pollIntervalMs;
    this.logger = logger ?? consoleLogger;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.poll().catch(console.error);
    this.timer = setInterval(() => {
      this.poll().catch(console.error);
    }, this.pollIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onItems(callback: () => void): void {
    this.itemsCallback = callback;
  }

  drain(): WorkItem[] {
    const items = [...this.buffer.values()];
    this.buffer.clear();
    return items;
  }

  private async poll(): Promise<void> {
    try {
      this.logger.info(`Polling JIRA (${this.queries.length} queries)...`);
      const seen = new Set<string>();
      const allItems: WorkItem[] = [];

      for (const query of this.queries) {
        const items = await this.connector.searchWorkItems(query);
        for (const item of items) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            allItems.push(item);
          }
        }
      }

      if (allItems.length > 0) {
        allItems.sort((a, b) => a.created.localeCompare(b.created));
        for (const item of allItems) {
          this.buffer.set(item.id, item);
        }
        this.itemsCallback?.();
      }

      this.logger.info(`Polling for Ralph requests... ${allItems.length} candidate items`);
    } catch (err) {
      this.logger.error(`JIRA poll failed: ${toErrorMessage(err)}`);
    }
  }
}
