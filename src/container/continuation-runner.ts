import type { ContainerExecResult } from "./types.js";
import type { WorkItem } from "../datasource/types.js";
import type { Logger } from "../logger.js";
import { parseResultBlock } from "./result-parser.js";
import { ICliExecutor } from "./cli-executor-factory.js";

/** Accumulated output from the initial run plus any continuation attempts. */
export interface ContinuationResult {
  /** The last CLI invocation's raw result (exit code, timeout flag). */
  lastResult: ContainerExecResult;
  /** Combined stdout across all invocations. */
  combinedStdout: string;
  /** Combined stderr across all invocations. */
  combinedStderr: string;
}

/** Public contract for the continuation runner. */
export interface IContinuationRunner {
  /**
   * Run the executor and retry via `--continue` if the result block is missing.
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
 * When the agent's session ends without producing the required
 * `===RALPH_RESULT_START===` block, re-invokes the CLI with `--continue`
 * and exponential backoff until the block appears or attempts are exhausted.
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
    let combinedStdout = result.stdout;
    let combinedStderr = result.stderr;

    if (maxContinuations > 0) {
      let attempt = 0;
      while (attempt < maxContinuations) {
        if (result.timedOut) {
          this.logger.warn("CLI session timed out — skipping continuation");
          break;
        }

        const { prUrl, agentStatus } = parseResultBlock(combinedStdout);
        if (prUrl !== undefined || agentStatus !== undefined) {
          this.logger.info(
            `Result block found after ${attempt} continuation(s)` +
            (prUrl ? ` — PR: ${prUrl}` : "") +
            (agentStatus ? ` — status: ${agentStatus}` : ""),
          );
          break;
        }

        attempt++;
        const backoffMs = ContinuationRunner.continuationBackoff(attempt);
        this.logger.warn(
          `No result block found — continuation ${attempt}/${maxContinuations} (backoff: ${backoffMs}ms)`,
        );
        await ContinuationRunner.sleep(backoffMs);

        const continuationPrompt =
          `[RALPH CONTINUATION ${attempt}/${maxContinuations}]\n\n` +
          `Your previous session ended without producing the required ===RALPH_RESULT_START=== block.\n` +
          `Continue working on the task. When complete, output the result block as instructed.\n\n` +
          `Original issue: ${workItem.id} — ${workItem.title}`;

        result = await executor.continueSession(continuationPrompt);
        combinedStdout += "\n" + result.stdout;
        combinedStderr += "\n" + result.stderr;
      }

      if (attempt >= maxContinuations) {
        const { prUrl, agentStatus } = parseResultBlock(combinedStdout);
        if (prUrl === undefined && agentStatus === undefined) {
          this.logger.warn(
            `All ${maxContinuations} continuation(s) exhausted without a result block`,
          );
        }
      }
    }

    return { lastResult: result, combinedStdout, combinedStderr };
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
