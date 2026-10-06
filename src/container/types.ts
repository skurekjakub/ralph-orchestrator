import type { IAgentProfile, IStageConfig, StageMode } from "../config/types";
import { IContainerManager } from "./manager";
import type { ICliExecutor } from "./cli-executor-factory";

/** Filesystem paths specific to the chosen CLI (Copilot or Claude Code). */
export interface CliPaths {
  readonly configDir: string;
  readonly writableDirs: readonly string[];
  readonly transcriptPath: string;
  readonly logDir: string;
}

/** Raw result from a `docker compose exec` call (exit code, captured output, timeout flag). */
export interface ContainerExecResult {
  /** Process exit code (0 = success). */
  exitCode: number;
  /** Captured standard output. */
  stdout: string;
  /** Captured standard error. */
  stderr: string;
  /** True if the process was killed because it exceeded the configured timeout. */
  timedOut: boolean;
}

/**
 * Factory for creating {@link ContainerManager} instances.
 */
import type { IAgentSessionRunner } from "./agent-session-runner";

export interface ContainerManagerFactory {
  create(profile: IAgentProfile): IContainerManager;
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
 * with stage-specific values. Other profile fields (repo, compose, MCP, etc.)
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
 * Enriched result returned by {@link ContainerManager.execute}.
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
}
