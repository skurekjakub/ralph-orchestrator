import type { CliError, CliRunUsage } from "../cli/output-decoder";
import type { IAgentProfile, IStageConfig, StageMode } from "../config/types";
import { IContainerManager } from "./manager";
import type { ICliExecutor } from "./cli-executor-factory";

/** Result of one CLI process: exit code, captured output, timeout flag and what its output decoded to. */
export interface ContainerExecResult {
  /** Process exit code (0 = success). */
  exitCode: number;
  /** Captured standard output. */
  stdout: string;
  /** Captured standard error. */
  stderr: string;
  /** True if the process was killed because it exceeded the configured timeout. */
  timedOut: boolean;
  /** The agent text the result block is read from, as the CLI's output decoder reports it (`CliRunOutcome.agentText`). */
  agentText: string;
  /** Token, cost and turn usage the CLI reported. */
  usage?: CliRunUsage;
  /** CLI session id, for resuming the session and correlating logs. */
  sessionId?: string;
  /** Terminal error the CLI reported for its session. */
  cliError?: CliError;
}

/**
 * Factory for creating {@link ContainerManager} instances.
 */
import type { IAgentSessionRunner } from "./agent-session-runner";

export interface ContainerManagerFactory {
  /** Create the container manager of one task, whose stack mounts `workspacePath` at `/workspace`. */
  create(profile: IAgentProfile, workspacePath: string): IContainerManager;
  /** Raw `docker compose down` fallback when the container reference is unavailable or stop failed. */
  forceDown(profile: IAgentProfile): Promise<void>;
  /**
   * Create the host executor and session runner of a post-task hook stage, which runs in `workspace` without a
   * container.
   *
   * @throws Error when the stage's agent templates are invalid or lack the stage's agent.
   */
  createLocalSession(
    profile: IAgentProfile,
    stage: IStageConfig,
    workspace: HostStageWorkspace,
  ): Promise<{ executor: ICliExecutor; sessionRunner: IAgentSessionRunner }>;
}

/** What every stage workspace holds: where the CLI runs and where its rendered agents, skills and artifacts live. */
interface StageWorkspaceBase {
  /** CLI working directory. */
  readonly cwd: string;
  /** The `artifactDir` template value: where the stage's agents write their artifacts. */
  readonly artifactDir: string;
  /** Host directory receiving the stage's rendered agent files. */
  readonly agentsOutDir: string;
  /** Host directory receiving the stage's rendered skills. */
  readonly skillsOutDir: string;
}

/** The workspace of a `mode: "container"` stage: the task's workspace mounted at `/workspace`. */
export interface ContainerStageWorkspace extends StageWorkspaceBase {
  readonly mode: StageMode.Container;
  /** `/workspace`. */
  readonly cwd: string;
  /** Relative to `/workspace`: `.ralph/tasks/<key>/artifacts`. */
  readonly artifactDir: string;
}

/**
 * The workspace of a `mode: "local"` stage on the host: a directory of its own under the task's output directory,
 * holding its working directory, CLI home and logs, so nothing the stage's CLI writes lands in the orchestrator
 * checkout.
 */
export interface HostStageWorkspace extends StageWorkspaceBase {
  readonly mode: StageMode.Local;
  /** The stage's own directory: `<outputDir>/hooks/<hook>/<role>` or `<outputDir>/stages/<role>`. */
  readonly stageDir: string;
  /** `<stageDir>/work`, a git repository of its own once the stage's executor has prepared it. */
  readonly cwd: string;
  /** Absolute. A hook's stages share theirs; a variant's local stage shares the container stages' artifacts. */
  readonly artifactDir: string;
  /** The stage's private CLI home (`CLAUDE_CONFIG_DIR`, `COPILOT_HOME`): `<stageDir>/home`. */
  readonly cliHomeDir: string;
  /** Where the CLI writes its debug log and the audit hooks their records: `<stageDir>/logs`. */
  readonly logDir: string;
  /** The orchestrator checkout; the stage may read only the sources {@link additionalDirs} names in it. */
  readonly orchestratorDir: string;
  /**
   * Directories the agent may read besides `cwd`: the task's output directory, the task's workspace for a
   * variant's stage, the task profile's `agents/`, and `shared/agent-includes`, `shared/skills` and
   * `shared/mcp-servers`. Never a profile's `.build/`, which holds MCP credentials, or the checkout's `.env`.
   */
  readonly additionalDirs: readonly string[];
}

/** Where one stage's CLI runs and where its rendered agents, skills and artifacts live. */
export type StageWorkspace = ContainerStageWorkspace | HostStageWorkspace;

/** Final task status — from the agent's structured output or inferred from exit code. */
export enum TaskStatus {
  Completed = "completed",
  Partial = "partial",
  Blocked = "blocked",
  Error = "error",
}

/**
 * Whether a task that ended with `status` succeeded: the ledger records its operation as completed, the
 * issue moves on to the variant's `afterAgent` status, and its workspace is deleted.
 */
export function isSuccessfulStatus(status: TaskStatus): boolean {
  return status === TaskStatus.Completed || status === TaskStatus.Partial;
}

/** Why a run ended in {@link TaskStatus.Error}, as far as the CLI and the result contract tell. */
export enum FailureReason {
  /** The CLI could not authenticate with its configured credential. */
  AuthFailed = "auth-failed",
  /** The CLI stopped the session at its turn limit. */
  MaxTurns = "max-turns",
  /** The CLI's session failed while it ran (Claude Code `error_during_execution`). */
  ExecutionError = "execution-error",
  /** The CLI reported another terminal error, such as a rate limit, a billing or a server error. */
  CliError = "cli-error",
  /** The CLI process exited non-zero without reporting an error of its own. */
  ExitCode = "exit-code",
  /** The stage requires a result block, and the agent text holds none whose STATUS the orchestrator accepts. */
  MissingResultBlock = "missing-result-block",
}

/** Result of a single pipeline stage execution. */
export interface StageResult {
  /** Stage role identifier (e.g. `primary`, `reviewer`). */
  role: string;
  /** Final status for this stage. */
  status: TaskStatus;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** CLI process exit code. */
  exitCode: number;
  /** Collected log files keyed by source id. */
  collectedLogs: Record<string, string>;
}

/**
 * Derive a stage-scoped profile from a base profile and a specific stage config.
 *
 * Overrides `agentName`, `displayName`, `cli`, `model`, `timeoutMs`, and `skills`
 * with stage-specific values. Other profile fields (repo URL, compose, MCP, etc.)
 * remain unchanged.
 */
export function deriveStageProfile(profile: IAgentProfile, stage: IStageConfig): IAgentProfile {
  return {
    ...profile,
    agentName: stage.agent,
    displayName: stage.agent.replace(/^ralph\./, ""),
    cli: stage.cli,
    model: stage.model ?? profile.model,
    timeoutMs: stage.timeoutMs ?? profile.timeoutMs,
    skills: [...stage.skills],
  };
}

/**
 * Enriched result returned by {@link ContainerManager.executeWithExecutor}.
 *
 * Includes the raw exec output plus parsed metadata (PR URL, agent-reported
 * status) and paths to locally-saved log files.
 */
export interface RalphResult {
  /** Work item identifier (e.g. `DF-2759`). */
  taskId: string;
  /** Final task status — may come from the agent's structured output block or be inferred from the exit code. */
  status: TaskStatus;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** CLI process exit code. */
  exitCode: number;
  /** Full captured stdout from the CLI session. */
  stdout: string;
  /** Full captured stderr from the CLI session. */
  stderr: string;
  /** Local path to the handoff file, if one was saved. */
  handoffPath?: string;
  /**
   * Collected log files keyed by source id (e.g. `"audit"`, `"transcript"`, `"proxy"`).
   * Values are local filesystem paths. Absent sources are omitted.
   */
  collectedLogs: Record<string, string>;
  /** ADO pull request URL parsed from the agent's structured output. */
  prUrl?: string;
  /** Per-stage results when running a multi-stage pipeline. */
  stageResults?: StageResult[];
  /**
   * The agent text of the run's CLI sessions, continuations included, as the CLI's output decoder reports
   * it. Absent when no CLI session ran, e.g. when the task failed before its first stage.
   */
  agentText?: string;
  /** Why the run failed; set on the {@link TaskStatus.Error} results the session runner resolves. */
  failureReason?: FailureReason;
  /** Terminal error the CLI reported for the run's last session. */
  cliError?: CliError;
  /** The distinct CLI session ids the run's invocations reported, continuations included, in run order. */
  sessionIds?: string[];
  /**
   * Session ids of container stages whose audit log has no `session_start` record: Ralph's hooks did not
   * run for them, e.g. because an organisation's server-managed settings set `allowManagedHooksOnly` or
   * `disableAllHooks`.
   */
  hooklessSessions?: string[];
}
