/**
 * What one CLI calls the tools that agent templates and skills name in prose. Templates read them as
 * `{{ cliTools.subagent }}` etc., so one template reads correctly on every CLI.
 */
export interface CliToolNames {
  /** Spawns a subagent. */
  readonly subagent: string;
  /** Loads a skill. */
  readonly skill: string;
  /** Runs a shell command. */
  readonly shell: string;
  /** Reads a file. */
  readonly read: string;
  /** Asks the human a question; headless agents must never call it. */
  readonly askUser: string;
}
