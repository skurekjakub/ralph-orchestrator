import { join } from "node:path";
import { CliType, StageMode } from "../../config/types";
import { CaptureMode } from "../../container/log-collector";
import { workspaceMountTarget } from "../../container/workspace-paths";
import { agentFileMounts, skillDirMounts } from "../../container/setup/artifact-mounts";
import { agentsBuildDir } from "../../container/setup/build-paths";
import { COPILOT_SETTINGS_FILE, writeCopilotSettings } from "./copilot-settings";
import type { Logger } from "../../logger";
import type { CliLogSources, CliTaskInput, ComposeContribution, ICliRuntime } from "../cli-runtime";
import { COPILOT_CREDENTIALS } from "../credential-catalog";
import { COPILOT_MODEL_POLICY } from "../model-catalog";
import type { ICliOutputDecoder } from "../output-decoder";
import { PlainTextDecoder } from "../plain-text-decoder";
import { CopilotAgentWriter, copilotAgentFileName } from "./copilot-agent-writer";
import { COPILOT_TOOL_NAMES } from "./copilot-tools";
import {
  COPILOT_SETTINGS_PATH,
  COPILOT_CONTAINER_LAYOUT,
  COPILOT_HOOKS_CONFIG_PATH,
  COPILOT_SESSION_DB_PATH,
  COPILOT_SESSION_STATE_DIR,
} from "./copilot-layout";

/** GitHub Copilot CLI: dotted model ids, `GH_TOKEN` auth, home and logs under `/workspace/.ralph`, plain-text output. */
export class CopilotRuntime implements ICliRuntime {
  readonly cli = CliType.Copilot;
  readonly layout = COPILOT_CONTAINER_LAYOUT;
  readonly models = COPILOT_MODEL_POLICY;
  readonly credentials = COPILOT_CREDENTIALS;
  readonly agentWriter = new CopilotAgentWriter();
  readonly toolNames = COPILOT_TOOL_NAMES;
  readonly mountsEachRenderedItem = true;
  readonly egressDomains = [".githubcopilot.com", "api.github.com", "github.com"];
  /**
   * The agents and skills directories count whole: the mount points Docker leaves behind in them outlive
   * the run, and a later task mounts a different set.
   */
  readonly workspaceMountTargets = [
    workspaceMountTarget(COPILOT_SETTINGS_PATH, false),
    workspaceMountTarget(COPILOT_HOOKS_CONFIG_PATH, false),
    workspaceMountTarget(COPILOT_CONTAINER_LAYOUT.agentsDir, true),
    workspaceMountTarget(COPILOT_CONTAINER_LAYOUT.skillsDir, true),
  ];

  /**
   * Points `COPILOT_HOME` at the layout's home and mounts the settings file, the audit hook config, and file
   * by file into the target repo's `.github/`, the agents reachable from each container stage that runs
   * Copilot and those stages' skills, so the target repo's own agents and skills stay visible. Passes
   * `GH_TOKEN` by name.
   */
  composeContribution({ profile, paths, agents }: CliTaskInput): ComposeContribution {
    const stages = profile.stages.filter((s) => s.mode === StageMode.Container && s.cli === this.cli);
    const agentFiles = [...new Set(stages.flatMap((s) => agents.reachableFrom(s.agent)))].map(copilotAgentFileName);
    const skills = [...new Set(stages.flatMap((s) => s.skills))];
    const env: Record<string, string> = { COPILOT_HOME: this.layout.configDir };
    for (const { envVar } of this.credentials.required) env[envVar] = `\${${envVar}}`;

    return {
      volumes: [
        `${join(paths.buildDir, COPILOT_SETTINGS_FILE)}:${COPILOT_SETTINGS_PATH}:ro`,
        `${join(paths.hooksDir, "ralph-audit.json")}:${COPILOT_HOOKS_CONFIG_PATH}:ro`,
        ...agentFileMounts(agentFiles, agentsBuildDir(paths, this.cli), this.layout.agentsDir),
        ...skillDirMounts(skills, paths.skillsBuildDir, this.layout.skillsDir),
      ],
      env,
    };
  }

  /**
   * Writes the Copilot settings file, whose URL allowlist mirrors the task's generated `squid.conf`.
   *
   * @throws Error when the task's `squid.conf` has not been written.
   */
  writeTaskArtifacts({ paths }: CliTaskInput, logger: Logger): void {
    writeCopilotSettings(paths.buildDir, logger);
  }

  /** The `--share` transcript, the debug log directory, the session state directory and the session database. */
  logSources(onDebugLine?: (line: string) => void): CliLogSources {
    const debugDir = this.layout.debugLog.path;
    return {
      sources: [
        {
          id: "transcript",
          service: "app",
          containerPath: this.layout.transcriptPath,
          extension: "md",
          mode: CaptureMode.Collect,
        },
        {
          id: "cli-debug",
          service: "app",
          containerPath: debugDir,
          extension: "log",
          mode: onDebugLine ? CaptureMode.Stream : CaptureMode.Collect,
          collectArgs: ["sh", "-c", `cat ${debugDir}/*.log 2>/dev/null`],
          streamArgs: [
            "sh",
            "-c",
            `while ! ls ${debugDir}/*.log >/dev/null 2>&1; do sleep 1; done; exec tail -n 0 -F ${debugDir}/*.log`,
          ],
          onLine: onDebugLine,
        },
      ],
      exports: [
        { id: "session-state", service: "app", containerPath: COPILOT_SESSION_STATE_DIR },
        { id: "session-db", service: "app", containerPath: COPILOT_SESSION_DB_PATH },
      ],
    };
  }

  createOutputDecoder(): ICliOutputDecoder {
    return new PlainTextDecoder();
  }

  /** Copilot's audit records carry a session id the hooks mint, and Copilot CLI reports none to tie it to. */
  sessionStartAudited(): undefined {
    return undefined;
  }
}
