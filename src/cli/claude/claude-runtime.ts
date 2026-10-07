import { mkdirSync } from "node:fs";
import { type ClaudeAuthMode, CliType } from "../../config/types";
import { CaptureMode } from "../../container/log-collector";
import { workspaceMountTarget } from "../../container/workspace-paths";
import { agentsBuildDir } from "../../container/setup/build-paths";
import type { Logger } from "../../logger";
import type { CliLogSources, CliTaskInput, ComposeContribution, ICliRuntime } from "../cli-runtime";
import { claudeCodeCredentials, type ICliCredentialPolicy } from "../credential-catalog";
import { CLAUDE_MODEL_POLICY } from "../model-catalog";
import type { ICliOutputDecoder } from "../output-decoder";
import {
  CLAUDE_CONTAINER_LAYOUT,
  CLAUDE_SESSION_SETTINGS_PATH,
  CLAUDE_SESSIONS_DIR,
  CLAUDE_USER_SETTINGS_PATH,
} from "./claude-layout";
import { sessionSettingsPath, userSettingsPath, writeClaudeSettings } from "./claude-settings";
import { ClaudeStreamJsonDecoder } from "./stream-json-decoder";
import { ClaudeAgentWriter } from "./claude-agent-writer";
import { CLAUDE_TOOL_NAMES } from "./claude-tools";

/**
 * Environment of every Claude Code container session.
 *
 * Background tasks are off so subagents run in the foreground and the session ends once; non-essential
 * traffic (telemetry, error reporting, auto-update checks) is off so the egress allowlist needs only the
 * model API; tool search is off so every MCP tool is loaded up front.
 */
const CLAUDE_CONTAINER_ENV: Readonly<Record<string, string>> = {
  CLAUDE_CONFIG_DIR: CLAUDE_CONTAINER_LAYOUT.configDir,
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  DISABLE_AUTOUPDATER: "1",
  DISABLE_COST_WARNINGS: "1",
  ENABLE_TOOL_SEARCH: "false",
};

/**
 * Claude Code: home, agents and skills under `/workspace/.ralph/claude`, Ralph's hooks and attribution policy in a
 * read-only `--settings` file, one credential chosen by `claudeAuth`, stream-json output.
 */
export class ClaudeCodeRuntime implements ICliRuntime {
  readonly cli = CliType.Claude;
  readonly layout = CLAUDE_CONTAINER_LAYOUT;
  readonly models = CLAUDE_MODEL_POLICY;
  readonly credentials: ICliCredentialPolicy;
  readonly agentWriter = new ClaudeAgentWriter();
  readonly toolNames = CLAUDE_TOOL_NAMES;
  readonly mountsEachRenderedItem = false;
  readonly egressDomains = [".anthropic.com"];
  readonly workspaceMountTargets = [
    workspaceMountTarget(CLAUDE_USER_SETTINGS_PATH, false),
    workspaceMountTarget(CLAUDE_CONTAINER_LAYOUT.agentsDir, true),
    workspaceMountTarget(CLAUDE_CONTAINER_LAYOUT.skillsDir, true),
  ];

  constructor({ claudeAuth }: { claudeAuth: ClaudeAuthMode }) {
    this.credentials = claudeCodeCredentials(claudeAuth);
  }

  /**
   * Mounts the session and user settings files and, whole, the directories the current stage's agents and
   * skills are rendered into, so a stage re-render shows up in the running container. Passes the configured
   * credential by name only; its value comes from the orchestrator's environment at compose time. The target
   * repo's CLAUDE.md files stay unloaded unless the profile sets `claude.loadRepoInstructions`.
   */
  composeContribution({ profile, paths }: CliTaskInput): ComposeContribution {
    const env: Record<string, string> = {};
    for (const { envVar } of this.credentials.required) env[envVar] = `\${${envVar}}`;
    Object.assign(env, CLAUDE_CONTAINER_ENV);
    if (!profile.claude.loadRepoInstructions) env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1";

    return {
      volumes: [
        `${sessionSettingsPath(paths)}:${CLAUDE_SESSION_SETTINGS_PATH}:ro`,
        `${userSettingsPath(paths)}:${CLAUDE_USER_SETTINGS_PATH}:ro`,
        `${agentsBuildDir(paths, this.cli)}:${this.layout.agentsDir}:ro`,
        `${paths.skillsBuildDir}:${this.layout.skillsDir}:ro`,
      ],
      env,
    };
  }

  /**
   * Writes the session and user settings, and creates the agents and skills directories so their bind
   * mounts never fall back to directories Docker creates as root.
   */
  writeTaskArtifacts({ paths }: CliTaskInput, logger: Logger): void {
    writeClaudeSettings(paths, logger);
    mkdirSync(agentsBuildDir(paths, this.cli), { recursive: true });
    mkdirSync(paths.skillsBuildDir, { recursive: true });
  }

  /** The single-file debug log and the session transcripts; the Markdown transcript is derived on the host. */
  logSources(onDebugLine?: (line: string) => void): CliLogSources {
    return {
      sources: [
        {
          id: "claude-cli-debug",
          service: "app",
          containerPath: this.layout.debugLog.path,
          extension: "log",
          mode: onDebugLine ? CaptureMode.Stream : CaptureMode.Collect,
          onLine: onDebugLine,
        },
      ],
      exports: [{ id: "claude-sessions", service: "app", containerPath: CLAUDE_SESSIONS_DIR }],
    };
  }

  createOutputDecoder(): ICliOutputDecoder {
    return new ClaudeStreamJsonDecoder();
  }

  /** Ralph's `SessionStart` hook records Claude Code's own session id; unparsable lines are skipped. */
  sessionStartAudited(auditJsonl: string, sessionId: string): boolean {
    return auditJsonl.split("\n").some((line) => {
      try {
        const record = JSON.parse(line) as { event?: unknown; session?: unknown };
        return record.event === "session_start" && record.session === sessionId;
      } catch {
        return false;
      }
    });
  }
}
