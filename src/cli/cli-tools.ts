import { CliType } from "../config/types";

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

/** Claude Code tool names. */
export const CLAUDE_TOOL_NAMES: CliToolNames = {
  subagent: "Agent",
  skill: "Skill",
  shell: "Bash",
  read: "Read",
  askUser: "AskUserQuestion",
};

/** GitHub Copilot CLI tool names. */
export const COPILOT_TOOL_NAMES: CliToolNames = {
  subagent: "task",
  skill: "skill",
  shell: "bash",
  read: "view",
  askUser: "ask_questions",
};

/** The tool names of `cli`. */
export function cliToolNamesFor(cli: CliType): CliToolNames {
  switch (cli) {
    case CliType.Claude:
      return CLAUDE_TOOL_NAMES;
    case CliType.Copilot:
      return COPILOT_TOOL_NAMES;
  }
}
