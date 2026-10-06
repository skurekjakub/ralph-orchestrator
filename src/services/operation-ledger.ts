import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { IOutputConfig } from "../config/types.js";
import { TaskStatus } from "../container/types.js";

/** Work item IDs are used as filenames — reject anything with path-traversal characters. */
const SAFE_ID_RE = /^[A-Za-z0-9][\w-]*$/;

function assertSafeItemId(id: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Unsafe work item ID for filesystem use: "${id}"`);
  }
}

/** Operation lifecycle state. See {@link VALID_TRANSITIONS} for the allowed edges. */
export enum OperationStatus {
  /** Planned from a trigger comment; waiting for the main loop to pick it up. */
  Pending = "pending",
  /** The agent is running for this operation. At most one per issue. */
  Active = "active",
  /** Terminal: the agent finished with a completed or partial result. */
  Completed = "completed",
  /**
   * Terminal: the operation failed. Reached from `active` when the agent run fails,
   * or from `pending` when the orchestrator could not start it (the variant's profile
   * no longer exists, the work item is unreachable, a pre-activation phase threw).
   */
  Error = "error",
  /** Terminal: refused without running the agent (allowedUsers, stale status, failed preflight). */
  Rejected = "rejected",
}

/** A single recorded agent operation on a work item. */
export interface Operation {
  /** Unique operation ID. */
  id: string;
  /** Data source key this operation's work item belongs to (e.g. "kentico-jira"). */
  dataSource: string;
  /** Unique variant key: `<profileId>:<agentName>:<commentTrigger>`. */
  variant: string;
  /** The comment ID that triggered this operation. */
  triggerCommentId: string;
  /** ISO 8601 timestamp of the comment that triggered this operation. */
  commentTimestamp: string;
  /** ISO 8601 timestamp when the orchestrator discovered this trigger. */
  discoveredAt: string;
  /** Current lifecycle state. */
  status: OperationStatus;
  /** ISO 8601 timestamp when the operation reached a terminal state. */
  completedAt?: string;
  /** Human-readable reason for `rejected` or `error` status. */
  reason?: string;
  /** Result status reported by the agent. Absent when the agent never produced a result. */
  resultStatus?: TaskStatus;
  /** Parameters extracted from the trigger comment (e.g. `@Ralph(codesamples, verbose)` → `["codesamples", "verbose"]`). */
  triggerParams?: string[];
}

/**
 * Allowed state transitions for an operation.
 *
 * ```
 * pending → active → completed | error
 *         ↘ rejected | error
 * ```
 *
 * `pending → error` exists because an operation can fail before it is ever
 * activated (config or infrastructure failure). Recording that as a terminal
 * state is what stops the main loop from picking the same pending operation
 * up again on every iteration and every restart.
 */
const VALID_TRANSITIONS = new Map<OperationStatus, ReadonlySet<OperationStatus>>([
  [OperationStatus.Pending,  new Set([OperationStatus.Active, OperationStatus.Rejected, OperationStatus.Error])],
  [OperationStatus.Active,   new Set([OperationStatus.Completed, OperationStatus.Error])],
]);

/** On-disk structure for a single issue's operation history. */
interface LedgerFile {
  operations: Operation[];
}

/** Public contract for persistent operation tracking. */
export interface IOperationLedger {
  /** Register a callback invoked whenever a new pending operation is planned. */
  onPending(callback: () => void): void;
  /** Plan a new operation (record as `pending`). Returns the operation ID. */
  plan(issueKey: string, opts: { dataSource: string; variant: string; triggerCommentId: string; commentTimestamp: string; triggerParams?: string[] }): string;
  /** Reject a trigger comment immediately (no agent invocation). */
  reject(issueKey: string, opts: { dataSource: string; variant: string; triggerCommentId: string; commentTimestamp: string; reason: string }): void;
  /** Transition an operation to a new status. */
  transition(dataSource: string, issueKey: string, operationId: string, to: OperationStatus, extra?: { reason?: string; resultStatus?: TaskStatus }): void;
  /** Get all operations recorded for an issue. */
  getOperations(dataSource: string, issueKey: string): readonly Operation[];
  /** Get all pending operations for an issue, sorted by comment timestamp. */
  getPending(dataSource: string, issueKey: string): readonly Operation[];
  /** Get the active operation for an issue (at most one). */
  getActive(dataSource: string, issueKey: string): Operation | undefined;
  /** Check if a specific trigger comment has already been consumed by a variant. */
  isConsumed(dataSource: string, issueKey: string, variant: string, triggerCommentId: string): boolean;
  /** Get all consumed trigger comment IDs for a variant on an issue. */
  getConsumedTriggerIds(dataSource: string, issueKey: string, variant: string): Set<string>;
  /** Check if any operation on this issue is active or pending. */
  hasPendingOrActive(dataSource: string, issueKey: string): boolean;
  /** Crash recovery: find all active operations and mark them as `error`. */
  recoverActiveOperations(): Array<{ issueKey: string; operation: Operation }>;
  /** Get all pending operations across all issue ledgers, sorted by comment timestamp. */
  getAllPending(): Array<{ issueKey: string; operation: Operation }>;
}

/**
 * Persistent per-issue operation history.
 *
 * Each issue gets a JSON file in `<historyDir>/<dataSource>/<issueKey>.json`
 * that tracks every agent invocation through its lifecycle:
 *
 * ```
 * pending → active → completed | error
 *         ↘ rejected (allowedUsers, stale status, preflight fail)
 *         ↘ error    (failed before activation: missing profile, unreachable work item)
 * ```
 *
 * Used for:
 * - **Comment-trigger dedup:** Which trigger comments have been consumed?
 * - **Lifecycle tracking:** What's pending? What's active?
 * - **Crash recovery:** Find active operations on startup and mark as error.
 * - **Audit trail:** Full history of agent operations per issue.
 *
 * Writes are atomic (write to temp file, then rename) to avoid corruption.
 */
export class OperationLedger implements IOperationLedger {
  private pendingCallback: (() => void) | null = null;
  private historyDir: string;

  constructor({ outputConfig }: { outputConfig: IOutputConfig }) {
    this.historyDir = join(outputConfig.logDir, "history");
    if (!existsSync(this.historyDir)) {
      mkdirSync(this.historyDir, { recursive: true });
    }
  }

  /** Register a callback invoked whenever a new pending operation is planned. */
  onPending(callback: () => void): void {
    this.pendingCallback = callback;
  }

  /**
   * Plan a new operation (record as `pending`).
   * Returns the operation ID.
   */
  plan(
    issueKey: string,
    opts: {
      dataSource: string;
      variant: string;
      triggerCommentId: string;
      commentTimestamp: string;
      triggerParams?: string[];
    },
  ): string {
    assertSafeItemId(issueKey);
    const op: Operation = {
      id: randomUUID(),
      dataSource: opts.dataSource,
      variant: opts.variant,
      triggerCommentId: opts.triggerCommentId,
      commentTimestamp: opts.commentTimestamp,
      discoveredAt: new Date().toISOString(),
      status: OperationStatus.Pending,
      ...(opts.triggerParams && opts.triggerParams.length > 0 ? { triggerParams: opts.triggerParams } : {}),
    };
    const ledger = this.read(opts.dataSource, issueKey);
    ledger.operations.push(op);
    this.write(opts.dataSource, issueKey, ledger);
    this.pendingCallback?.();
    return op.id;
  }

  /**
   * Reject a trigger comment immediately (no agent invocation).
   * Records a `rejected` operation in the ledger.
   */
  reject(
    issueKey: string,
    opts: {
      dataSource: string;
      variant: string;
      triggerCommentId: string;
      commentTimestamp: string;
      reason: string;
    },
  ): void {
    assertSafeItemId(issueKey);
    const op: Operation = {
      id: randomUUID(),
      dataSource: opts.dataSource,
      variant: opts.variant,
      triggerCommentId: opts.triggerCommentId,
      commentTimestamp: opts.commentTimestamp,
      discoveredAt: new Date().toISOString(),
      status: OperationStatus.Rejected,
      completedAt: new Date().toISOString(),
      reason: opts.reason,
    };
    const ledger = this.read(opts.dataSource, issueKey);
    ledger.operations.push(op);
    this.write(opts.dataSource, issueKey, ledger);
  }

  /** Transition an operation to a new status. */
  transition(
    dataSource: string,
    issueKey: string,
    operationId: string,
    to: OperationStatus,
    extra?: {
      reason?: string;
      resultStatus?: TaskStatus;
    },
  ): void {
    const ledger = this.read(dataSource, issueKey);
    const op = ledger.operations.find((o) => o.id === operationId);
    if (!op) return;

    const allowed = VALID_TRANSITIONS.get(op.status);
    if (!allowed?.has(to)) {
      throw new Error(
        `Invalid operation state transition: ${op.status} → ${to} (operation ${operationId})`,
      );
    }

    op.status = to;
    if (
      to === OperationStatus.Completed ||
      to === OperationStatus.Error ||
      to === OperationStatus.Rejected
    ) {
      op.completedAt = new Date().toISOString();
    }
    if (extra?.reason) op.reason = extra.reason;
    if (extra?.resultStatus) op.resultStatus = extra.resultStatus;
    this.write(dataSource, issueKey, ledger);
  }

  /** Get all operations recorded for an issue. */
  getOperations(dataSource: string, issueKey: string): readonly Operation[] {
    return this.read(dataSource, issueKey).operations;
  }

  /** Get all pending operations for an issue, sorted by comment timestamp. */
  getPending(dataSource: string, issueKey: string): readonly Operation[] {
    return this.read(dataSource, issueKey)
      .operations.filter((op) => op.status === OperationStatus.Pending)
      .sort((a, b) => a.commentTimestamp.localeCompare(b.commentTimestamp));
  }

  /** Get the active operation for an issue (at most one). */
  getActive(dataSource: string, issueKey: string): Operation | undefined {
    return this.read(dataSource, issueKey).operations.find(
      (op) => op.status === OperationStatus.Active,
    );
  }

  /** Check if a specific trigger comment has already been consumed by a variant. */
  isConsumed(
    dataSource: string,
    issueKey: string,
    variant: string,
    triggerCommentId: string,
  ): boolean {
    return this.read(dataSource, issueKey).operations.some(
      (op) =>
        op.variant === variant && op.triggerCommentId === triggerCommentId,
    );
  }

  /** Get all consumed trigger comment IDs for a variant on an issue. */
  getConsumedTriggerIds(dataSource: string, issueKey: string, variant: string): Set<string> {
    const ids = new Set<string>();
    for (const op of this.read(dataSource, issueKey).operations) {
      if (op.variant === variant && op.triggerCommentId) {
        ids.add(op.triggerCommentId);
      }
    }
    return ids;
  }

  /** Check if any operation on this issue is active or pending. */
  hasPendingOrActive(dataSource: string, issueKey: string): boolean {
    return this.read(dataSource, issueKey).operations.some(
      (op) =>
        op.status === OperationStatus.Pending ||
        op.status === OperationStatus.Active,
    );
  }

  /**
   * Crash recovery: find all active operations across all issue ledgers,
   * mark them as `error`, and return the affected issue keys + operation details.
   */
  recoverActiveOperations(): Array<{ issueKey: string; operation: Operation }> {
    const recovered: Array<{ issueKey: string; operation: Operation }> = [];

    if (!existsSync(this.historyDir)) return recovered;

    for (const { dataSource, issueKey } of this.enumerateLedgerFiles()) {
      const ledger = this.read(dataSource, issueKey);
      let changed = false;

      for (const op of ledger.operations) {
        if (op.status === OperationStatus.Active) {
          op.status = OperationStatus.Error;
          op.completedAt = new Date().toISOString();
          op.reason = "Orchestrator restarted while operation was active";
          recovered.push({ issueKey, operation: { ...op } });
          changed = true;
        }
      }

      if (changed) this.write(dataSource, issueKey, ledger);
    }

    return recovered;
  }

  /**
   * Get all pending operations across all issue ledgers, sorted by comment timestamp.
   * Used on startup to resume pending work after restart.
   */
  getAllPending(): Array<{ issueKey: string; operation: Operation }> {
    const pending: Array<{ issueKey: string; operation: Operation }> = [];

    if (!existsSync(this.historyDir)) return pending;

    for (const { dataSource, issueKey } of this.enumerateLedgerFiles()) {
      for (const op of this.getPending(dataSource, issueKey)) {
        pending.push({ issueKey, operation: op });
      }
    }

    return pending.sort((a, b) =>
      a.operation.commentTimestamp.localeCompare(b.operation.commentTimestamp),
    );
  }

  private filePath(dataSource: string, issueKey: string): string {
    return join(this.historyDir, dataSource, `${issueKey}.json`);
  }

  private read(dataSource: string, issueKey: string): LedgerFile {
    const path = this.filePath(dataSource, issueKey);
    if (!existsSync(path)) return { operations: [] };
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as LedgerFile;
    } catch {
      return { operations: [] };
    }
  }

  private write(dataSource: string, issueKey: string, ledger: LedgerFile): void {
    const path = this.filePath(dataSource, issueKey);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(ledger, null, 2) + "\n", "utf-8");
    renameSync(tmp, path);
  }

  /** Enumerate all `<dataSource>/<issueKey>.json` ledger files across all source subdirectories. */
  private enumerateLedgerFiles(): Array<{ dataSource: string; issueKey: string }> {
    const results: Array<{ dataSource: string; issueKey: string }> = [];
    if (!existsSync(this.historyDir)) return results;

    const entries = readdirSync(this.historyDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sourceDir = join(this.historyDir, entry.name);
        const files = readdirSync(sourceDir).filter((f) => f.endsWith(".json"));
        for (const file of files) {
          results.push({ dataSource: entry.name, issueKey: file.replace(".json", "") });
        }
      }
    }
    return results;
  }
}
