import { execa } from "execa";
import { toErrorMessage } from "../util/error";
import { appendFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliContainerLayout, ICliRuntime, ICliRuntimeRegistry } from "../cli/cli-runtime";
import { type CliType, StageMode, type IAgentProfile, type IStageConfig } from "../config/types";
import type { WorkItem } from "../datasource/types";
import { deriveStageProfile, type RalphResult, type StageWorkspace } from "./types";
import type { Logger } from "../logger";
import type { IssueContext } from "../prompt/prompt";
import type { IComposeClient } from "./compose-client";
import type { ICliExecutor, ICliExecutorFactory } from "./cli-executor-factory";
import { StreamCapture } from "./stream-capture";
import type { IContainerLogCollector, CollectedLog } from "./log-collector";
import type { IContainerWorkspaceCleaner } from "./workspace-cleaner";
import type { ILogSourceRegistry } from "./log-source-registry";
import type { IAgentSessionRunner } from "./agent-session-runner";
import { hostWorkspacePath, mountTargetDirs, RALPH_CONTAINER_DIR } from "./workspace-paths";

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
  /** Build and start the containers. Registers a one-time abort listener that stops the container when `signal` fires. */
  start(signal: AbortSignal): Promise<void>;
  /** Run the profile's setup script inside the running container. */
  setup(): Promise<void>;
  /** Execute a command inside the app container as the vscode user. */
  execInApp(args: string[]): Promise<{ stdout: string; stderr: string }>;
  /** Execute a command inside the mcp-sidecar container. */
  execInSidecar(args: string[]): Promise<{ stdout: string; stderr: string }>;
  /** Register standard log sources for a task and start streaming. */
  registerLogSources(taskId: string, workItemId: string, outputDir: string): void;
  /**
   * Run one stage through its executor: build the prompt, run the CLI, continue a session that ended
   * without a result block when the variant allows it, and parse the result under the stage's result
   * contract (`requireResultBlock`).
   */
  executeWithExecutor(
    executor: ICliExecutor,
    stage: IStageConfig,
    workItem: WorkItem,
    context?: IssueContext,
  ): Promise<RalphResult>;
  /**
   * Create the executor of a pipeline stage's CLI, which runs in `workspace`: inside the container for a container
   * stage, on the host for a local one.
   *
   * @throws Error when the stage's agent templates are invalid or lack the stage's agent.
   */
  createExecutorForStage(stage: IStageConfig, workspace: StageWorkspace): Promise<ICliExecutor>;
  /**
   * Whether the audit log holds a `session_start` record for `sessionId`, a session a container stage ran
   * with `cli`. A missing audit log holds none.
   *
   * @returns Undefined when `cli`'s audit records cannot be tied to its session ids.
   * @throws Error when the audit log exists but cannot be read.
   */
  sessionStartAudited(cli: CliType, sessionId: string): Promise<boolean | undefined>;
  /** Tear down all containers and associated resources. */
  stop(): Promise<void>;
  /** Per-task log collector. */
  readonly logs: IContainerLogs;
  /** Handles cleanup of workspace paths and log directories inside the container. */
  readonly cleaner: IContainerWorkspaceCleaner;
  /** Container layouts of the CLIs the variant's container stages run, each once. */
  readonly layouts: readonly CliContainerLayout[];
  /** Optional callback invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;
  /** Optional callback invoked for each line of real-time pre-tool invocation output. */
  onPreToolUse?: (line: string) => void;
}

/**
 * Manages the full container lifecycle for a single agent profile using
 * `docker compose` directly.
 *
 * Each ContainerManager is bound to one {@link IAgentProfile} (compose file, stages,
 * timeout) and one task's workspace. The Orchestrator creates one per task.
 *
 * Delegates low-level concerns to:
 * - {@link ComposeClient} — docker compose process spawning and env injection
 * - {@link ICliExecutorFactory} — the executor of each stage's CLI
 * - {@link LogSourceRegistry} — standard log source registration
 *
 * 1. **start()** — `docker compose up -d --build`
 * 2. **setup()** — runs the profile's setup script inside the container
 * 3. **executeWithExecutor()** — runs one stage's agent CLI through its executor
 * 4. **logs.collectAll()** — pulls all log sources from containers to the local filesystem
 * 5. **stop()** — `docker compose down --volumes --remove-orphans`
 */
export class ContainerManager implements IContainerManager {
  private readonly compose: IComposeClient;
  private readonly executorFactory: ICliExecutorFactory;
  private readonly sessionRunner: IAgentSessionRunner;
  private readonly logger: Logger;
  private readonly containerLogger: Logger;
  private readonly profile: IAgentProfile;
  /** The task's workspace on the host, bind-mounted at `/workspace`. */
  private readonly workspacePath: string;
  private readonly logRegistry: ILogSourceRegistry;
  private readonly enableContinuation: boolean;
  private readonly cliRuntimes: ICliRuntimeRegistry;
  /** Runtimes of the CLIs the variant's container stages run. */
  private readonly containerRuntimes: readonly ICliRuntime[];
  /** The executor of the stage that runs or ran last, killed on stop. */
  private activeExecutor: ICliExecutor | null = null;
  private _running = false;

  /** Whether the container has been started and not yet stopped. */
  get isRunning(): boolean {
    return this._running;
  }

  /** Per-task log collector — manages streaming and collection for all log sources. */
  readonly logs: IContainerLogCollector;

  /** Handles cleanup of workspace paths and log directories inside the container. */
  readonly cleaner: IContainerWorkspaceCleaner;

  /** Optional callback invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;

  /** Optional callback invoked for each line of real-time pre-tool invocation output. */
  onPreToolUse?: (line: string) => void;

  constructor({
    profile,
    workspacePath,
    compose,
    cliRuntimes,
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
    workspacePath: string;
    compose: IComposeClient;
    cliRuntimes: ICliRuntimeRegistry;
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
    this.workspacePath = workspacePath;
    this.logger = logger;
    this.containerLogger = containerLogger ?? logger;
    this.compose = compose;
    this.logs = logs;
    this.cleaner = cleaner;
    this.logRegistry = logRegistry;
    this.executorFactory = executorFactory;
    this.sessionRunner = sessionRunner;
    this.enableContinuation = enableContinuation;
    this.cliRuntimes = cliRuntimes;
    this.containerRuntimes = cliRuntimes.forClis(profile.containerClis);
  }

  get layouts(): readonly CliContainerLayout[] {
    return this.containerRuntimes.map((runtime) => runtime.layout);
  }

  /** Verify that Docker is running. Throws if `docker info` fails. */
  async checkPrerequisites(): Promise<void> {
    await this.compose.checkDocker();
  }

  /**
   * Build and start the containers (`docker compose up -d --build`).
   *
   * Creates `.ralph/`, each CLI home and every directory the CLIs mount into in the workspace on the host
   * first. Docker creates a mount point's missing parent directories as root, and the host could then not
   * delete the workspace once the task is done.
   */
  async start(signal: AbortSignal): Promise<void> {
    await this.compose.checkDocker();
    const mountTargets = this.containerRuntimes.flatMap((runtime) => runtime.workspaceMountTargets);
    const dirs = [
      RALPH_CONTAINER_DIR,
      ...this.layouts.map((layout) => layout.configDir),
      ...mountTargetDirs(mountTargets),
    ];
    for (const dir of dirs) {
      mkdirSync(hostWorkspacePath(this.workspacePath, dir), { recursive: true });
    }
    this.logger.info(`Starting containers (compose: ${this.profile.composeFile})...`);

    const proc = this.compose.compose(["up", "-d", "--build"]);
    new StreamCapture(proc, this.containerLogger, "build");
    await proc;
    this._running = true;
    this.logger.info("Containers started");

    // Self-terminate when the orchestrator aborts the task signal (e.g. SIGINT).
    // This removes the need for the orchestrator to hold a container reference
    // for shutdown — the signal is the single coordination mechanism.
    signal.addEventListener(
      "abort",
      () => {
        void this.stop().catch((err) => {
          this.logger.warn(`Abort-triggered stop failed: ${toErrorMessage(err)}`);
        });
      },
      { once: true },
    );
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
   * Sets up the issue key on the log collector and registers the common log sources plus those of each
   * CLI the variant's container stages run.
   *
   * @param taskId Work item id used as the filename prefix for all collected logs.
   */
  registerLogSources(taskId: string, workItemId: string, outputDir: string): void {
    const debugLogPath = join(outputDir, `${taskId}-cli-debug-stream.log`);

    this.logRegistry.registerAll(
      this.logs,
      this.profile,
      taskId,
      workItemId,
      {
        onToolOutput: this.onToolOutput,
        onPreToolUse: this.onPreToolUse,
        onCliDebug: (line) => {
          appendFileSync(debugLogPath, line + "\n");
        },
      },
      this.containerRuntimes,
    );
  }

  /**
   * For `mode: "container"`, the executor runs the CLI inside the Docker container. For `mode: "local"`, it runs
   * the CLI on the host in the stage's own workspace; the task's workspace path is available to the agent via the
   * `{{ repo }}` template variable.
   */
  async createExecutorForStage(stage: IStageConfig, workspace: StageWorkspace): Promise<ICliExecutor> {
    const stageProfile = deriveStageProfile(this.profile, stage);
    this.logger.info(`Stage ${stage.role}: ${stage.cli} CLI (${stage.mode}), agent ${stage.agent}`);
    switch (workspace.mode) {
      case StageMode.Local:
        return this.executorFactory.createLocal(stageProfile, stage, workspace, this.containerLogger);
      case StageMode.Container:
        return this.executorFactory.create(this.compose, stageProfile, stage, this.containerLogger);
    }
  }

  /**
   * Run one stage through `executor` and the session runner, which builds and audits the prompt, parses
   * the agent's `===RALPH_RESULT_START===` block and, when the stage requires one, `maxContinuations > 0`
   * and continuation is enabled, resumes a session that ended without one, with exponential backoff
   * between attempts. `executor` becomes the one {@link stop} kills.
   *
   * @param context Pre-fetched issue context (comments, revision handoff). Omit for tasks with no context.
   */
  async executeWithExecutor(
    executor: ICliExecutor,
    stage: IStageConfig,
    workItem: WorkItem,
    context?: IssueContext,
  ): Promise<RalphResult> {
    this.activeExecutor = executor;
    return this.sessionRunner.run(executor, workItem, context, {
      maxContinuations: this.profile.maxContinuations,
      enableContinuation: this.enableContinuation,
      requireResultBlock: stage.requireResultBlock,
    });
  }

  async sessionStartAudited(cli: CliType, sessionId: string): Promise<boolean | undefined> {
    const auditPath = hostWorkspacePath(this.workspacePath, this.profile.auditLogPath);
    const audit = await readFile(auditPath, "utf-8").catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return "";
      throw err;
    });
    return this.cliRuntimes.get(cli).sessionStartAudited(audit, sessionId);
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
    this.activeExecutor?.killActive();

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
