import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IOutputConfig } from "../config/types";
import { FailureReason, TaskStatus, type RalphResult } from "../container/types";

/** Failure categories for automated triage of non-successful runs. */
export enum FailureCategory {
  /** The run could not work: a startup crash, an authentication failure or a blocked or failing API. */
  Infra = "infra",
  /** The agent worked and failed at the task. */
  Task = "task",
  /** The process was killed for exceeding its timeout. */
  Timeout = "timeout",
  /** The agent ended without the result block its stage requires. */
  Contract = "contract",
  /** No signal tells the cause. */
  Unknown = "unknown",
}

/** Failure reasons whose category needs no heuristics. */
const CATEGORY_OF_REASON: ReadonlyMap<FailureReason, FailureCategory> = new Map([
  [FailureReason.AuthFailed, FailureCategory.Infra],
  [FailureReason.CliError, FailureCategory.Infra],
  [FailureReason.MaxTurns, FailureCategory.Task],
  [FailureReason.MissingResultBlock, FailureCategory.Contract],
]);

/**
 * Classify a failed execution into a failure category: from its failure reason when that decides the
 * category, else by heuristics.
 *
 * - **infra**: CLI exited non-zero very quickly (<120s) with no stdout/stderr —
 *   suggests a startup crash, auth failure, or blocked API endpoint.
 * - **timeout**: The process was killed due to exceeding the configured timeout.
 * - **task**: The CLI ran long enough to suggest the agent was working, but
 *   exited with an error — likely a task-level failure.
 * - **contract**: The agent ended without the result block its stage requires.
 * - **unknown**: Cannot determine category from available signals.
 */
export function classifyFailure(result: RalphResult): FailureCategory {
  const byReason = result.failureReason && CATEGORY_OF_REASON.get(result.failureReason);
  if (byReason) return byReason;

  if (result.status === TaskStatus.Error && result.durationMs > 0 && result.stdout?.includes("timed out")) {
    return FailureCategory.Timeout;
  }

  const hasOutput = (result.stdout?.length ?? 0) > 100 || (result.stderr?.length ?? 0) > 100;
  if (result.exitCode !== 0 && result.durationMs < 120_000 && !hasOutput) {
    return FailureCategory.Infra;
  }

  if (result.exitCode !== 0 && hasOutput) {
    return FailureCategory.Task;
  }

  if (result.exitCode !== 0) {
    return result.durationMs < 120_000 ? FailureCategory.Infra : FailureCategory.Unknown;
  }

  return FailureCategory.Unknown;
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
    const failed = result.status !== TaskStatus.Completed;
    const stderrSnippet = result.stderr ? result.stderr.slice(0, 5000) : undefined;
    const agentTextSnippet = failed && result.agentText ? result.agentText.slice(0, 5000) : undefined;
    const failureCategory = failed ? classifyFailure(result) : undefined;
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
          ...(result.failureReason && { failureReason: result.failureReason }),
          ...(result.cliError && { cliError: result.cliError }),
          ...(result.sessionIds && { sessionIds: result.sessionIds }),
          ...(result.hooklessSessions && { hooklessSessions: result.hooklessSessions }),
          ...(stderrSnippet && { stderr: stderrSnippet }),
          ...(agentTextSnippet && { agentText: agentTextSnippet }),
          activityLogPath,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    return path;
  }
}
