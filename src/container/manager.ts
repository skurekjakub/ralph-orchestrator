import { execa } from "execa";
import { StageMode, type IAgentProfile, type IStageConfig } from "../config/types.js";
import type { WorkItem } from "../datasource/types.js";
import { deriveStageProfile, type RalphResult, type CliPaths } from "./types.js";
import type { Logger } from "../logger.js";
import type { IssueContext } from "../prompt/prompt.js";
import type { IComposeClient } from "./compose-client.js";
import type { ICliExecutor, ICliExecutorFactory } from "./cli-executor-factory.js";
import { StreamCapture } from "./stream-capture.js";
import type { IContainerLogCollector, CollectedLog } from "./log-collector.js";
import type { IContainerWorkspaceCleaner } from "./workspace-cleaner.js";
import type { ILogSourceRegistry } from "./log-source-registry.js";
import type { IAgentSessionRunner } from "./agent-session-runner.js";

/** Public contract for log collection on a container. */
export interface IContainerLogs {
  /** Stop all active streaming processes. */
  detach(): void;
  /**
   * Flush all log sources to disk.
   * @param stageLabel  Optional stage identifier for filename namespacing.
   */
  collectAll(stageLabel?: string): Promise<CollectedLog[]>;
  /**
   * Truncate container-side log files between pipeline stages.
   * Ensures each stage starts with fresh log files.
   */
  clearCollectSources(): Promise<void>;
}

/** Public contract for container lifecycle management. */
export interface IContainerManager {
  /** Whether the container is currently running (started but not yet stopped). */
  readonly isRunning: boolean;
  /** Verify that Docker is running. */
  checkPrerequisites(): Promise<void>;
  /** Build and start the containers. */
  start(): Promise<void>;
  /** Run the profile's setup script inside the running container. */
  setup(): Promise<void>;
  /** Execute a command inside the app container as the vscode user. */
  execInApp(args: string[]): Promise<{ stdout: string; stderr: string }>;
  /** Execute a command inside the mcp-sidecar container. */
  execInSidecar(args: string[]): Promise<{ stdout: string; stderr: string }>;
  /** Register standard log sources for a task and start streaming. */
  registerLogSources(taskId: string, workItemId: string): void;
  /** Execute the agent CLI inside the running container. */
  execute(workItem: WorkItem, context?: IssueContext): Promise<RalphResult>;
  /** Execute with a specific CLI executor (for per-stage agent switching). */
  executeWithExecutor(executor: ICliExecutor, workItem: WorkItem, context?: IssueContext): Promise<RalphResult>;
  /** Create a CLI executor configured for a specific pipeline stage. */
  createExecutorForStage(stage: IStageConfig): ICliExecutor;
  /** Tear down all containers and associated resources. */
  stop(): Promise<void>;
  /** Per-task log collector. */
  readonly logs: IContainerLogs;
  /** Handles cleanup of workspace paths and log directories inside the container. */
  readonly cleaner: IContainerWorkspaceCleaner;
  /** Filesystem paths specific to the chosen CLI. */
  readonly cliPaths: CliPaths;
  /** Optional callback invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;
  /** Optional callback invoked for each line of real-time pre-tool invocation output. */
  onPreToolUse?: (line: string) => void;
}

/**
 * Manages the full container lifecycle for a single agent profile using
 * `docker compose` directly.
 *
 * Each ContainerManager is bound to one {@link IAgentProfile} (repo, compose file,
 * agent name, timeout). The Orchestrator creates one per task.
 *
 * Delegates low-level concerns to:
 * - {@link ComposeClient} — docker compose process spawning and env injection
 * - {@link ICliExecutorFactory} — CLI executor creation based on available credentials
 * - {@link LogSourceRegistry} — standard log source registration
 *
 * 1. **start()** — `docker compose up -d --build`
 * 2. **setup()** — runs the profile's setup script inside the container
 * 3. **execute()** — runs the agent CLI via the selected executor
 * 4. **logs.collectAll()** — pulls all log sources from containers to the local filesystem
 * 5. **stop()** — `docker compose down --volumes --remove-orphans`
 */
export class ContainerManager implements IContainerManager {
  private readonly compose: IComposeClient;
  private readonly executor: ICliExecutor;
  private readonly executorFactory: ICliExecutorFactory;
  private readonly sessionRunner: IAgentSessionRunner;
  private readonly logger: Logger;
  private readonly containerLogger: Logger;
  private readonly profile: IAgentProfile;
  private readonly logRegistry: ILogSourceRegistry;
  private readonly enableContinuation: boolean;
  private _running = false;

  /** Whether the container has been started and not yet stopped. */
  get isRunning(): boolean { return this._running; }

  /** Per-task log collector — manages streaming and collection for all log sources. */
  readonly logs: IContainerLogCollector;

  /** Handles cleanup of workspace paths and log directories inside the container. */
  readonly cleaner: IContainerWorkspaceCleaner;

  /** Filesystem paths specific to the chosen CLI. */
  readonly cliPaths: CliPaths;

  /** Optional callback invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;

  /** Optional callback invoked for each line of real-time pre-tool invocation output. */
  onPreToolUse?: (line: string) => void;

  constructor({
    profile,
    compose,
    executor,
    executorFactory,
    logs,
    cleaner,
    logRegistry,
    sessionRunner,
    logger,
    containerLogger,
    enableContinuation = false,
  }: {
    profile: IAgentProfile;
    compose: IComposeClient;
    executor: ICliExecutor;
    executorFactory: ICliExecutorFactory;
    logs: IContainerLogCollector;
    cleaner: IContainerWorkspaceCleaner;
    logRegistry: ILogSourceRegistry;
    sessionRunner: IAgentSessionRunner;
    logger: Logger;
    containerLogger?: Logger;
    enableContinuation?: boolean;
  }) {
    this.profile = profile;
    this.logger = logger;
    this.containerLogger = containerLogger ?? logger;
    this.compose = compose;
    this.logs = logs;
    this.cleaner = cleaner;
    this.logRegistry = logRegistry;
    this.executor = executor;
    this.executorFactory = executorFactory;
    this.cliPaths = executor.paths;
    this.sessionRunner = sessionRunner;
    this.enableContinuation = enableContinuation;
    this.logger.info(`Using ${profile.cli} CLI`);
  }

  /** Verify that Docker is running. Throws if `docker info` fails. */
  async checkPrerequisites(): Promise<void> {
    await this.compose.checkDocker();
  }

  /** Build and start the containers (`docker compose up -d --build`). */
  async start(): Promise<void> {
    await this.compose.checkDocker();
    this.logger.info(`Starting containers (compose: ${this.profile.composeFile})...`);

    const proc = this.compose.compose(["up", "-d", "--build"]);
    new StreamCapture(proc, this.containerLogger, "build");
    await proc;
    this._running = true;
    this.logger.info("Containers started");
  }

  /**
   * Run the profile's setup script inside the running container.
   *
   * Separated from {@link start} so that callers can register log sources
   * between compose-up and setup. If setup fails (e.g. a dependency install
   * is blocked by the egress proxy), already-registered log sources can
   * still be collected before teardown.
   */
  async setup(): Promise<void> {
    this.logger.info("Running setup script...");
    const setupProc = this.compose.exec(["--user", "vscode", "app", this.profile.setupScript]);
    new StreamCapture(setupProc, this.containerLogger, "setup");
    await setupProc;
    this.logger.info("Setup complete");
  }

  async execInApp(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const result = await this.compose.exec(["--user", "vscode", "app", ...args]);
    return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
  }

  async execInSidecar(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const result = await this.compose.exec(["mcp-sidecar", ...args]);
    return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
  }

  /**
   * Register standard log sources for a task and start streaming.
   *
   * Call after {@link start} when containers are running.
   * Sets up the issue key on the log collector and registers all known log
   * sources (audit, transcript, tool output, proxy).
   *
   * @param taskId Work item id used as the filename prefix for all collected logs.
   */
  registerLogSources(taskId: string, workItemId: string): void {
    this.logRegistry.registerAll(this.logs, this.profile, taskId, workItemId, {
      onToolOutput: this.onToolOutput,
      onPreToolUse: this.onPreToolUse,
    }, this.cliPaths);
  }

  /**
   * Create a CLI executor configured for a specific pipeline stage.
   *
   * For `mode: "container"`, derives a stage-scoped profile and creates an
   * executor via the factory that runs inside the Docker container.
   * For `mode: "local"`, creates a host-side executor that runs the CLI
   * in the orchestrator repo directory. The target repo path is available
   * to the agent via the `{{ repo }}` template variable.
   */
  createExecutorForStage(stage: IStageConfig): ICliExecutor {
    const stageProfile = deriveStageProfile(this.profile, stage);
    switch (stage.mode) {
      case StageMode.Local:
        return this.executorFactory.createLocal(stageProfile, process.cwd(), this.containerLogger);
      case StageMode.Container:
        return this.executorFactory.create(this.compose, stageProfile, this.containerLogger);
      default: {
        const _exhaustive: never = stage.mode;
        throw new Error(`Unknown stage mode: ${_exhaustive}`);
      }
    }
  }

  /**
   * Execute the agent CLI inside the running container.
   *
   * Delegates prompt construction and injection auditing to the {@link PromptBuilder}.
   * Parses the agent's structured `===RALPH_RESULT_START===` block for PR URL
   * and status. Streams stdout/stderr to the logger in real-time.
   *
   * When `maxContinuations > 0`, re-invokes the CLI with `--continue` if the
   * result block is missing, using exponential backoff between attempts.
   *
   * @param workItem Work item to process — used to build the prompt.
   * @param context Pre-fetched issue context (comments, revision handoff). Omit for tasks with no context.
   * @returns Enriched {@link RalphResult} with status, PR URL, and captured output.
   */
  async execute(workItem: WorkItem, context?: IssueContext): Promise<RalphResult> {
    return this.executeWithExecutor(this.executor, workItem, context);
  }

  async executeWithExecutor(executor: ICliExecutor, workItem: WorkItem, context?: IssueContext): Promise<RalphResult> {
    return this.sessionRunner.run(executor, workItem, context, {
      maxContinuations: this.profile.maxContinuations,
      enableContinuation: this.enableContinuation,
    });
  }

  /**
   * Tear down all containers and associated resources.
   *
   * Detaches the log collector, kills any active CLI process, then runs
   * `docker compose down --volumes --remove-orphans`.
   * Falls back to `docker rm -f` if compose fails.
   */
  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    this.logger.info("Stopping containers...");
    this.logs.detach();
    this.executor.killActive();

    try {
      await this.compose.compose(["down", "--volumes", "--remove-orphans"]);
    } catch {
      this.logger.warn("Graceful stop failed, forcing docker rm...");
      for (const service of ["app", "egress-proxy", "mcp-sidecar"]) {
        const name = await this.compose.getContainerName(this.profile.composeProjectLabel, service).catch(() => null);
        if (name) {
          await execa("docker", ["rm", "-f", name]).catch(() => {});
        }
      }
    }

    this.logger.info("Containers stopped");
  }
}
