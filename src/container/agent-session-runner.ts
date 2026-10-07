import type { WorkItem } from "../datasource/types";
import type { RalphResult } from "./types";
import type { Logger } from "../logger";
import type { PromptBuilder } from "../prompt/prompt-builder";
import type { IssueContext } from "../prompt/prompt";
import { readReportedResult, resolveStatus } from "./result-parser";
import type { ICliExecutor } from "./cli-executor-factory";
import type { IContinuationRunner } from "./continuation-runner";

/** Options controlling a single agent session execution. */
export interface AgentSessionOptions {
  /** Maximum continuation retries when the result is missing. */
  maxContinuations: number;
  /** Whether the continuation feature is globally enabled. */
  enableContinuation: boolean;
  /** The stage's `requireResultBlock`: a run that ends without a result fails, and only such a stage is continued. */
  requireResultBlock: boolean;
}

/** Public contract for running a single agent CLI session. */
export interface IAgentSessionRunner {
  /**
   * Execute a single agent session: build prompt, run CLI (with continuation
   * retries), read the agent's result, and return an enriched {@link RalphResult}.
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
 * Runs one agent CLI session, container-bound or local, resuming it while it lacks the result its stage
 * requires, and returns a {@link RalphResult} with the status {@link resolveStatus} gives it, the failure
 * reason of a failed run and the session ids of every invocation.
 */
export class AgentSessionRunner implements IAgentSessionRunner {
  private readonly continuationRunner: IContinuationRunner;
  private readonly promptBuilder: PromptBuilder;
  private readonly logger: Logger;

  constructor({
    continuationRunner,
    promptBuilder,
    logger,
  }: {
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
    const { requireResultBlock } = opts;

    const startTime = Date.now();

    const { lastResult, combinedAgentText, resultText, combinedStdout, combinedStderr, sessionIds } =
      await this.continuationRunner.run(
        executor,
        prompt,
        workItem,
        opts.enableContinuation && requireResultBlock ? opts.maxContinuations : 0,
      );

    const durationMs = Date.now() - startTime;

    const { prUrl, agentStatus } = readReportedResult(
      { agentText: resultText, structuredOutput: lastResult.structuredOutput },
      this.logger,
    );
    const { status, failureReason } = resolveStatus(
      {
        exitCode: lastResult.exitCode,
        timedOut: lastResult.timedOut,
        agentStatus,
        requireResultBlock,
        cliError: lastResult.cliError,
      },
      this.logger,
    );

    return {
      taskId: workItem.id,
      status,
      durationMs,
      exitCode: lastResult.exitCode,
      stdout: combinedStdout,
      stderr: combinedStderr,
      agentText: combinedAgentText,
      collectedLogs: {},
      prUrl,
      ...(failureReason === undefined ? {} : { failureReason }),
      ...(lastResult.cliError === undefined ? {} : { cliError: lastResult.cliError }),
      ...(sessionIds.length === 0 ? {} : { sessionIds: [...sessionIds] }),
    };
  }
}
