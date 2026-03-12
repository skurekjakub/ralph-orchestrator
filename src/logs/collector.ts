import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IOutputConfig } from "../config/types.js";
import type { RalphResult } from "../container/types.js";

/** Failure categories for automated triage of non-successful runs. */
export type FailureCategory = "infra" | "task" | "timeout" | "unknown";

/**
 * Classify a failed execution into a failure category using heuristics.
 *
 * - **infra**: CLI exited non-zero very quickly (<120s) with no stdout/stderr —
 *   suggests a startup crash, auth failure, or blocked API endpoint.
 * - **timeout**: The process was killed due to exceeding the configured timeout.
 * - **task**: The CLI ran long enough to suggest the agent was working, but
 *   exited with an error — likely a task-level failure.
 * - **unknown**: Cannot determine category from available signals.
 */
export function classifyFailure(result: RalphResult): FailureCategory {
  // Timeout is explicit
  if (result.status === "error" && result.durationMs > 0 && result.stdout?.includes("timed out")) {
    return "timeout";
  }

  // Very short run with no output → infrastructure crash
  const hasOutput = (result.stdout?.length ?? 0) > 100 || (result.stderr?.length ?? 0) > 100;
  if (result.exitCode !== 0 && result.durationMs < 120_000 && !hasOutput) {
    return "infra";
  }

  // Non-zero exit with meaningful output → task failure
  if (result.exitCode !== 0 && hasOutput) {
    return "task";
  }

  // Non-zero exit, some duration, but not classifiable
  if (result.exitCode !== 0) {
    return result.durationMs < 120_000 ? "infra" : "unknown";
  }

  return "unknown";
}

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
    const failureCategory = result.status !== "completed"
      ? classifyFailure(result)
      : undefined;
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
          ...(failureCategory && { failureCategory }),
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
