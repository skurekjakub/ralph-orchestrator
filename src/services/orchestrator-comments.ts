/**
 * Centralized comment templates for all orchestrator-generated comments.
 *
 * All comments are prefixed with `[Ralph-Orchestrator]` for easy identification
 * in the work item comment stream.
 */

import { TransitionPhase } from "../orchestrator-types.js";

const PREFIX = "[Ralph-Orchestrator]";

export const OrchestratorComments = {
  /** Posted when a trigger comment is discovered and an operation is queued. */
  ack(displayName: string, triggerParams?: string[]): string {
    const base = `${PREFIX} 🤖 Got it! Queueing ${displayName} for this issue...`;
    if (triggerParams && triggerParams.length > 0) {
      return `${base}\nParams: ${triggerParams.join(", ")}`;
    }
    return base;
  },

  /** Posted when the agent starts working on an issue. */
  start(displayName: string, profileId: string, triggerParams?: Record<string, string>): string {
    let msg = `${PREFIX} 🤖 ${displayName} is starting work on this issue.\nProfile: ${profileId}`;
    if (triggerParams?.skip_hooks) {
      msg += `\n\n⚠️ Post-task hooks skipped (skip_hooks). Run manually:\n\`npx tsx scripts/run-hooks.ts <outputDir>\``;
    }
    return msg;
  },

  /** Posted when a crashed operation is recovered on startup. */
  crashRecovery(displayName: string): string {
    return `${PREFIX} 🤖 ${displayName} crashed during the previous session. Re-trigger to retry.`;
  },

  /** Posted when the issue's status changed between planning and execution. */
  staleStatus(displayName: string, currentStatus: string): string {
    return `${PREFIX} 🤖 ${displayName} can't work on this issue anymore — status changed to "${currentStatus}".`;
  },

  /** Posted when a status transition fails (e.g. no transition to the target status available). */
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

  /** Posted when a trigger comment comes from a user not in the allowedUsers list. */
  userNotAllowed(displayName: string, userName: string): string {
    return `${PREFIX} 🚫 ${userName} is not authorized to invoke ${displayName}. Contact an admin to request access.`;
  },
} as const;
