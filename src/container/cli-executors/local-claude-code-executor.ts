import { execa, type ResultPromise } from "execa";
import { join } from "node:path";
import { claudeAgentFileName } from "../../cli/claude/claude-agent-writer";
import { writeHostSessionSettings } from "../../cli/claude/claude-host-settings";
import {
  CLAUDE_HEADLESS_ENV,
  ClaudePermissionMode,
  ClaudeSessionIds,
  ClaudeSettingSources,
  claudeSessionArgs,
  claudeSessionEnv,
  claudeSessionTools,
} from "../../cli/claude/claude-session";
import { CLAUDE_HOST_TOOLS } from "../../cli/claude/claude-tools";
import type { ICliRuntime } from "../../cli/cli-runtime";
import type { IAgentProfile, IStageConfig } from "../../config/types";
import type { Logger } from "../../logger";
import { AGENT_RESULT_JSON_SCHEMA } from "../agent-result";
import type { ICliExecutor } from "../cli-executor-factory";
import type { ContainerExecResult, HostStageWorkspace } from "../types";
import { prepareHostStage } from "./host-stage";
import { executeCliCommand, killActiveProcess } from "./shared-exec";

/** Dependencies of one host stage's Claude Code executor. */
export interface LocalClaudeCodeExecutorDeps {
  /** The variant with the stage's overrides applied (`deriveStageProfile`): model, timeout. */
  readonly profile: IAgentProfile;
  /** The stage: effort and whether it requires a result. */
  readonly stage: IStageConfig;
  /** Frontmatter `name` of the stage's root agent, which `--agent` resolves. */
  readonly agentName: string;
  /** Length of the longest subagent chain below the stage's root agent; 0 when it spawns none. */
  readonly subagentDepth: number;
  /** Frontmatter names of every agent the stage root can reach, root excluded: the subagents it may spawn. */
  readonly subagents: readonly string[];
  /** Where the stage runs; its agents and skills are already rendered into the workspace's CLI home. */
  readonly workspace: HostStageWorkspace;
  /** The Claude Code runtime: credentials and output decoder. */
  readonly runtime: ICliRuntime;
  /** The pinned Claude Code the orchestrator installed (`node_modules/.bin/claude`). */
  readonly binary: string;
  /** Host path of `shared/hooks`, whose audit hooks the session runs. */
  readonly hooksDir: string;
  readonly logger: Logger;
}

/**
 * Runs a `mode: "local"` stage with Claude Code on the host, inside the stage's own workspace.
 *
 * The CLI runs headless in `workspace.cwd`, a git repository of its own, with `CLAUDE_CONFIG_DIR` at the
 * workspace's private home, where the stage's agents and skills are rendered, so the developer's own settings,
 * hooks, plugins, agents, skills, memory and login stay out. It loads user settings only, never the orchestrator's `CLAUDE.md` files, which sit
 * above the workspace, and no MCP server. Ralph's audit hooks run from the host's `shared/hooks` and write to
 * the workspace's logs. A stage that requires a result runs with `--json-schema` and returns it as structured output.
 *
 * The session runs in `dontAsk` mode under the permissions {@link writeHostSessionSettings} writes: it reads only
 * its working directories, `workspace.cwd` and `workspace.additionalDirs`, writes only in its working and artifact
 * directories, and runs only read-only Bash commands. The `--tools` cap has no web tools. Its environment holds
 * `PATH`, `HOME`, `LANG` and the configured Claude Code credential, and no other orchestrator secret.
 */
export class LocalClaudeCodeExecutor implements ICliExecutor {
  activeProcess: ResultPromise | null = null;

  private readonly profile: IAgentProfile;
  private readonly stage: IStageConfig;
  private readonly agentName: string;
  private readonly subagentDepth: number;
  private readonly subagents: readonly string[];
  private readonly workspace: HostStageWorkspace;
  private readonly runtime: ICliRuntime;
  private readonly binary: string;
  private readonly hooksDir: string;
  private readonly logger: Logger;
  private readonly sessions = new ClaudeSessionIds();

  constructor(deps: LocalClaudeCodeExecutorDeps) {
    this.profile = deps.profile;
    this.stage = deps.stage;
    this.agentName = deps.agentName;
    this.subagentDepth = deps.subagentDepth;
    this.subagents = deps.subagents;
    this.workspace = deps.workspace;
    this.runtime = deps.runtime;
    this.binary = deps.binary;
    this.hooksDir = deps.hooksDir;
    this.logger = deps.logger;
  }

  /** Kill the active claude process if one is running. */
  killActive(): void {
    killActiveProcess(this);
  }

  /** Start a new session with `prompt`. */
  async run(prompt: string): Promise<ContainerExecResult> {
    return this.exec(prompt, this.sessions.start());
  }

  /** Resume the session `run` started with `prompt`, or start one when there is none. */
  async continueSession(prompt: string): Promise<ContainerExecResult> {
    const resume = this.sessions.resume();
    return resume === undefined ? this.run(prompt) : this.exec(prompt, resume);
  }

  /**
   * @throws Error when the stage root's agent was not rendered into the workspace, the workspace cannot be
   *   prepared, or Ralph's hooks cannot be read.
   */
  private async exec(prompt: string, sessionArgs: readonly string[]): Promise<ContainerExecResult> {
    const { workspace } = this;
    const env = await prepareHostStage(workspace, {
      rootAgentPath: join(workspace.agentsOutDir, claudeAgentFileName(this.agentName)),
      runtime: this.runtime,
      env: {
        CLAUDE_CONFIG_DIR: workspace.cliHomeDir,
        ...CLAUDE_HEADLESS_ENV,
        // The workspace sits inside the orchestrator checkout, whose CLAUDE.md the ancestor walk would load.
        CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1",
        RALPH_LOG_DIR: workspace.logDir,
        ...claudeSessionEnv(this.subagentDepth),
      },
    });
    const settingsPath = writeHostSessionSettings(workspace, this.hooksDir, this.subagents);

    const args = claudeSessionArgs(
      {
        agentName: this.agentName,
        model: this.profile.model,
        effort: this.stage.effort,
        settingSources: ClaudeSettingSources.User,
        settingsPath,
        permissionMode: ClaudePermissionMode.DontAsk,
        tools: claudeSessionTools(CLAUDE_HOST_TOOLS, this.subagentDepth),
        additionalDirs: workspace.additionalDirs,
        resultSchema: this.stage.requireResultBlock ? AGENT_RESULT_JSON_SCHEMA : undefined,
        debugFile: join(workspace.logDir, "claude.log"),
      },
      sessionArgs,
    );

    return executeCliCommand({
      spawn: () =>
        execa(this.binary, args, {
          cwd: workspace.cwd,
          timeout: this.profile.timeoutMs,
          extendEnv: false,
          env,
          input: prompt,
        }),
      logger: this.logger,
      tag: "local-claude",
      tracker: this,
      decoder: this.runtime.createOutputDecoder(),
    });
  }
}
