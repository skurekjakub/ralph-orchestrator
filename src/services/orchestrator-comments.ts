/**
 * Centralized JIRA comment templates for all orchestrator-generated comments.
 *
 * All comments are prefixed with `[Ralph-Orchestrator]` for easy identification
 * in the JIRA comment stream.
 */

const PREFIX = "[Ralph-Orchestrator]";

export const OrchestratorComments = {
  /** Posted when a trigger comment is discovered and an operation is queued. */
  ack(agentName: string): string {
    return `${PREFIX} 🤖 Got it! Queueing ${agentName} for this issue...`;
  },

  /** Posted when the agent starts working on an issue. */
  start(agentName: string, profileId: string): string {
    return `${PREFIX} 🤖 ${agentName} is starting work on this issue.\nProfile: ${profileId}`;
  },

  /** Posted when a crashed operation is recovered on startup. */
  crashRecovery(agentName: string): string {
    return `${PREFIX} 🤖 ${agentName} crashed during the previous session. Re-trigger to retry.`;
  },

  /** Posted when the issue's status changed between planning and execution. */
  staleStatus(agentName: string, currentStatus: string): string {
    return `${PREFIX} 🤖 ${agentName} can't work on this issue anymore — status changed to "${currentStatus}".`;
  },

  /** Posted when the agent encounters an unrecoverable error. */
  error(error: string): string {
    return [
      `${PREFIX} 🤖 Ralph encountered an error and could not complete this task.`,
      ``,
      `Error: ${error}`,
      ``,
      `Re-trigger via a new comment to retry.`,
    ].join("\n");
  },
} as const;
