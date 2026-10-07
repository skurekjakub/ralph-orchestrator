import { CliDebugLogKind, type CliContainerLayout } from "../cli-runtime";

/** Claude Code home (`CLAUDE_CONFIG_DIR`) inside the agent container, under the git-excluded `.ralph/`. */
const CLAUDE_CONFIG_DIR = "/workspace/.ralph/claude";

/** Where Claude Code's binary, home, agents, skills and debug log are inside the agent container. */
export const CLAUDE_CONTAINER_LAYOUT = {
  binary: "/usr/local/bin/claude",
  configDir: CLAUDE_CONFIG_DIR,
  writableDirs: ["/workspace/.ralph/logs", "/workspace/.ralph/logs/cli-debug"],
  agentsDir: `${CLAUDE_CONFIG_DIR}/agents`,
  skillsDir: `${CLAUDE_CONFIG_DIR}/skills`,
  debugLog: { kind: CliDebugLogKind.File, path: "/workspace/.ralph/logs/cli-debug/claude.log" },
  transcriptPath: null,
} as const satisfies CliContainerLayout;

/** User-scope settings file; mounted read-only so the agent cannot create user settings of its own. */
export const CLAUDE_USER_SETTINGS_PATH = `${CLAUDE_CONFIG_DIR}/settings.json`;

/** Session transcripts Claude Code writes: `projects/<cwd slug>/<session id>.jsonl` plus subagent files. */
export const CLAUDE_SESSIONS_DIR = `${CLAUDE_CONFIG_DIR}/projects`;

/**
 * Ralph's settings file for container sessions, passed with `--settings`. Command-line settings outrank user and
 * project settings and apply alongside any managed settings, including the server-managed settings an
 * organisation delivers with the credential; managed settings still win where both set a key. Mounted read-only
 * outside the workspace and the Claude Code home, so neither the agent nor the target repo can change it.
 */
export const CLAUDE_SESSION_SETTINGS_PATH = "/etc/ralph/claude-settings.json";
