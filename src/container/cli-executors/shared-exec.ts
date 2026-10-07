import { ExecaError, type ResultPromise } from "execa";
import type { ICliOutputDecoder } from "../../cli/output-decoder";
import type { Logger } from "../../logger";
import type { ContainerExecResult } from "../types";
import { StreamCapture } from "../stream-capture";
import { truncate } from "../../util/text";

/** Mutable reference to the active CLI process, shared between executor and these helpers. */
export interface ProcessTracker {
  activeProcess: ResultPromise | null;
}

/**
 * Grace period (ms) after detecting the result block before forcefully
 * terminating the CLI process. Gives the CLI time to exit on its own.
 */
const RESULT_GRACE_MS = 10_000;

/** One agent CLI invocation, in the `app` container or on the host. */
export interface CliCommand {
  /**
   * Starts the CLI process with its prompt on stdin and its timeout set: `docker compose exec` into the `app`
   * container, or the CLI itself on the host.
   */
  readonly spawn: () => ResultPromise;
  readonly logger: Logger;
  /** Prefix of the CLI's log lines (`claude`, `copilot`). */
  readonly tag: string;
  readonly tracker: ProcessTracker;
  /** Fresh decoder for this process's stdout. */
  readonly decoder: ICliOutputDecoder;
}

/**
 * Run one agent CLI process with stream capture, output decoding and error handling.
 *
 * For a CLI that ends its answer with a result block (`ICliOutputDecoder.answerEndsAtResultBlock`): when the
 * agent's decoded text holds a complete result block with a recognised STATUS but the CLI process doesn't exit
 * within {@link RESULT_GRACE_MS}, the process is terminated with SIGTERM, so the CLI cannot idle indefinitely
 * after printing a valid result block.
 *
 * A non-zero exit, a timeout, or a CLI that never started resolves to a result with the exit code (1 when the
 * process never ran) and whatever the CLI printed and reported before it ended. Execa reports a CLI that cannot
 * start, such as a missing binary (`ENOENT`), as an `ExecaError` like any failed run.
 *
 * @throws Error that is not an `ExecaError`: `spawn` itself throwing, or the output capture failing.
 */
export async function executeCliCommand(command: CliCommand): Promise<ContainerExecResult> {
  const { spawn, logger, tag, tracker, decoder } = command;
  let capture: StreamCapture | undefined;
  try {
    tracker.activeProcess = spawn();
    capture = new StreamCapture(tracker.activeProcess, logger, tag, decoder);

    // Auto-kill the CLI if it idles after printing the result block.
    void capture.resultBlockDetected.then(() => {
      const timer = setTimeout(() => {
        if (tracker.activeProcess) {
          logger.info(`Result block detected but CLI still running after ${RESULT_GRACE_MS}ms — sending SIGTERM`);
          try {
            tracker.activeProcess.kill("SIGTERM");
          } catch {
            // already terminated
          }
        }
      }, RESULT_GRACE_MS);
      timer.unref();
    });

    const result = await tracker.activeProcess;
    tracker.activeProcess = null;

    return {
      exitCode: result.exitCode ?? 0,
      stdout: capture.stdout,
      stderr: capture.stderr,
      timedOut: false,
      ...capture.outcome(),
    };
  } catch (err: unknown) {
    tracker.activeProcess = null;

    if (err instanceof ExecaError) {
      const stderr = capture?.stderr || err.stderr || "";
      if (stderr) {
        logger.warn(`${tag}: CLI exited with code ${err.exitCode ?? 1} — stderr: ${truncate(stderr, 2000)}`);
      } else {
        logger.warn(
          `${tag}: CLI exited with code ${err.exitCode ?? 1} — no stderr captured (message: ${err.shortMessage})`,
        );
      }
      return {
        exitCode: err.exitCode ?? 1,
        stdout: capture?.stdout || err.stdout || "",
        stderr,
        timedOut: err.timedOut ?? false,
        ...(capture ? capture.outcome() : { agentText: "" }),
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
