import { execa, ExecaError } from "execa";
import { join } from "node:path";
import { sharedHooksDir } from "../container/setup/build-paths";
import { toErrorMessage } from "../util/error";

/** Scrubs credentials from text before the host stores or attaches it. */
export interface ITextRedactor {
  /**
   * `text` with every credential replaced by `[REDACTED]`.
   *
   * @throws Error when the redaction could not run, so the caller never mistakes unscrubbed text for scrubbed.
   */
  redact(text: string): Promise<string>;
  /**
   * Each of `texts` scrubbed on its own, as {@link redact} scrubs it, in one pass over all of them.
   *
   * @returns The scrubbed texts, in the order of `texts`.
   * @throws Error when the redaction could not run or returned another number of texts.
   */
  redactEach(texts: readonly string[]): Promise<string[]>;
}

/**
 * Applies the audit hooks' redaction rules (`shared/hooks/lib/redact.pl`), so text the host stores
 * is scrubbed exactly like the records the hooks write in the container: credential values from the
 * environment, well-known token formats, authorization values, URL passwords and secret assignments.
 */
export class HookRulesRedactor implements ITextRedactor {
  private readonly scriptPath: string;
  private readonly env: Readonly<Record<string, string | undefined>>;

  /**
   * @param rootDir The orchestrator checkout, whose `shared/hooks/lib/redact.pl` is the redactor script.
   * @param env The environment whose credential variables are scrubbed by value: the orchestrator's own, which
   *   holds every secret from `.env`.
   */
  constructor({ rootDir }: { rootDir: string }, env: Readonly<Record<string, string | undefined>> = process.env) {
    this.scriptPath = join(sharedHooksDir(rootDir), "lib", "redact.pl");
    this.env = env;
  }

  /** Runs `redact.pl --text`, which scrubs all of stdin as one text. */
  async redact(text: string): Promise<string> {
    return this.run("--text", text);
  }

  /** Runs `redact.pl --json-lines`, which scrubs one JSON-encoded text per line, so no match spans two texts. */
  async redactEach(texts: readonly string[]): Promise<string[]> {
    if (texts.length === 0) return [];
    const stdout = await this.run("--json-lines", texts.map((text) => `${JSON.stringify(text)}\n`).join(""));
    const lines = stdout.split("\n").slice(0, -1);
    if (lines.length !== texts.length) {
      throw new Error(`Redacting with ${this.scriptPath} returned ${lines.length} texts for ${texts.length}`);
    }
    return lines.map((line) => JSON.parse(line) as string);
  }

  private async run(mode: string, input: string): Promise<string> {
    const { stdout } = await execa("perl", [this.scriptPath, mode], {
      input,
      env: this.env,
      extendEnv: false,
      stripFinalNewline: false,
    }).catch((err: unknown) => {
      // shortMessage leaves out the captured output, which may hold the text being redacted.
      const reason = err instanceof ExecaError ? err.shortMessage : toErrorMessage(err);
      throw new Error(`Redacting with ${this.scriptPath} failed: ${reason}`);
    });
    return stdout;
  }
}
