import { IAgentProfile } from "../config/types.js";
import { IContainerManager } from "./manager.js";

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

/** Which CLI tool to use for agent execution inside the container. */
export enum CliType {
  Copilot = "copilot",
  Claude = "claude",
}

/**
 * Factory for creating {@link ContainerManager} instances.
 */
export interface ContainerManagerFactory {
  create(profile: IAgentProfile): IContainerManager;
  /** Raw `docker compose down` fallback when the container reference is unavailable or stop failed. */
  forceDown(profile: IAgentProfile): Promise<void>;
}

/** Final task status — from the agent's structured output or inferred from exit code. */
export enum TaskStatus {
  Completed = "completed",
  Partial = "partial",
  Blocked = "blocked",
  Error = "error",
}

/**
 * Enriched result returned by {@link ContainerManager.execute}.
 *
 * Includes the raw exec output plus parsed metadata (PR URL, agent-reported
 * status) and paths to locally-saved log files.
 */
export interface RalphResult {
  /** JIRA issue key (e.g. `DF-2759`). */
  issueKey: string;
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
}
