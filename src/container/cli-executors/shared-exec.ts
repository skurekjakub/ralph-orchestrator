import { ExecaError, type ResultPromise } from "execa";
import type { Logger } from "../../logger";
import type { IComposeClient } from "../compose-client";
import type { ContainerExecResult } from "../types";
import { StreamCapture } from "../stream-capture";

/** Mutable reference to the active CLI process, shared between executor and these helpers. */
export interface ProcessTracker {
  activeProcess: ResultPromise | null;
}

/**
 * Grace period (ms) after detecting the result block before forcefully
 * terminating the CLI process. Gives the CLI time to exit on its own.
 */
const RESULT_GRACE_MS = 10_000;

/**
 * Execute a CLI command in a container with stream capture and error handling.
 * Shared between CopilotExecutor and ClaudeCodeExecutor.
 *
 * When the agent's `===RALPH_RESULT_END===` marker appears in stdout but the
 * CLI process doesn't exit within {@link RESULT_GRACE_MS}, the process is
 * terminated with SIGTERM. This prevents the CLI from idling indefinitely
 * after printing a valid result block.
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

    // Auto-kill the CLI if it idles after printing the result block.
    capture.resultBlockDetected.then(() => {
      const timer = setTimeout(() => {
        if (processTracker.activeProcess) {
          logger.info(`Result block detected but CLI still running after ${RESULT_GRACE_MS}ms — sending SIGTERM`);
          try {
            processTracker.activeProcess.kill("SIGTERM");
          } catch {
            // already terminated
          }
        }
      }, RESULT_GRACE_MS);
      timer.unref();
    });

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
      const stderr = capture?.stderr || err.stderr || "";
      if (stderr) {
        logger.warn(
          `${prefix}: CLI exited with code ${err.exitCode ?? 1} — stderr: ${stderr.length > 2000 ? stderr.slice(0, 2000) + "…" : stderr}`,
        );
      } else {
        logger.warn(
          `${prefix}: CLI exited with code ${err.exitCode ?? 1} — no stderr captured (message: ${err.shortMessage})`,
        );
      }
      return {
        exitCode: err.exitCode ?? 1,
        stdout: capture?.stdout || err.stdout || "",
        stderr,
        timedOut: err.timedOut ?? false,
      };
    }

    throw err;
  }
}

/**
 * Kill an active CLI process if one is running.
 */
export function killActiveProcess(processTracker: ProcessTracker): void {
  if (processTracker.activeProcess) {
    try {
      processTracker.activeProcess.kill("SIGTERM");
    } catch {
      // already terminated
    }
    processTracker.activeProcess = null;
  }
}
