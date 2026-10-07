import { CliDebugLogKind, type CliContainerLayout } from "../cli-runtime";

/** Where Copilot CLI's binary, home, agents, skills, debug logs and transcript are inside the agent container. */
export const COPILOT_CONTAINER_LAYOUT = {
  binary: "/usr/local/bin/copilot",
  configDir: "/workspace/.ralph",
  writableDirs: ["/workspace/.ralph/logs", "/workspace/.ralph/logs/cli-debug", "/workspace/.ralph/session-state"],
  agentsDir: "/workspace/.github/agents",
  skillsDir: "/workspace/.github/skills",
  debugLog: { kind: CliDebugLogKind.Dir, path: "/workspace/.ralph/logs/cli-debug" },
  transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
} as const satisfies CliContainerLayout;

/** Copilot CLI user settings (URL allowlist, experimental features), read from `$COPILOT_HOME`. */
export const COPILOT_SETTINGS_PATH = "/workspace/.ralph/settings.json";

/** Copilot CLI hook config that runs the audit hooks. */
export const COPILOT_HOOKS_CONFIG_PATH = "/workspace/.github/hooks/ralph-audit.json";

/** Copilot CLI session state directory. */
export const COPILOT_SESSION_STATE_DIR = "/workspace/.ralph/session-state";

/** Copilot CLI session store database. */
export const COPILOT_SESSION_DB_PATH = "/workspace/.ralph/session-store.db";
