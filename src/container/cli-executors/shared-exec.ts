import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ExecaError, type ResultPromise } from "execa";
import type { ICliOutputDecoder } from "../../cli/output-decoder";
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

/** One agent CLI invocation inside the running `app` container. */
export interface CliCommand {
  readonly compose: IComposeClient;
  /** `docker compose exec` arguments: exec options, service, command and its arguments. */
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly logger: Logger;
  /** Prefix of the CLI's log lines (`claude`, `copilot`). */
  readonly tag: string;
  readonly tracker: ProcessTracker;
  /** Fresh decoder for this process's stdout. */
  readonly decoder: ICliOutputDecoder;
  /** Host file streamed to the CLI's stdin. */
  readonly inputFile?: string;
}

/**
 * Writes the prompt to `<repoPath>/.ralph/prompt.txt`, which the target-repo bind mount shows in the
 * container as `/workspace/.ralph/prompt.txt`.
 *
 * @returns The host path of the prompt file.
 */
export function writePromptFile(repoPath: string, prompt: string): string {
  const dir = join(repoPath, ".ralph");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "prompt.txt");
  writeFileSync(path, prompt, "utf-8");
  return path;
}

/**
 * Execute a CLI command in the `app` container with stream capture, output decoding and error handling.
 *
 * When the agent's `===RALPH_RESULT_END===` marker appears in its decoded text but the CLI process doesn't
 * exit within {@link RESULT_GRACE_MS}, the process is terminated with SIGTERM. This prevents the CLI from
 * idling indefinitely after printing a valid result block.
 *
 * A non-zero exit or a timeout resolves to a result with the exit code and whatever the CLI printed and
 * reported before it ended.
 *
 * @throws Error when the process cannot be spawned for a reason other than its own exit.
 */
export async function executeCliCommand(command: CliCommand): Promise<ContainerExecResult> {
  const { compose, args, timeoutMs, logger, tag, tracker, decoder, inputFile } = command;
  let capture: StreamCapture | undefined;
  try {
    tracker.activeProcess = compose.execWithTimeout([...args], timeoutMs, { inputFile });
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
        logger.warn(
          `${tag}: CLI exited with code ${err.exitCode ?? 1} — stderr: ${stderr.length > 2000 ? stderr.slice(0, 2000) + "…" : stderr}`,
        );
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
