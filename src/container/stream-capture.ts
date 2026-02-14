import type { ResultPromise } from "execa";
import type { Logger } from "../logger.js";

/**
 * Captures and streams stdout/stderr from a child process.
 *
 * Attaches to a process's stdout/stderr streams, line-buffering each into
 * the provided logger while simultaneously capturing the raw chunks for
 * later retrieval.
 */
export class StreamCapture {
  readonly stdoutChunks: string[] = [];
  readonly stderrChunks: string[] = [];

  /**
   * @param proc Child process to attach to.
   * @param logger Where to stream lines.
   * @param tag Prefix for each line, e.g. `"copilot"` → `[copilot] ...`.
   */
  constructor(proc: ResultPromise, logger: Logger, tag: string) {
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
