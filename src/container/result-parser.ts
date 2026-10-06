import { TaskStatus, type RalphResult } from "./types";
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
 * Determine the final {@link RalphResult} status from exit code, timeout flag,
 * and agent-reported status.
 *
 * Priority: agent-reported status > timeout > exit code.
 *
 * Logs a warning when the agent reports an unrecognized status value — this
 * typically indicates a typo in the result block (e.g. `STATUS: success`
 * instead of `STATUS: completed`).
 *
 * @param logger Optional logger for diagnostic warnings.
 */
export function resolveStatus(
  exitCode: number,
  timedOut: boolean,
  agentStatus: string | undefined,
  logger?: Logger,
): RalphResult["status"] {
  if (agentStatus !== undefined) {
    if (RECOGNIZED_STATUSES.has(agentStatus)) {
      return agentStatus as RalphResult["status"];
    }
    logger?.warn(
      `Agent reported unrecognized status "${agentStatus}" — falling back to exit-code resolution. ` +
        `Valid values: ${[...RECOGNIZED_STATUSES].join(", ")}`,
    );
  }

  if (timedOut) return TaskStatus.Partial;
  if (exitCode === 0) return TaskStatus.Completed;
  return TaskStatus.Error;
}
