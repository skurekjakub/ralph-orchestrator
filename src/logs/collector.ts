import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../config.js";
import type { RalphResult } from "../container/types.js";

/** Public contract for execution summary persistence. */
export interface ILogCollector {
  /**
   * Save a JSON execution summary for a completed task.
   *
   * @param result The Ralph execution result to persist.
   * @param activityLogPath Optional path to the session's activity JSONL file.
   * @returns Absolute path to the saved summary file.
   */
  saveExecutionSummary(result: RalphResult, activityLogPath?: string): string;
}

/**
 * Saves execution summaries and manages the output directory structure.
 *
 * Creates the log and handoff directories on instantiation.
 * Each execution produces a `<key>-<timestamp>-summary.json` file.
 */
export class LogCollector implements ILogCollector {
  /** @param config Output directory paths. */
  constructor(private config: AppConfig["output"]) {
    mkdirSync(this.config.logDir, { recursive: true });
    mkdirSync(this.config.handoffDir, { recursive: true });
  }

  /**
   * Save a JSON execution summary for a completed task.
   *
   * @param result The Ralph execution result to persist.
   * @param activityLogPath Optional path to the session’s activity JSONL file.
   * @returns Absolute path to the saved summary file.
   */
  saveExecutionSummary(result: RalphResult, activityLogPath?: string): string {
    const issueDir = join(this.config.logDir, result.issueKey);
    mkdirSync(issueDir, { recursive: true });
    const filename = `${result.issueKey}-${Date.now()}-summary.json`;
    const path = join(issueDir, filename);
    writeFileSync(
      path,
      JSON.stringify(
        {
          issueKey: result.issueKey,
          status: result.status,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          prUrl: result.prUrl,
          collectedLogs: result.collectedLogs,
          activityLogPath,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    return path;
  }
}
