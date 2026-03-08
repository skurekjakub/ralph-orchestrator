import type { ResultPromise } from "execa";
import type { Logger } from "../logger.js";

/** Marker line that signals the end of the agent's result block in stdout. */
const RESULT_END_MARKER = "===RALPH_RESULT_END===";

/**
 * Captures and streams stdout/stderr from a child process.
 *
 * Attaches to a process's stdout/stderr streams, line-buffering each into
 * the provided logger while simultaneously capturing the raw chunks for
 * later retrieval.
 *
 * Also monitors stdout for the `===RALPH_RESULT_END===` marker so callers
 * can react (e.g. terminate an idle CLI) without waiting for the process to
 * exit on its own.
 */
export class StreamCapture {
  readonly stdoutChunks: string[] = [];
  readonly stderrChunks: string[] = [];

  /**
   * Resolves when `===RALPH_RESULT_END===` appears in stdout.
   * Never rejects — stays pending if the marker is never seen.
   */
  readonly resultBlockDetected: Promise<void>;

  private _resolveResultBlock!: () => void;
  private _resultBlockResolved = false;

  /**
   * @param proc Child process to attach to.
   * @param logger Where to stream lines.
   * @param tag Prefix for each line, e.g. `"copilot"` → `[copilot] ...`.
   */
  constructor(proc: ResultPromise, logger: Logger, tag: string) {
    this.resultBlockDetected = new Promise<void>((resolve) => {
      this._resolveResultBlock = resolve;
    });

    let stdoutBuf = "";
    proc.stdout?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      this.stdoutChunks.push(text);
      stdoutBuf += text;
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) logger.info(`[${tag}] ${trimmed}`);
        if (!this._resultBlockResolved && trimmed.includes(RESULT_END_MARKER)) {
          this._resultBlockResolved = true;
          this._resolveResultBlock();
        }
      }
    });

    let stderrBuf = "";
    proc.stderr?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      this.stderrChunks.push(text);
      stderrBuf += text;
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) logger.warn(`[${tag}] ${trimmed}`);
      }
    });
  }

  get stdout(): string {
    return this.stdoutChunks.join("");
  }

  get stderr(): string {
    return this.stderrChunks.join("");
  }
}
