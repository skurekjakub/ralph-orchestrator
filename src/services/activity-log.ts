import type { LogEntry } from "../orchestrator-types.js";
import type { Logger } from "../logger.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** Format a log entry as a human-readable single line: `HH:MM:SS [LEVEL] message` */
function formatLine(entry: LogEntry): string {
  const d = new Date(entry.timestamp);
  const time = d.toLocaleTimeString("en-GB", { hour12: false });
  const tag = entry.level === "info" ? "INFO" : entry.level === "warn" ? "WARN" : "ERR ";
  return `${time} [${tag}] ${entry.message}`;
}

/**
 * Manages the in-memory log ring buffer and persistent activity log on disk.
 *
 * Every log entry is:
 * 1. Added to the ring buffer (capped at {@link maxLines})
 * 2. Appended to `output/logs/activity-YYYY-MM-DD.log` (never truncated)
 * 3. Emitted via the optional `onChange` callback (for Ink dashboard re-renders)
 */
export class ActivityLog {
  private buffer: LogEntry[] = [];
  private filePath: string;
  private containerFilePath: string;
  private taskFilePath: string | null = null;
  private onChange: (() => void) | null = null;
  private logDir: string;

  /**
   * @param logDir Directory for activity JSONL files.
   * @param maxLines Ring buffer size (default 50).
   */
  constructor(
    logDir: string,
    private maxLines = 50
  ) {
    this.logDir = resolve(process.cwd(), logDir);
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
      info: (msg) => this.push("info", msg),
      warn: (msg) => this.push("warn", msg),
      error: (msg) => this.push("error", msg),
    };
  }

  /** Build a Logger facade that tags entries with `source: "container"`. */
  createContainerLogger(): Logger {
    return {
      info: (msg) => this.push("info", msg, "container"),
      warn: (msg) => this.push("warn", msg, "container"),
      error: (msg) => this.push("error", msg, "container"),
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
    this.taskFilePath = join(this.logDir, `${issueKey}-${Date.now()}.log`);
    return this.taskFilePath;
  }

  /** Stop streaming to the per-task file. */
  endTaskLog(): void {
    this.taskFilePath = null;
  }

  /** Push a log entry to the ring buffer, persist to daily log, and stream to per-task file. */
  push(level: LogEntry["level"], message: string, source: LogEntry["source"] = "orchestrator"): void {
    const entry: LogEntry = { timestamp: Date.now(), level, message, source };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxLines) {
      this.buffer.shift();
    }
    const targetFile = source === "container" ? this.containerFilePath : this.filePath;
    try {
      appendFileSync(targetFile, formatLine(entry) + "\n");
    } catch {
      // ignore
    }
    if (this.taskFilePath && source === "container") {
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
