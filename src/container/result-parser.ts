import { FailureReason, TaskStatus } from "./types";
import type { CliError } from "../cli/output-decoder";
import type { Logger } from "../logger";

/** Valid agent-reported statuses accepted by {@link resolveStatus}. */
const RECOGNIZED_STATUSES: ReadonlySet<string> = new Set([
  TaskStatus.Completed,
  TaskStatus.Partial,
  TaskStatus.Blocked,
]);

/**
 * Parse the structured `===RALPH_RESULT_START===` block from CLI stdout.
 *
 * Extracts PR URL and agent-reported status. Falls back to a loose regex for
 * the PR URL if the structured block is missing.
 */
export function parseResultBlock(stdout: string): {
  prUrl: string | undefined;
  agentStatus: string | undefined;
} {
  const resultBlock = stdout.match(/===RALPH_RESULT_START===([\s\S]*?)===RALPH_RESULT_END===/);

  let prUrl: string | undefined;
  let agentStatus: string | undefined;

  if (resultBlock) {
    const prMatch = resultBlock[1].match(/PR_URL:\s*(\S+)/i);
    if (prMatch && prMatch[1] !== "none") {
      prUrl = prMatch[1];
    }
    const statusMatch = resultBlock[1].match(/STATUS:\s*(\S+)/i);
    if (statusMatch) {
      agentStatus = statusMatch[1];
    }
  } else {
    // Fallback: look for a loose PR URL
    const prUrlMatch = stdout.match(/Pull Request:\s*(https?:\/\/\S+)/i);
    prUrl = prUrlMatch?.[1];
  }

  return { prUrl, agentStatus };
}

/**
 * Whether `text` holds a result block whose STATUS is one {@link resolveStatus} accepts. The Claude Code
 * result gate (`shared/hooks/claude/result-gate.sh`) allows a stop on the same condition.
 */
export function hasResultBlock(text: string): boolean {
  const { agentStatus } = parseResultBlock(text);
  return agentStatus !== undefined && RECOGNIZED_STATUSES.has(agentStatus);
}

/** CLI error subtypes with a failure reason of their own; every other subtype is a {@link FailureReason.CliError}. */
const CLI_ERROR_REASONS: ReadonlyMap<string, FailureReason> = new Map([
  ["authentication_failed", FailureReason.AuthFailed],
  ["error_max_turns", FailureReason.MaxTurns],
  ["error_during_execution", FailureReason.ExecutionError],
]);

/** What one run's status is resolved from. */
export interface StatusInput {
  readonly exitCode: number;
  readonly timedOut: boolean;
  /** The STATUS of the agent's result block, when it printed one. */
  readonly agentStatus: string | undefined;
  /** Whether the stage must end with a result block whose STATUS the orchestrator accepts. */
  readonly requireResultBlock: boolean;
  /** Terminal error the CLI reported for its session. */
  readonly cliError?: CliError;
}

/** A run's status and, for {@link TaskStatus.Error}, why it failed. */
export interface ResolvedStatus {
  readonly status: TaskStatus;
  readonly failureReason?: FailureReason;
}

/**
 * Resolves a run's status. The first rule that applies wins:
 *
 * 1. the agent's result block reports `completed`, `partial` or `blocked`: that status;
 * 2. the CLI timed out: {@link TaskStatus.Partial};
 * 3. the CLI reported a terminal error: {@link TaskStatus.Error}, with the reason its subtype maps to;
 * 4. the CLI exited non-zero: {@link TaskStatus.Error}, {@link FailureReason.ExitCode};
 * 5. the stage requires a result block: {@link TaskStatus.Error}, {@link FailureReason.MissingResultBlock};
 * 6. otherwise {@link TaskStatus.Completed}.
 *
 * A crashed CLI also leaves no result block, so its own failure (rules 3 and 4) is reported before the
 * missing block. Warns when the agent reports a STATUS outside rule 1, typically a typo such as
 * `STATUS: success`, and when a required result block is missing.
 */
export function resolveStatus(input: StatusInput, logger?: Logger): ResolvedStatus {
  const { agentStatus, cliError } = input;
  if (agentStatus !== undefined) {
    if (RECOGNIZED_STATUSES.has(agentStatus)) {
      return { status: agentStatus as TaskStatus };
    }
    logger?.warn(
      `Agent reported unrecognized status "${agentStatus}" — the result block does not count. ` +
        `Valid values: ${[...RECOGNIZED_STATUSES].join(", ")}`,
    );
  }

  if (input.timedOut) return { status: TaskStatus.Partial };
  if (cliError) {
    return {
      status: TaskStatus.Error,
      failureReason: CLI_ERROR_REASONS.get(cliError.subtype) ?? FailureReason.CliError,
    };
  }
  if (input.exitCode !== 0) return { status: TaskStatus.Error, failureReason: FailureReason.ExitCode };
  if (input.requireResultBlock) {
    logger?.warn("The agent ended without a result block its stage requires");
    return { status: TaskStatus.Error, failureReason: FailureReason.MissingResultBlock };
  }
  return { status: TaskStatus.Completed };
}
