import type { ClaudeAuthMode } from "../config/types";
import { ClaudeCodeRuntime } from "./claude/claude-runtime";
import { CliRuntimeRegistry, type ICliRuntimeRegistry } from "./cli-runtime";
import { CopilotRuntime } from "./copilot/copilot-runtime";

/**
 * The runtimes of every supported CLI: Claude Code, authenticating with the credential `claudeAuth` selects,
 * and Copilot CLI.
 */
export function createCliRuntimeRegistry(claudeAuth: ClaudeAuthMode): ICliRuntimeRegistry {
  return new CliRuntimeRegistry({ runtimes: [new ClaudeCodeRuntime({ claudeAuth }), new CopilotRuntime()] });
}
