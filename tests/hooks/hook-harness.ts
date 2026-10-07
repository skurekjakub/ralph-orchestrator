import { execa } from "execa";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Host path of `shared/hooks`, mounted read-only at `/workspace/.ralph/hooks` in agent containers. */
export const HOOKS_DIR = resolve(import.meta.dirname, "../../shared/hooks");

/** Container path prefix every hook command in the CLI hook configs starts with. */
export const CONTAINER_HOOKS_DIR = "/workspace/.ralph/hooks/";

/** Raw hook payloads, keyed by scenario name. */
export type PayloadFixtures = Record<string, Record<string, unknown>>;

/** One parsed line of `audit.jsonl` or `pre-tool.log`. */
export type AuditRecord = Record<string, unknown>;

/** Outcome of one hook script run. */
export interface HookRun {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

/** Loads `tests/hooks/fixtures/<cli>/payloads.json`. */
export function loadPayloads(cli: "claude" | "copilot"): PayloadFixtures {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures", cli, "payloads.json"), "utf8"));
}

/** Loads the PreToolUse payloads captured from Claude Code 2.1.292, one per line. */
export function loadCapturedPreToolUse(): Record<string, unknown>[] {
  return readFileSync(resolve(import.meta.dirname, "fixtures/claude/pre-tool-use-captured.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/** Parses JSONL text, failing loudly on any line that is not JSON. */
export function parseJsonl(text: string): AuditRecord[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/**
 * A private log directory plus a runner for the real hook scripts. Scripts run
 * with a minimal environment (PATH and RALPH_LOG_DIR only) so the developer's
 * own secrets never reach the redaction logic under test.
 */
export class HookSandbox {
  readonly logDir: string;

  constructor() {
    this.logDir = mkdtempSync(join(tmpdir(), "ralph-hooks-"));
  }

  /** Runs `shared/hooks/<script>` with `input` on stdin. */
  async run(
    script: string,
    args: readonly string[],
    input: string,
    env: Readonly<Record<string, string>> = {},
  ): Promise<HookRun> {
    const result = await execa(join(HOOKS_DIR, script), args, {
      input,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", RALPH_LOG_DIR: this.logDir, ...env },
      extendEnv: false,
      reject: false,
    });
    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
  }

  /** Runs a script with a JSON payload. */
  runJson(
    script: string,
    args: readonly string[],
    payload: unknown,
    env: Readonly<Record<string, string>> = {},
  ): Promise<HookRun> {
    return this.run(script, args, JSON.stringify(payload), env);
  }

  /**
   * Runs a hook script on a JSON payload and returns the audit record it wrote.
   * @throws Error when the script reports a failure or writes no record.
   */
  async recordOf(
    script: string,
    args: readonly string[],
    payload: unknown,
    env: Readonly<Record<string, string>> = {},
  ): Promise<AuditRecord> {
    const run = await this.runJson(script, args, payload, env);
    const record = this.audit().at(-1);
    if (run.exitCode !== 0 || run.stderr !== "" || record === undefined || record.event === "hook_error") {
      throw new Error(`${script} wrote no record (exit ${run.exitCode}): ${run.stderr || JSON.stringify(record)}`);
    }
    return record;
  }

  /** Contents of a file in the log directory, or "" when it does not exist. */
  read(name: string): string {
    const path = join(this.logDir, name);
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  }

  audit(): AuditRecord[] {
    return parseJsonl(this.read("audit.jsonl"));
  }

  preTool(): AuditRecord[] {
    return parseJsonl(this.read("pre-tool.log"));
  }

  cleanup(): void {
    rmSync(this.logDir, { recursive: true, force: true });
  }
}
