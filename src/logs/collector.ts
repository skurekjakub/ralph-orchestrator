import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IOutputConfig } from "../config/types.js";
import type { RalphResult } from "../container/types.js";

/** Public contract for execution summary persistence. */
export interface ILogCollector {
  /**
   * Save a JSON execution summary for a completed task.
   *
   * @param result The Ralph execution result to persist.
   * @param activityLogPath Optional path to the session's activity JSONL file.
   * @param taskId Optional task identifier used as the folder and filename prefix. Defaults to `result.taskId`.
   * @returns Absolute path to the saved summary file.
   */
  saveExecutionSummary(result: RalphResult, activityLogPath?: string, taskId?: string): string;
}

/**
 * Saves execution summaries and manages the output directory structure.
 *
 * Creates the log and handoff directories on instantiation.
 * Each execution produces a `<key>-<timestamp>-summary.json` file.
 */
export class LogCollector implements ILogCollector {
  private config: IOutputConfig;

  constructor({ outputConfig }: { outputConfig: IOutputConfig }) {
    this.config = outputConfig;
    mkdirSync(this.config.logDir, { recursive: true });
    mkdirSync(this.config.handoffDir, { recursive: true });
  }

  /**
   * Save a JSON execution summary for a completed task.
   *
   * @param result The Ralph execution result to persist.
   * @param activityLogPath Optional path to the session’s activity JSONL file.
   * @param taskId Optional task identifier used as the folder and filename prefix. Defaults to `result.taskId`.
   * @returns Absolute path to the saved summary file.
   */
  saveExecutionSummary(result: RalphResult, activityLogPath?: string, taskId?: string): string {
    const prefix = taskId ?? result.taskId;
    const issueDir = join(this.config.logDir, prefix);
    mkdirSync(issueDir, { recursive: true });
    const filename = `${prefix}-${Date.now()}-summary.json`;
    const path = join(issueDir, filename);
    const stderrSnippet = result.stderr ? result.stderr.slice(0, 5000) : undefined;
    const stdoutSnippet = result.status !== "completed" && result.stdout ? result.stdout.slice(0, 5000) : undefined;
    writeFileSync(
      path,
      JSON.stringify(
        {
          taskId: result.taskId,
          status: result.status,
          durationMs: result.durationMs,
          exitCode: result.exitCode,
          prUrl: result.prUrl,
          collectedLogs: result.collectedLogs,
          ...(stderrSnippet && { stderr: stderrSnippet }),
          ...(stdoutSnippet && { stdout: stdoutSnippet }),
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
