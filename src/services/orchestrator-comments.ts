/**
 * Centralized JIRA comment templates for all orchestrator-generated comments.
 *
 * All comments are prefixed with `[Ralph-Orchestrator]` for easy identification
 * in the JIRA comment stream.
 */

import { TransitionPhase } from "../orchestrator-types.js";

const PREFIX = "[Ralph-Orchestrator]";

export const OrchestratorComments = {
  /** Posted when a trigger comment is discovered and an operation is queued. */
  ack(displayName: string): string {
    return `${PREFIX} 🤖 Got it! Queueing ${displayName} for this issue...`;
  },

  /** Posted when the agent starts working on an issue. */
  start(displayName: string, profileId: string): string {
    return `${PREFIX} 🤖 ${displayName} is starting work on this issue.\nProfile: ${profileId}`;
  },

  /** Posted when a crashed operation is recovered on startup. */
  crashRecovery(displayName: string): string {
    return `${PREFIX} 🤖 ${displayName} crashed during the previous session. Re-trigger to retry.`;
  },

  /** Posted when the issue's status changed between planning and execution. */
  staleStatus(displayName: string, currentStatus: string): string {
    return `${PREFIX} 🤖 ${displayName} can't work on this issue anymore — status changed to "${currentStatus}".`;
  },

  /** Posted when a JIRA transition fails (e.g. no transition to the target status available). */
  transitionFailed(phase: TransitionPhase, targetStatus: string, error: string): string {
    return `${PREFIX} ⚠️ ${phase} transition to "${targetStatus}" failed: ${error}`;
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
