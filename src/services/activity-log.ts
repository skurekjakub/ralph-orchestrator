import type { LogEntry } from "../orchestrator-types.js";
import type { Logger } from "../logger.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Manages the in-memory log ring buffer and persistent activity log on disk.
 *
 * Every log entry is:
 * 1. Added to the ring buffer (capped at {@link maxLines})
 * 2. Appended to `output/logs/activity-YYYY-MM-DD.jsonl` (never truncated)
 * 3. Emitted via the optional `onChange` callback (for Ink dashboard re-renders)
 */
export class ActivityLog {
  private buffer: LogEntry[] = [];
  private filePath: string;
  private containerFilePath: string;
  private onChange: (() => void) | null = null;

  /**
   * @param logDir Directory for activity JSONL files.
   * @param maxLines Ring buffer size (default 50).
   */
  constructor(
    logDir: string,
    private maxLines = 50
  ) {
    const resolvedDir = resolve(process.cwd(), logDir);
    mkdirSync(resolvedDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    this.filePath = join(resolvedDir, `activity-${date}.jsonl`);
    this.containerFilePath = join(resolvedDir, `container-${date}.jsonl`);
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

  /** Push a log entry to the ring buffer and persist to disk. */
  push(level: LogEntry["level"], message: string, source: LogEntry["source"] = "orchestrator"): void {
    const entry: LogEntry = { timestamp: Date.now(), level, message, source };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxLines) {
      this.buffer.shift();
    }
    const targetFile = source === "container" ? this.containerFilePath : this.filePath;
    try {
      appendFileSync(targetFile, JSON.stringify(entry) + "\n");
    } catch {
      // ignore
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
