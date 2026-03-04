import type { WorkItem } from "../datasource/types.js";
import type { RalphResult } from "./types.js";
import type { Logger } from "../logger.js";
import type { PromptBuilder } from "../prompt/prompt-builder.js";
import type { IssueContext } from "../prompt/prompt.js";
import { parseResultBlock, resolveStatus } from "./result-parser.js";
import type { ICliExecutor } from "./cli-executor-factory.js";
import type { IContinuationRunner } from "./continuation-runner.js";

/** Options controlling a single agent session execution. */
export interface AgentSessionOptions {
  /** Maximum continuation retries when the result block is missing. */
  maxContinuations: number;
  /** Whether the continuation feature is globally enabled. */
  enableContinuation: boolean;
}

/** Public contract for running a single agent CLI session. */
export interface IAgentSessionRunner {
  /**
   * Execute a single agent session: build prompt, run CLI (with continuation
   * retries), parse the result block, and return an enriched {@link RalphResult}.
   *
   * @param executor  CLI executor to invoke (container-bound or local).
   * @param workItem  Work item being processed — used for prompt building and continuation prompts.
   * @param context   Pre-fetched issue context (comments, revision handoff).
   * @param opts      Continuation and timeout options.
   */
  run(
    executor: ICliExecutor,
    workItem: WorkItem,
    context: IssueContext | undefined,
    opts: AgentSessionOptions,
  ): Promise<RalphResult>;
}

/**
 * Runs a single agent CLI session end-to-end.
 *
 * Extracted from {@link ContainerManager} so it can be reused with any
 * {@link ICliExecutor} — container-bound or local.
 *
 * Responsibilities:
 * 1. Build the prompt via {@link PromptBuilder}
 * 2. Delegate to {@link IContinuationRunner} for the retry loop
 * 3. Parse the `===RALPH_RESULT_START===` block from combined stdout
 * 4. Resolve the final task status
 * 5. Assemble and return the {@link RalphResult}
 */
export class AgentSessionRunner implements IAgentSessionRunner {
  private readonly continuationRunner: IContinuationRunner;
  private readonly promptBuilder: PromptBuilder;
  private readonly logger: Logger;

  constructor({ continuationRunner, promptBuilder, logger }: {
    continuationRunner: IContinuationRunner;
    promptBuilder: PromptBuilder;
    logger: Logger;
  }) {
    this.continuationRunner = continuationRunner;
    this.promptBuilder = promptBuilder;
    this.logger = logger;
  }

  async run(
    executor: ICliExecutor,
    workItem: WorkItem,
    context: IssueContext | undefined,
    opts: AgentSessionOptions,
  ): Promise<RalphResult> {
    const { text: prompt } = this.promptBuilder.build(workItem, context);

    const startTime = Date.now();

    const { lastResult, combinedStdout, combinedStderr } =
      await this.continuationRunner.run(
        executor,
        prompt,
        workItem,
        opts.enableContinuation ? opts.maxContinuations : 0,
      );

    const durationMs = Date.now() - startTime;

    const { prUrl, agentStatus } = parseResultBlock(combinedStdout);
    const status = resolveStatus(lastResult.exitCode, lastResult.timedOut, agentStatus, this.logger);

    return {
      taskId: workItem.id,
      status,
      durationMs,
      exitCode: lastResult.exitCode,
      stdout: combinedStdout,
      stderr: combinedStderr,
      collectedLogs: {},
      prUrl,
    };
  }
}
