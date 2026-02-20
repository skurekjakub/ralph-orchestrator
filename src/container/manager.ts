import { execa } from "execa";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentProfile, AppConfig, OutputConfig } from "../config.js";
import type { JiraIssue } from "../jira/types.js";
import type { RalphResult, CliExecutor } from "./types.js";
import type { Logger } from "../logger.js";
import { consoleLogger } from "../logger.js";
import type { PromptBuilder } from "../prompt/prompt-builder.js";
import type { IssueContext } from "../prompt/prompt.js";
import { parseResultBlock, resolveStatus } from "./result-parser.js";
import { ComposeClient } from "./compose-client.js";
import type { IComposeClient } from "./compose-client.js";
import type { ICliExecutorFactory } from "./cli-executor-factory.js";
import { CopilotExecutor } from "./cli-executors/copilot-executor.js";
import { StreamCapture } from "./stream-capture.js";
import { ContainerLogCollector, CaptureMode } from "./log-collector.js";
import type { LogSourceDef, CollectedLog } from "./log-collector.js";
import { ContainerWorkspaceCleaner } from "./workspace-cleaner.js";
import { ComposeFileResolver } from "./setup/compose-files.js";

/** Public contract for log collection on a container. */
export interface IContainerLogs {
  /** Set the JIRA issue key used as the filename prefix. */
  setIssueKey(key: string): void;
  /** Register a log source to be collected. */
  addSource(source: LogSourceDef): void;
  /** Start streaming for all `"stream"` mode sources. */
  attach(): void;
  /** Stop all active streaming processes. */
  detach(): void;
  /** Flush all log sources to disk. */
  collectAll(): Promise<CollectedLog[]>;
}

/** Public contract for workspace cleanup inside a container. */
export interface IContainerCleaner {
  /** Ensure the CLI config directory and its writable subdirectories are owned by vscode. */
  prepareConfigDir(configDir: string, writableDirs: readonly string[]): Promise<void>;
  /** Clear and recreate the audit log directory with vscode ownership. */
  cleanLogDirectory(auditLogPath: string): Promise<void>;
  /** Delete configured workspace paths before agent execution. */
  cleanPaths(paths: readonly string[]): Promise<void>;
}

/** Public contract for container lifecycle management. */
export interface IContainerManager {
  /** Verify that Docker is running. */
  checkPrerequisites(): Promise<void>;
  /** Build and start the containers. */
  start(): Promise<void>;
  /** Run the profile's setup script inside the running container. */
  setup(): Promise<void>;
  /** Register standard log sources for a task and start streaming. */
  registerLogSources(issueKey: string): void;
  /** Execute the agent CLI inside the running container. */
  execute(issue: JiraIssue, context?: IssueContext): Promise<RalphResult>;
  /** Tear down all containers and associated resources. */
  stop(): Promise<void>;
  /** Per-task log collector. */
  readonly logs: IContainerLogs;
  /** Handles cleanup of workspace paths and log directories inside the container. */
  readonly cleaner: IContainerCleaner;
  /** Optional callback invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;
  /** Optional callback invoked for each line of real-time pre-tool invocation output. */
  onPreToolUse?: (line: string) => void;
}

/**
 * Manages the full container lifecycle for a single agent profile using
 * `docker compose` directly.
 *
 * Each ContainerManager is bound to one {@link AgentProfile} (repo, compose file,
 * agent name, timeout). The Orchestrator creates one per task.
 *
 * Delegates low-level concerns to:
 * - {@link ComposeClient} — docker compose process spawning and env injection
 * - {@link ICliExecutorFactory} — CLI executor creation based on available credentials
 * - {@link CopilotExecutor} — CLI execution with streaming
 *
 * 1. **start()** — `docker compose up -d --build`
 * 2. **setup()** — runs the profile's setup script inside the container
 * 3. **execute()** — runs the agent CLI via the selected executor
 * 4. **logs.collectAll()** — pulls all log sources from containers to the local filesystem
 * 5. **stop()** — `docker compose down --volumes --remove-orphans`
 */
export class ContainerManager implements IContainerManager {
  private readonly compose: IComposeClient;
  private readonly executor: CliExecutor;
  private readonly outputConfig: OutputConfig;
  private readonly logger: Logger;
  private readonly containerLogger: Logger;
  private readonly profile: AgentProfile;
  private readonly promptBuilder: PromptBuilder;

  /** Per-task log collector — manages streaming and collection for all log sources. */
  readonly logs: ContainerLogCollector;

  /** Handles cleanup of workspace paths and log directories inside the container. */
  readonly cleaner: ContainerWorkspaceCleaner;

  /** Optional callback invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;

  /** Optional callback invoked for each line of real-time pre-tool invocation output. */
  onPreToolUse?: (line: string) => void;

  /**
   * @param profile Agent profile with repo, compose file, agent name, and timeout.
   * @param appConfig Full application config (for shared secrets, jira, output settings).
   * @param promptBuilder Prompt builder for constructing and auditing CLI prompts.
   * @param executorFactory Factory for creating the CLI executor.
   * @param logger Logger for orchestrator lifecycle messages. Defaults to {@link consoleLogger}.
   * @param containerLogger Logger for CLI output streaming. Falls back to `logger`.
   */
  constructor(profile: AgentProfile, appConfig: AppConfig, promptBuilder: PromptBuilder, executorFactory: ICliExecutorFactory, logger?: Logger, containerLogger?: Logger) {
    this.profile = profile;
    this.outputConfig = appConfig.output;
    this.promptBuilder = promptBuilder;
    this.logger = logger ?? consoleLogger;
    this.containerLogger = containerLogger ?? this.logger;

    const composeFiles = new ComposeFileResolver().resolve(profile);

    const profileSquid = resolve(process.cwd(), "profiles", profile.id, ".build/squid.conf");
    const squidConfPath = existsSync(profileSquid)
      ? profileSquid
      : resolve(process.cwd(), "shared/security/squid.conf");

    this.compose = new ComposeClient(composeFiles, {
      targetRepoPath: profile.repoPath,
      squidConfPath,
    });

    this.logs = new ContainerLogCollector(
      this.compose,
      this.outputConfig.logDir,
      this.logger,
    );

    this.cleaner = new ContainerWorkspaceCleaner(this.compose, this.logger);

    const cliLogger = containerLogger ?? this.logger;
    this.executor = executorFactory.create(this.compose, profile, cliLogger);
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

  /**
   * Register standard log sources for a task and start streaming.
   *
   * Call after {@link start} when containers are running.
   * Sets up the issue key on the log collector and registers all known log
   * sources (audit, transcript, tool output, proxy).
   *
   * @param issueKey JIRA key used as the filename prefix for all collected logs.
   */
  registerLogSources(issueKey: string): void {
    this.logs.setIssueKey(issueKey);

    this.logs.addSource({
      id: "audit",
      service: "app",
      containerPath: this.profile.auditLogPath,
      extension: "jsonl",
      mode: CaptureMode.Collect,
    });

    this.logs.addSource({
      id: "transcript",
      service: "app",
      containerPath: CopilotExecutor.TRANSCRIPT_PATH,
      extension: "md",
      mode: CaptureMode.Collect,
    });

    this.logs.addSource({
      id: "pre-tool",
      service: "app",
      containerPath: ContainerManager.PRE_TOOL_PATH,
      extension: "log",
      mode: this.onPreToolUse ? CaptureMode.Stream : CaptureMode.Collect,
      onLine: this.onPreToolUse,
    });

    this.logs.addSource({
      id: "tool-output",
      service: "app",
      containerPath: ContainerManager.TOOL_OUTPUT_PATH,
      extension: "log",
      mode: this.onToolOutput ? CaptureMode.Stream : CaptureMode.Collect,
      onLine: this.onToolOutput,
    });

    this.logs.addSource({
      id: "proxy",
      service: "egress-proxy",
      containerPath: "/var/log/squid/access.log",
      extension: "log",
      mode: CaptureMode.Collect,
    });

    this.logs.addSource({
      id: "cli-debug",
      service: "app",
      containerPath: CopilotExecutor.LOG_DIR,
      extension: "log",
      mode: CaptureMode.Collect,
      collectArgs: ["sh", "-c", `cat ${CopilotExecutor.LOG_DIR}/*.log 2>/dev/null`],
    });

    this.logs.attach();
  }

  /**
   * Execute the agent CLI inside the running container.
   *
   * Delegates prompt construction and injection auditing to the {@link PromptBuilder}.
   * Parses the agent's structured `===RALPH_RESULT_START===` block for PR URL
   * and status. Streams stdout/stderr to the logger in real-time.
   *
   * @param issue JIRA issue to process — used to build the prompt.
   * @param context Pre-fetched issue context (comments, revision handoff). Omit for tasks with no context.
   * @returns Enriched {@link RalphResult} with status, PR URL, and captured output.
   */
  async execute(issue: JiraIssue, context?: IssueContext): Promise<RalphResult> {
    const { text: prompt } = this.promptBuilder.build(issue, context);

    const startTime = Date.now();

    const result = await this.executor.run(prompt);
    const durationMs = Date.now() - startTime;

    const { prUrl, agentStatus } = parseResultBlock(result.stdout);
    const status = resolveStatus(result.exitCode, result.timedOut, agentStatus);

    return {
      issueKey: issue.key,
      status,
      durationMs,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      collectedLogs: {},
      prUrl,
    };
  }

  /** Path to the pre-tool invocation log inside the container. */
  static readonly PRE_TOOL_PATH = "/workspace/.ralph/logs/pre-tool.log";

  /** Path to the untruncated tool output log inside the container. */
  static readonly TOOL_OUTPUT_PATH = "/workspace/.ralph/logs/tool-output.log";


  /**
   * Tear down all containers and associated resources.
   *
   * Detaches the log collector, kills any active CLI process, then runs
   * `docker compose down --volumes --remove-orphans`.
   * Falls back to `docker rm -f` if compose fails.
   */
  async stop(): Promise<void> {
    this.logger.info("Stopping containers...");
    this.logs.detach();
    this.executor.killActive();

    try {
      await this.compose.compose(["down", "--volumes", "--remove-orphans"]);
    } catch {
      this.logger.warn("Graceful stop failed, forcing docker rm...");
      for (const service of ["app", "egress-proxy"]) {
        const name = await this.compose.getContainerName(this.profile.composeProjectLabel, service).catch(() => null);
        if (name) {
          await execa("docker", ["rm", "-f", name]).catch(() => {});
        }
      }
    }

    this.logger.info("Containers stopped");
  }
}
