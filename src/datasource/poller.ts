/**
 * Generic work item poller interface.
 *
 * A poller wraps an {@link IDataSourceConnector} and periodically queries
 * for new work items. The orchestrator consumes items via {@link drain},
 * regardless of which source produced them.
 */

import type { WorkItem } from "./types";

/** Polls a single data source for work items on a fixed interval. */
export interface IWorkItemPoller {
  /** Key of the data source this poller is attached to (matches connector's `sourceKey`). */
  readonly sourceKey: string;

  /** Start polling. Fires the first poll immediately, then repeats on interval. */
  start(): void;

  /** Stop polling and clear the interval timer. */
  stop(): void;

  /** Register a callback invoked whenever new items are added to the buffer. */
  onItems(callback: () => void): void;

  /** Retrieve and clear all accumulated work items since the last drain. */
  drain(): WorkItem[];
}
