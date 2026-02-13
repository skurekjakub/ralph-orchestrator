import type { AppConfig } from "./config.js";
import { JiraClient } from "./jira/client.js";
import { JiraPoller } from "./jira/poller.js";
import { TaskQueue } from "./queue.js";
import { ContainerManager } from "./container/manager.js";
import { LogCollector } from "./logs/collector.js";
import type { JiraIssue } from "./jira/types.js";
import type { RalphResult } from "./container/types.js";
import type { Logger } from "./logger.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** Snapshot of the orchestrator's current state, pushed to the Ink dashboard on every change. */
export interface OrchestratorState {
  /** Current lifecycle phase. */
  status: "idle" | "polling" | "working" | "stopping";
  /** The JIRA issue currently being processed, or null if idle. */
  currentIssue: { key: string; summary: string } | null;
  /** Unix timestamp when the current task started, or null if idle. */
  startedAt: number | null;
  /** Tasks completed during this orchestrator session. */
  completedToday: CompletedTask[];
  /** Number of issues waiting in the queue. */
  queueSize: number;
  /** Read-only snapshot of queued issue keys and summaries. */
  queueItems: readonly { key: string; summary: string }[];
  /** Ring buffer of the last {@link Orchestrator.MAX_LOG_LINES} log entries (for the Ink panel). */
  logs: readonly LogEntry[];
}

/** A single log entry stored in the ring buffer and persisted to the activity JSONL file. */
export interface LogEntry {
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  /** Severity level. */
  level: "info" | "warn" | "error";
  /** Human-readable log message. */
  message: string;
}

/** Record of a completed task, displayed in the Ink HistoryPanel. */
export interface CompletedTask {
  /** JIRA issue key (e.g. `DF-2759`). */
  key: string;
  /** JIRA issue summary / title. */
  summary: string;
  /** Final status reported by the Ralph agent or inferred from exit code. */
  status: RalphResult["status"];
  /** Total wall-clock time from container start to exec completion. */
  durationMs: number;
  /** ADO pull request URL, if one was created. */
  prUrl?: string;
}

/**
 * Main orchestration loop.
 *
 * Wires together the JIRA poller, in-memory task queue, devcontainer lifecycle,
 * and log collection. Processes one JIRA issue at a time:
 *
 * 1. Transition issue to "In Progress" and post a start comment
 * 2. Spin up the Ralph devcontainer
 * 3. Execute the Copilot CLI agent inside it
 * 4. Collect logs and save execution summary
 * 5. Transition issue to "Ready for Review"
 * 6. Tear down the container
 *
 * All activity is streamed to an Ink terminal dashboard and persisted to
 * `output/logs/activity-YYYY-MM-DD.jsonl`.
 */
export class Orchestrator {
  private jiraClient: JiraClient;
  private poller: JiraPoller;
  private queue: TaskQueue;
  private container: ContainerManager;
  private logCollector: LogCollector;

  private busy = false;
  private running = false;
  private currentIssue: JiraIssue | null = null;
  private workStartedAt: number | null = null;
  private completedToday: CompletedTask[] = [];
  private stateCallback: ((state: OrchestratorState) => void) | null = null;
  private logBuffer: LogEntry[] = [];
  private logFilePath: string;
  private static readonly MAX_LOG_LINES = 50;

  constructor(private config: AppConfig) {
    // Set up persistent activity log file
    const logDir = resolve(process.cwd(), config.output.logDir);
    mkdirSync(logDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    this.logFilePath = join(logDir, `activity-${date}.jsonl`);

    // Build a Logger that routes through our log buffer
    const logger: Logger = {
      info: (msg) => this.log(msg),
      warn: (msg) => this.warn(msg),
      error: (msg) => this.logError(msg),
    };

    this.jiraClient = new JiraClient(
      config.jira,
      config.secrets.jiraEmail,
      config.secrets.jiraPat
    );

    this.queue = new TaskQueue();
    this.container = new ContainerManager(config, logger);
    this.logCollector = new LogCollector(config.output);

    this.poller = new JiraPoller(
      this.jiraClient,
      config.jira,
      (issues) => this.onIssuesFound(issues),
      logger
    );
  }

  /** Subscribe to state changes for the dashboard */
  onStateChange(callback: (state: OrchestratorState) => void): void {
    this.stateCallback = callback;
  }

  /** Get current state snapshot */
  getState(): OrchestratorState {
    return {
      status: !this.running
        ? "stopping"
        : this.busy
          ? "working"
          : "idle",
      currentIssue: this.currentIssue
        ? {
            key: this.currentIssue.key,
            summary: this.currentIssue.fields.summary,
          }
        : null,
      startedAt: this.workStartedAt,
      completedToday: [...this.completedToday],
      queueSize: this.queue.size,
      queueItems: this.queue.items,
      logs: [...this.logBuffer],
    };
  }

  private log(message: string): void {
    this.pushLog("info", message);
  }

  private warn(message: string): void {
    this.pushLog("warn", message);
  }

  private logError(message: string): void {
    this.pushLog("error", message);
  }

  private pushLog(level: LogEntry["level"], message: string): void {
    const entry: LogEntry = { timestamp: Date.now(), level, message };
    this.logBuffer.push(entry);
    if (this.logBuffer.length > Orchestrator.MAX_LOG_LINES) {
      this.logBuffer.shift();
    }
    // Persist every log entry to disk (append-only JSONL)
    try {
      appendFileSync(this.logFilePath, JSON.stringify(entry) + "\n");
    } catch {
      // non-critical — don't let log file errors break the orchestrator
    }
    this.emitState();
  }

  /** Start the orchestrator loop */
  async start(): Promise<void> {
    this.running = true;
    this.poller.start();
    this.emitState();

    this.log("Orchestrator started — polling JIRA for new tasks");
    this.log(`Poll interval: ${this.config.jira.pollIntervalMs / 1000}s | Timeout: ${this.config.ralph.timeoutMs / 1000}s`);
    this.log(`JQL queries: ${this.config.jira.jql.length}`);

    while (this.running) {
      if (this.busy) {
        await sleep(5000);
        continue;
      }

      const issue = this.queue.dequeue();
      if (!issue) {
        await sleep(5000);
        continue;
      }

      await this.processIssue(issue);
    }

    this.poller.stop();
    this.log("Orchestrator stopped");
  }

  /** Gracefully stop the orchestrator */
  stop(): void {
    this.running = false;
    this.emitState();
  }

  /** Full graceful shutdown — stops poller, waits for current task, cleans up container */
  async shutdown(): Promise<void> {
    this.log("Shutting down gracefully...");
    this.running = false;
    this.poller.stop();
    this.emitState();

    if (this.busy) {
      this.log("Task in progress — stopping container...");
      await this.container.stop()
        .then(() => this.log("Container stopped"))
        .catch((err) => {
          this.warn(`Failed to stop container during shutdown: ${err instanceof Error ? err.message : String(err)}`);
        });
    }

    this.log("Shutdown complete");
  }

  private async processIssue(issue: JiraIssue): Promise<void> {
    this.busy = true;
    this.currentIssue = issue;
    this.workStartedAt = Date.now();
    this.emitState();

    this.log(`Picked up ${issue.key}: ${issue.fields.summary}`);

    try {
      // 1. Transition to In Progress (with retry)
      this.log(`Transitioning ${issue.key} to In Progress (id=${this.config.jira.inProgressTransitionId})...`);
      await this.withRetry(
        () => this.jiraClient.transitionIssue(issue.key, this.config.jira.inProgressTransitionId),
        `transition ${issue.key}`
      )
        .then(() => this.log(`${issue.key} transitioned to In Progress`))
        .catch((err) => {
          this.warn(`Failed to transition ${issue.key} after retries: ${err instanceof Error ? err.message : String(err)}`);
        });

      // 2. Comment on JIRA (with retry)
      this.log(`Posting start comment on ${issue.key}...`);
      await this.withRetry(
        () => this.jiraClient.addComment(
          issue.key,
          `🤖 Ralph is starting work on this issue.\nBranch: ralph/${issue.key.toLowerCase()}`
        ),
        `comment on ${issue.key}`
      )
        .then(() => this.log(`Start comment posted on ${issue.key}`))
        .catch((err) => {
          this.warn(`Failed to comment on ${issue.key} after retries: ${err instanceof Error ? err.message : String(err)}`);
        });

      // 3. Start the container
      await this.container.start();

      // 4. Verify container health
      this.log("Verifying container health...");
      await this.container.checkPrerequisites();

      // 5. Clean previous logs
      this.log("Cleaning previous audit logs...");
      await this.container.cleanLogs();

      // 6. Execute Ralph
      const timeoutSec = Math.round(this.config.ralph.timeoutMs / 1000);
      this.log(`Executing Ralph agent for ${issue.key} (timeout: ${timeoutSec}s)...`);
      const result = await this.container.execute(issue);
      this.log(`Ralph finished: status=${result.status}, exit=${result.exitCode}, duration=${Math.round(result.durationMs / 1000)}s`);

      if (result.prUrl) {
        this.log(`PR created: ${result.prUrl}`);
      }

      if (result.status === "partial") {
        this.warn(`${issue.key} completed with partial status — check handoff for details`);
      }

      // 7. Save full copilot stdout/stderr to disk
      const copilotLogPath = join(this.config.output.logDir, `${issue.key}-${Date.now()}-copilot.log`);
      try {
        const fullOutput = [
          result.stdout ? `=== STDOUT ===\n${result.stdout}` : "",
          result.stderr ? `\n=== STDERR ===\n${result.stderr}` : "",
        ].join("");
        appendFileSync(copilotLogPath, fullOutput);
        this.log(`Copilot output saved: ${copilotLogPath}`);
      } catch {
        this.warn("Failed to save copilot output to disk");
      }

      // 8. Collect audit logs (handoff is attached to JIRA by Ralph directly)
      this.log("Collecting audit logs from container...");
      result.auditLogPath =
        (await this.container.collectLogs(issue.key)) ?? undefined;

      if (result.auditLogPath) {
        this.log(`Audit logs saved: ${result.auditLogPath}`);
      } else {
        this.warn("No audit logs found in container");
      }

      // 9. Save execution summary
      this.logCollector.saveExecutionSummary(result, this.logFilePath);
      this.log("Execution summary saved");

      // 9. Track completion (Ralph posts its own JIRA comment with summary + PR link)
      this.completedToday.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: result.status,
        durationMs: result.durationMs,
        prUrl: result.prUrl,
      });

      this.log(`✓ ${issue.key} completed: ${result.status} (${Math.round(result.durationMs / 1000)}s)`);
    } catch (err) {
      this.logError(`Error processing ${issue.key}: ${err instanceof Error ? err.message : String(err)}`);

      this.completedToday.push({
        key: issue.key,
        summary: issue.fields.summary,
        status: "error",
        durationMs: Date.now() - (this.workStartedAt ?? Date.now()),
      });
    } finally {
      // 10. Stop the container
      this.log("Stopping devcontainer...");
      await this.container.stop()
        .then(() => this.log("Devcontainer stopped"))
        .catch((err) => {
          this.warn(`Failed to stop container: ${err instanceof Error ? err.message : String(err)}`);
        });

      // 11. Transition to "Ready for Review" (regardless of outcome — human needs to check)
      if (this.config.jira.readyForReviewTransitionId) {
        this.log(`Transitioning ${issue.key} to Ready for Review...`);
        await this.withRetry(
          () => this.jiraClient.transitionIssue(issue.key, this.config.jira.readyForReviewTransitionId),
          `transition ${issue.key} to Ready for Review`
        )
          .then(() => this.log(`${issue.key} moved to Ready for Review`))
          .catch((err) => {
            this.warn(`Failed to transition ${issue.key} to Ready for Review: ${err instanceof Error ? err.message : String(err)}`);
          });
      }

      this.busy = false;
      this.currentIssue = null;
      this.workStartedAt = null;
      this.queue.markProcessed(issue.key);
      this.emitState();
    }
  }

  private onIssuesFound(issues: JiraIssue[]): void {
    let added = 0;
    for (const issue of issues) {
      if (this.queue.enqueue(issue)) {
        added++;
        this.log(`Enqueued ${issue.key}: ${issue.fields.summary}`);
      }
    }
    if (added > 0) {
      this.emitState();
    }
  }

  private emitState(): void {
    this.stateCallback?.(this.getState());
  }

  /** Retry an async operation up to `attempts` times with exponential backoff */
  private async withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    attempts = 3,
    delayMs = 2000
  ): Promise<T> {
    for (let i = 1; i <= attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === attempts) throw err;
        const wait = delayMs * i;
        this.warn(`${label} failed (attempt ${i}/${attempts}), retrying in ${wait}ms...`);
        await sleep(wait);
      }
    }
    throw new Error("unreachable");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}
