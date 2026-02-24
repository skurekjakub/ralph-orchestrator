import { ExecaError, type ResultPromise } from "execa";
import type { Logger } from "../../logger.js";
import type { IComposeClient } from "../compose-client.js";
import type { ContainerExecResult } from "../types.js";
import { StreamCapture } from "../stream-capture.js";

/** Mutable reference to the active CLI process, shared between executor and these helpers. */
export interface ProcessTracker {
  activeProcess: ResultPromise | null;
}

/**
 * Execute a CLI command in a container with stream capture and error handling.
 * Shared between CopilotExecutor and ClaudeCodeExecutor.
 */
export async function executeCliCommand(
  compose: IComposeClient,
  args: string[],
  timeoutMs: number,
  logger: Logger,
  prefix: string,
  processTracker: ProcessTracker,
): Promise<ContainerExecResult> {
  let capture: StreamCapture | undefined;
  try {
    processTracker.activeProcess = compose.execWithTimeout(args, timeoutMs) as ResultPromise;
    capture = new StreamCapture(processTracker.activeProcess, logger, prefix);
    const result = await processTracker.activeProcess;
    processTracker.activeProcess = null;

    return {
      exitCode: result.exitCode ?? 0,
      stdout: capture.stdout,
      stderr: capture.stderr,
      timedOut: false,
    };
  } catch (err: unknown) {
    processTracker.activeProcess = null;

    if (err instanceof ExecaError) {
      return {
        exitCode: err.exitCode ?? 1,
        stdout: capture?.stdout ?? err.stdout ?? "",
        stderr: capture?.stderr ?? err.stderr ?? "",
        timedOut: err.timedOut ?? false,
      };
    }

    throw err;
  }
}

/**
 * Kill an active CLI process if one is running.
 */
export function killActiveProcess(
  processTracker: ProcessTracker,
): void {
  if (processTracker.activeProcess) {
    try {
      processTracker.activeProcess.kill("SIGTERM");
    } catch {
      // already terminated
    }
    processTracker.activeProcess = null;
  }
}
