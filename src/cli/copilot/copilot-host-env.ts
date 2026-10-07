/**
 * The variables that run a Copilot CLI on the host with its home at `homeDir`: `COPILOT_HOME` keeps its config,
 * state and package cache there, and `COPILOT_AUTO_UPDATE=false` keeps it from downloading a newer CLI, so it runs
 * the version the orchestrator pins (`copilot help environment`).
 */
export function copilotHostEnv(homeDir: string): Record<string, string> {
  return { COPILOT_HOME: homeDir, COPILOT_AUTO_UPDATE: "false" };
}
