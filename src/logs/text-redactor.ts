import { execa, ExecaError } from "execa";
import { resolve } from "node:path";
import { toErrorMessage } from "../util/error";

/** Scrubs credentials from text before the host stores or attaches it. */
export interface ITextRedactor {
  /**
   * `text` with every credential replaced by `[REDACTED]`.
   *
   * @throws Error when the redaction could not run, so the caller never mistakes unscrubbed text for scrubbed.
   */
  redact(text: string): Promise<string>;
}

/**
 * Applies the audit hooks' redaction rules (`shared/hooks/lib/redact.pl --text`), so text the host stores
 * is scrubbed exactly like the records the hooks write in the container: credential values from the
 * environment, well-known token formats, authorization values, URL passwords and secret assignments.
 */
export class HookRulesRedactor implements ITextRedactor {
  private readonly scriptPath: string;
  private readonly env: Readonly<Record<string, string | undefined>>;

  /**
   * @param scriptPath The redactor script; defaults to `shared/hooks/lib/redact.pl` under the orchestrator checkout.
   * @param env The environment whose credential variables are scrubbed by value: the orchestrator's own, which
   *   holds every secret from `.env`.
   */
  constructor({
    scriptPath = resolve(process.cwd(), "shared/hooks/lib/redact.pl"),
    env = process.env,
  }: { scriptPath?: string; env?: Readonly<Record<string, string | undefined>> } = {}) {
    this.scriptPath = scriptPath;
    this.env = env;
  }

  async redact(text: string): Promise<string> {
    const { stdout } = await execa("perl", [this.scriptPath, "--text"], {
      input: text,
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
