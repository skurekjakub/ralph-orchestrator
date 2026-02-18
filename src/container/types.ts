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
 * Common interface for CLI executors (Copilot CLI, Claude Code CLI).
 *
 * Each implementation translates a prompt into the appropriate CLI invocation
 * inside the container, handles streaming, timeout, and process lifecycle.
 */
export interface CliExecutor {
  /** Execute the agent CLI with the given prompt. */
  run(prompt: string): Promise<ContainerExecResult>;
  /** Kill the active process if running (for graceful shutdown). */
  killActive(): void;
}

/**
 * Factory for creating {@link ContainerManager} instances.
 *
 * Injected into {@link TaskRunner} so that container creation can be
 * mocked in tests without needing a running Docker daemon.
 */
export interface ContainerManagerFactory {
  create(profile: import("../config.js").AgentProfile): import("./manager.js").ContainerManager;
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
  /** Copilot CLI process exit code. */
  exitCode: number;
  /** Full captured stdout from the copilot session. */
  stdout: string;
  /** Full captured stderr from the copilot session. */
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
