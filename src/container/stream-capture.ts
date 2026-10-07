import type { ResultPromise } from "execa";
import type { CliRunOutcome, ICliOutputDecoder } from "../cli/output-decoder";
import { PlainTextDecoder } from "../cli/plain-text-decoder";
import type { Logger } from "../logger";
import { hasResultBlock } from "./result-parser";

/** Marker line that signals the end of the agent's result block. */
const RESULT_END_MARKER = "===RALPH_RESULT_END===";

/**
 * Captures and streams stdout/stderr from a child process.
 *
 * Splits stdout into lines and runs each through a decoder, which turns it into log lines and the agent's
 * own text; stderr lines are logged as warnings. The raw chunks of both streams are kept for later retrieval.
 *
 * Also watches the decoded agent text for a complete result block so callers can react (e.g. terminate an
 * idle CLI) without waiting for the process to exit on its own. A block inside a tool input or a subagent's
 * output does not count.
 */
export class StreamCapture {
  readonly stdoutChunks: string[] = [];
  readonly stderrChunks: string[] = [];

  /**
   * Resolves once the agent's text so far holds a result block with a recognised STATUS
   * ({@link hasResultBlock}); an end marker alone, e.g. quoted in prose, does not resolve it.
   * Never rejects — stays pending if no such block is seen.
   */
  readonly resultBlockDetected: Promise<void>;

  private readonly decoder: ICliOutputDecoder;
  private readonly logger: Logger;
  private readonly tag: string;
  private stdoutBuf = "";
  private readonly agentTexts: string[] = [];
  private _resolveResultBlock!: () => void;
  private _resultBlockResolved = false;

  /**
   * @param proc Child process to attach to.
   * @param logger Where to stream lines.
   * @param tag Prefix for each line, e.g. `"copilot"` → `[copilot] ...`.
   * @param decoder Decoder for the process's stdout; plain text when omitted.
   */
  constructor(proc: ResultPromise, logger: Logger, tag: string, decoder: ICliOutputDecoder = new PlainTextDecoder()) {
    this.decoder = decoder;
    this.logger = logger;
    this.tag = tag;
    this.resultBlockDetected = new Promise<void>((resolve) => {
      this._resolveResultBlock = resolve;
    });

    proc.stdout?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      this.stdoutChunks.push(text);
      this.stdoutBuf += text;
      const lines = this.stdoutBuf.split("\n");
      this.stdoutBuf = lines.pop() ?? "";
      for (const line of lines) this.decode(line);
    });
    proc.stdout?.on("close", () => this.flushStdout());

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
    proc.stderr?.on("close", () => {
      const trimmed = stderrBuf.trim();
      if (trimmed) logger.warn(`[${tag}] ${trimmed}`);
    });
  }

  get stdout(): string {
    return this.stdoutChunks.join("");
  }

  get stderr(): string {
    return this.stderrChunks.join("");
  }

  /** The decoded run: agent text, usage, session id and CLI error. Decodes a final unterminated line first. */
  outcome(): CliRunOutcome {
    this.flushStdout();
    return this.decoder.finish();
  }

  private flushStdout(): void {
    const rest = this.stdoutBuf;
    this.stdoutBuf = "";
    if (rest.trim()) this.decode(rest);
  }

  private decode(line: string): void {
    const decoded = this.decoder.decodeLine(line);
    for (const logLine of decoded.logLines) {
      const trimmed = logLine.trim();
      if (trimmed) this.logger.info(`[${this.tag}] ${trimmed}`);
    }
    for (const warning of decoded.warnings ?? []) this.logger.warn(`[${this.tag}] ${warning}`);
    if (decoded.agentText === undefined) return;
    this.agentTexts.push(decoded.agentText);
    if (
      !this._resultBlockResolved &&
      decoded.agentText.includes(RESULT_END_MARKER) &&
      hasResultBlock(this.agentTexts.join("\n"))
    ) {
      this._resultBlockResolved = true;
      this._resolveResultBlock();
    }
  }
}
