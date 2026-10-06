import { CliDebugLogKind, type CliContainerLayout } from "../cli-runtime";

/** Where Copilot CLI keeps its home, agents, skills, debug logs and transcript inside the agent container. */
export const COPILOT_CONTAINER_LAYOUT = {
  configDir: "/workspace/.ralph",
  writableDirs: ["/workspace/.ralph/logs", "/workspace/.ralph/logs/cli-debug", "/workspace/.ralph/session-state"],
  agentsDir: "/workspace/.github/agents",
  skillsDir: "/workspace/.github/skills",
  debugLog: { kind: CliDebugLogKind.Dir, path: "/workspace/.ralph/logs/cli-debug" },
  transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
} as const satisfies CliContainerLayout;
