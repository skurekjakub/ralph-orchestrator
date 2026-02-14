import type { RalphResult } from "./types.js";

/**
 * Parse the structured `===RALPH_RESULT_START===` block from copilot stdout.
 *
 * Extracts PR URL and agent-reported status. Falls back to a loose regex for
 * the PR URL if the structured block is missing.
 */
export function parseResultBlock(stdout: string): {
  prUrl: string | undefined;
  agentStatus: string | undefined;
} {
  const resultBlock = stdout.match(
    /===RALPH_RESULT_START===([\s\S]*?)===RALPH_RESULT_END===/
  );

  let prUrl: string | undefined;
  let agentStatus: string | undefined;

  if (resultBlock) {
    const prMatch = resultBlock[1].match(/PR_URL:\s*(\S+)/);
    if (prMatch && prMatch[1] !== "none") {
      prUrl = prMatch[1];
    }
    const statusMatch = resultBlock[1].match(/STATUS:\s*(\S+)/);
    if (statusMatch) {
      agentStatus = statusMatch[1];
    }
  } else {
    // Fallback: look for a loose PR URL
    const prUrlMatch = stdout.match(
      /Pull Request:\s*(https?:\/\/\S+)/i
    );
    prUrl = prUrlMatch?.[1];
  }

  return { prUrl, agentStatus };
}

/**
 * Determine the final {@link RalphResult} status from exit code, timeout flag,
 * and agent-reported status.
 *
 * Priority: agent-reported status > timeout > exit code
 */
export function resolveStatus(
  exitCode: number,
  timedOut: boolean,
  agentStatus: string | undefined
): RalphResult["status"] {
  // Prefer agent-reported status when it's a recognized value
  if (
    agentStatus === "completed" ||
    agentStatus === "partial" ||
    agentStatus === "blocked"
  ) {
    return agentStatus as RalphResult["status"];
  }

  if (timedOut) return "partial";
  if (exitCode === 0) return "completed";
  return "error";
}
