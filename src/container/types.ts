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
  /** Create a local executor + session runner pair for a hook stage (no container needed). */
  createLocalSession(
    profile: IAgentProfile,
    stage: IStageConfig,
  ): { executor: ICliExecutor; sessionRunner: IAgentSessionRunner };
}

/** Where one stage's CLI runs and where its rendered agents, skills and artifacts live. */
export interface StageWorkspace {
  readonly mode: StageMode;
  /** CLI working directory: `/workspace` in the container, a per-stage directory under the task output dir on the host. */
  readonly cwd: string;
  /** `artifactDir` template value: relative to `/workspace` in the container, absolute and shared by a hook's stages on the host. */
  readonly artifactDir: string;
  /** Host directory receiving the stage's rendered agent files. */
  readonly agentsOutDir: string;
  /** Host directory receiving the stage's rendered skills. */
  readonly skillsOutDir: string;
  /** CLI home directory for a host stage; absent for container stages, whose home is the runtime layout's `configDir`. */
  readonly cliHomeDir?: string;
  /** Host directories the agent may reach besides `cwd`; empty for container stages. */
  readonly additionalDirs: readonly string[];
}

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
