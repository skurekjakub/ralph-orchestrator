import type { ContainerExecResult } from "./types";
import type { WorkItem } from "../datasource/types";
import type { Logger } from "../logger";
import { hasAcceptedStatus, hasResultBlock, readReportedResult, type ReportedResult } from "./result-parser";
import type { ICliExecutor } from "./cli-executor";

/** Accumulated output from the initial run plus any continuation attempts. */
export interface ContinuationResult {
  /** The last CLI invocation's raw result (exit code, timeout flag, structured output). */
  lastResult: ContainerExecResult;
  /** Combined agent text across all invocations. */
  combinedAgentText: string;
  /**
   * The text a result block is parsed from: the last invocation's agent text when it holds a block whose
   * STATUS the orchestrator accepts, else the combined agent text. Only the first block of a text counts,
   * so an earlier invalid block must not hide the one a continuation printed.
   */
  resultText: string;
  /** Combined stdout across all invocations. */
  combinedStdout: string;
  /** Combined stderr across all invocations. */
  combinedStderr: string;
  /** The distinct session ids the invocations reported, in order; an invocation that reports none adds none. */
  sessionIds: readonly string[];
}

/** Public contract for the continuation runner. */
export interface IContinuationRunner {
  /**
   * Run the executor and resume its session while the agent has reported no result whose STATUS the
   * orchestrator accepts.
   *
   * @param executor     CLI executor to invoke.
   * @param prompt       Initial prompt for the first run.
   * @param workItem        Work item (used in continuation prompt).
   * @param maxContinuations  Maximum retry attempts (0 = no retries).
   * @returns Accumulated output from all invocations.
   */
  run(
    executor: ICliExecutor,
    prompt: string,
    workItem: WorkItem,
    maxContinuations: number,
  ): Promise<ContinuationResult>;
}

/**
 * Handles the continuation retry loop for agent CLI sessions.
 *
 * When the agent's session ends without the result its stage requires, resumes the CLI session
 * (`continueSession`) with exponential backoff until the result arrives or attempts are exhausted.
 */
export class ContinuationRunner implements IContinuationRunner {
  private readonly logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger;
  }

  async run(
    executor: ICliExecutor,
    prompt: string,
    workItem: WorkItem,
    maxContinuations: number,
  ): Promise<ContinuationResult> {
    let result = await executor.run(prompt);
    let combinedAgentText = result.agentText;
    let combinedStdout = result.stdout;
    let combinedStderr = result.stderr;
    const sessionIds: string[] = [];
    const recordSession = ({ sessionId }: ContainerExecResult): void => {
      if (sessionId !== undefined && !sessionIds.includes(sessionId)) sessionIds.push(sessionId);
    };
    recordSession(result);
    const resultText = (): string => (hasResultBlock(result.agentText) ? result.agentText : combinedAgentText);
    const reported = (): ReportedResult =>
      readReportedResult({ agentText: resultText(), structuredOutput: result.structuredOutput });

    if (maxContinuations > 0) {
      let attempt = 0;
      while (attempt < maxContinuations) {
        if (result.timedOut) {
          this.logger.warn("CLI session timed out — skipping continuation");
          break;
        }

        const report = reported();
        if (hasAcceptedStatus(report)) {
          this.logger.info(
            `Result found after ${attempt} continuation(s) — status: ${report.agentStatus}` +
              (report.prUrl ? ` — PR: ${report.prUrl}` : ""),
          );
          break;
        }

        attempt++;
        const backoffMs = ContinuationRunner.continuationBackoff(attempt);
        this.logger.warn(`No result found — continuation ${attempt}/${maxContinuations} (backoff: ${backoffMs}ms)`);
        await ContinuationRunner.sleep(backoffMs);

        const continuationPrompt =
          `[RALPH CONTINUATION ${attempt}/${maxContinuations}]\n\n` +
          `Your previous session ended without the result your instructions require.\n` +
          `Continue working on the task. When it is complete, return your result as your instructions describe.\n\n` +
          `Original issue: ${workItem.id} — ${workItem.title}`;

        result = await executor.continueSession(continuationPrompt);
        recordSession(result);
        combinedAgentText += "\n" + result.agentText;
        combinedStdout += "\n" + result.stdout;
        combinedStderr += "\n" + result.stderr;
      }

      if (attempt >= maxContinuations && !hasAcceptedStatus(reported())) {
        this.logger.warn(`All ${maxContinuations} continuation(s) exhausted without a result`);
      }
    }

    return {
      lastResult: result,
      combinedAgentText,
      resultText: resultText(),
      combinedStdout,
      combinedStderr,
      sessionIds,
    };
  }

  /**
   * Exponential backoff delay for continuation attempts.
   *
   * Base delay of 5s, doubling each attempt, capped at 30s.
   * Attempt 1 → 5s, 2 → 10s, 3 → 20s, 4+ → 30s.
   */
  static continuationBackoff(attempt: number): number {
    const baseMs = 5_000;
    const maxMs = 30_000;
    return Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
  }

  /** @internal Testable sleep helper. */
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
