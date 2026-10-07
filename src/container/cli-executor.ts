import type { ContainerExecResult } from "./types";

/**
 * Runs one pipeline stage's agent CLI.
 *
 * Each implementation translates a prompt into its CLI's invocation, handles streaming, timeout and the
 * process lifecycle.
 */
export interface ICliExecutor {
  /** Execute the agent CLI with the given prompt. */
  run(prompt: string): Promise<ContainerExecResult>;
  /** Resume the previous CLI session with a continuation prompt. */
  continueSession(prompt: string): Promise<ContainerExecResult>;
  /** Kill the active process if running (for graceful shutdown). */
  killActive(): void;
}
