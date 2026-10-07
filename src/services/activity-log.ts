import { LogLevel, LogSource, type LogEntry } from "../orchestrator-types";
import type { Logger } from "../logger";
import type { IOutputConfig } from "../config/types";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** Format a log entry as a single line: `<ISO-8601 UTC timestamp> [LEVEL] message` */
function formatLine(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toISOString();
  const tag = entry.level === LogLevel.Info ? "INFO" : entry.level === LogLevel.Warn ? "WARN" : "ERR ";
  return `${time} [${tag}] ${entry.message}`;
}

/** Public contract for the activity log ring buffer and persistence layer. */
export interface IActivityLog {
  /** Subscribe to changes (called after every log entry). */
  onLogChange(callback: () => void): void;
  /** Build a Logger facade that routes all messages through this ActivityLog. */
  createLogger(): Logger;
  /** Build a Logger facade that tags entries with `source: "container"`. */
  createContainerLogger(): Logger;
  /** Start streaming container log entries to a per-task file. */
  startTaskLog(issueKey: string): string;
  /** Stop streaming to the per-task file. */
  endTaskLog(): void;
  /** Push a log entry to the ring buffer, persist to daily log, and stream to per-task file. */
  push(level: LogEntry["level"], message: string, source?: LogEntry["source"]): void;
  /** Read-only snapshot of the ring buffer. */
  readonly entries: readonly LogEntry[];
  /** Path to the current session's activity JSONL file. */
  readonly activityFilePath: string;
}

/**
 * Manages the in-memory log ring buffer and persistent activity log on disk.
 *
 * Every log entry is:
 * 1. Added to the ring buffer (capped at {@link maxLines})
 * 2. Appended to `output/logs/activity-YYYY-MM-DD.log` (never truncated)
 * 3. Emitted via the optional `onChange` callback (for Ink dashboard re-renders)
 */
export class ActivityLog implements IActivityLog {
  private buffer: LogEntry[] = [];
  private filePath: string;
  private containerFilePath: string;
  private taskFilePath: string | null = null;
  private onChange: (() => void) | null = null;
  private logDir: string;
  private maxLines: number;

  /**
   * @param opts.outputConfig Output config (reads `logDir`).
   * @param opts.rootDir The orchestrator checkout a relative `logDir` resolves against.
   * @param opts.maxLines Ring buffer size (default 500).
   */
  constructor(
    {
      outputConfig,
      rootDir,
    }: {
      outputConfig: IOutputConfig;
      rootDir: string;
    },
    maxLines = 500,
  ) {
    this.maxLines = maxLines;
    this.logDir = resolve(rootDir, outputConfig.logDir);
    mkdirSync(this.logDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    this.filePath = join(this.logDir, `activity-${date}.log`);
    this.containerFilePath = join(this.logDir, `container-${date}.log`);
  }

  /** Subscribe to changes (called after every log entry). */
  onLogChange(callback: () => void): void {
    this.onChange = callback;
  }

  /** Build a Logger facade that routes all messages through this ActivityLog. */
  createLogger(): Logger {
    return {
      info: (msg) => this.push(LogLevel.Info, msg),
      warn: (msg) => this.push(LogLevel.Warn, msg),
      error: (msg) => this.push(LogLevel.Error, msg),
    };
  }

  /** Build a Logger facade that tags entries with `source: "container"`. */
  createContainerLogger(): Logger {
    return {
      info: (msg) => this.push(LogLevel.Info, msg, LogSource.Container),
      warn: (msg) => this.push(LogLevel.Warn, msg, LogSource.Container),
      error: (msg) => this.push(LogLevel.Error, msg, LogSource.Container),
    };
  }

  /**
   * Start streaming container log entries to a per-task file (human-readable format).
   *
   * Only container-source entries are written; orchestrator polling noise is excluded.
   *
   * @returns Absolute path to the task log file.
   */
  startTaskLog(issueKey: string): string {
    const issueDir = join(this.logDir, issueKey);
    mkdirSync(issueDir, { recursive: true });
    this.taskFilePath = join(issueDir, `${issueKey}-${Date.now()}.log`);
    return this.taskFilePath;
  }

  /** Stop streaming to the per-task file. */
  endTaskLog(): void {
    this.taskFilePath = null;
  }

  /** Push a log entry to the ring buffer, persist to daily log, and stream to per-task file. */
  push(level: LogEntry["level"], message: string, source: LogEntry["source"] = LogSource.Orchestrator): void {
    const entry: LogEntry = { timestamp: Date.now(), level, message, source };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxLines) {
      this.buffer.shift();
    }
    const targetFile = source === LogSource.Container ? this.containerFilePath : this.filePath;
    try {
      appendFileSync(targetFile, formatLine(entry) + "\n");
    } catch {
      // ignore
    }
    if (this.taskFilePath && source === LogSource.Container) {
      try {
        appendFileSync(this.taskFilePath, formatLine(entry) + "\n");
      } catch {
        // ignore
      }
    }
    this.onChange?.();
  }

  /** Read-only snapshot of the ring buffer. */
  get entries(): readonly LogEntry[] {
    return [...this.buffer];
  }

  /** Path to the current session's activity JSONL file. */
  get activityFilePath(): string {
    return this.filePath;
  }
}
