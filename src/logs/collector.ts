import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "../config.js";
import type { RalphResult } from "../container/types.js";

/**
 * Saves execution summaries and manages the output directory structure.
 *
 * Creates the log and handoff directories on instantiation.
 * Each execution produces a `<key>-<timestamp>-summary.json` file.
 */
export class LogCollector {
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
    const filename = `${result.issueKey}-${Date.now()}-summary.json`;
    const path = join(this.config.logDir, filename);
    writeFileSync(
      path,
      JSON.stringify(
        {
          issueKey: result.issueKey,
          status: result.status,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          prUrl: result.prUrl,
          auditLogPath: result.auditLogPath,
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
