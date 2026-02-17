import { execa } from "execa";
import { resolve } from "node:path";
import type { AgentProfile, AppConfig, OutputConfig } from "../config.js";
import type { JiraIssue } from "../jira/types.js";
import type { RalphResult, CliExecutor } from "./types.js";
import type { Logger } from "../logger.js";
import { consoleLogger } from "../logger.js";
import { buildPrompt } from "./prompt.js";
import type { IssueContext } from "./prompt.js";
import { parseResultBlock, resolveStatus } from "./result-parser.js";
import { ComposeClient } from "./compose-client.js";
import { CopilotExecutor } from "./copilot-executor.js";
import { ClaudeCodeExecutor } from "./claude-code-executor.js";
import { StreamCapture } from "./stream-capture.js";
import { ContainerLogCollector, CaptureMode } from "./log-collector.js";

/**
 * Manages the full container lifecycle for a single agent profile using
 * `docker compose` directly.
 *
 * Each ContainerManager is bound to one {@link AgentProfile} (repo, compose file,
 * agent name, timeout). The Orchestrator creates one per task.
 *
 * Delegates low-level concerns to:
 * - {@link ComposeClient} — docker compose process spawning and env injection
 * - {@link CopilotExecutor} / {@link ClaudeCodeExecutor} — CLI execution with streaming
 *
 * CLI selection: uses the profile's `cli` preference. If the required credential
 * is missing, falls back to the other CLI. If neither credential is available, throws.
 *
 * 1. **start()** — `docker compose up -d` + runs the setup script
 * 2. **execute()** — runs the agent CLI via the selected executor
 * 3. **logs.collectAll()** — pulls all log sources from containers to the local filesystem
 * 4. **stop()** — `docker compose down --volumes --remove-orphans`
 */
export class ContainerManager {
  private readonly compose: ComposeClient;
  private readonly executor: CliExecutor;
  private readonly outputConfig: OutputConfig;
  private readonly logger: Logger;
  private readonly containerLogger: Logger;
  private readonly profile: AgentProfile;

  /** Per-task log collector — manages streaming and collection for all log sources. */
  readonly logs: ContainerLogCollector;

  /** Optional callback invoked for each line of real-time tool output. */
  onToolOutput?: (line: string) => void;

  /**
   * @param profile Agent profile with repo, compose file, agent name, and timeout.
   * @param appConfig Full application config (for shared secrets, jira, output settings).
   * @param logger Logger for orchestrator lifecycle messages. Defaults to {@link consoleLogger}.
   * @param containerLogger Logger for copilot output streaming. Falls back to `logger`.
   */
  constructor(profile: AgentProfile, appConfig: AppConfig, logger?: Logger, containerLogger?: Logger) {
    this.profile = profile;
    this.outputConfig = appConfig.output;
    this.logger = logger ?? consoleLogger;
    this.containerLogger = containerLogger ?? this.logger;

    const composeFilePath = resolve(process.cwd(), profile.composeFile);
    const securityOverlay = resolve(process.cwd(), "shared/security/docker-compose.security.yml");
    this.compose = new ComposeClient([composeFilePath, securityOverlay], {
      secrets: appConfig.secrets,
      jiraBaseUrl: appConfig.jira.baseUrl,
      jiraCloudId: appConfig.jira.cloudId,
      targetRepoPath: profile.repoPath,
    });

    this.logs = new ContainerLogCollector(
      this.compose,
      this.outputConfig.logDir,
      this.logger,
    );

    const cliLogger = containerLogger ?? this.logger;
    this.executor = this.selectExecutor(profile, appConfig, cliLogger);
  }

  /**
   * Select the CLI executor based on profile preference and available credentials.
   *
   * Falls back to the other CLI if the preferred one lacks credentials.
   * Logs the selection and any fallback.
   */
  private selectExecutor(
    profile: AgentProfile,
    appConfig: AppConfig,
    cliLogger: Logger,
  ): CliExecutor {
    const hasCopilot = !!appConfig.secrets.ghToken;
    const hasClaude = !!appConfig.secrets.anthropicApiKey;
    const preferred = profile.cli;

    if (preferred === "claude" && hasClaude) {
      this.logger.info(`Using Claude Code CLI (profile preference)`);
      return new ClaudeCodeExecutor(this.compose, profile, cliLogger);
    }

    if (preferred === "copilot" && hasCopilot) {
      this.logger.info(`Using Copilot CLI (profile preference)`);
      return new CopilotExecutor(this.compose, profile, cliLogger);
    }

    if (preferred === "claude" && !hasClaude && hasCopilot) {
      this.logger.warn(`Claude Code preferred but ANTHROPIC_API_KEY missing — falling back to Copilot CLI`);
      return new CopilotExecutor(this.compose, profile, cliLogger);
    }

    if (preferred === "copilot" && !hasCopilot && hasClaude) {
      this.logger.warn(`Copilot CLI preferred but GH_TOKEN missing — falling back to Claude Code CLI`);
      return new ClaudeCodeExecutor(this.compose, profile, cliLogger);
    }

    throw new Error(`No CLI credentials available. Set GH_TOKEN (Copilot) or ANTHROPIC_API_KEY (Claude Code) in .env`);
  }

  /** Verify that Docker is running. Throws if `docker info` fails. */
  async checkPrerequisites(): Promise<void> {
    await this.compose.checkDocker();
  }

  /** Start the containers and run the setup script. */
  async start(): Promise<void> {
    await this.compose.checkDocker();
    this.logger.info(`Starting containers (compose: ${this.profile.composeFile})...`);

    const proc = this.compose.compose(["up", "-d", "--build"]);
    new StreamCapture(proc, this.containerLogger, "build");
    await proc;
    this.logger.info("Containers started");

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

    this.logs.attach();
  }

  /**
   * Execute the Ralph Copilot CLI agent inside the running container.
   *
   * Parses the agent's structured `===RALPH_RESULT_START===` block for PR URL
   * and status. Streams stdout/stderr to the logger in real-time.
   *
   * @param issue JIRA issue to process — used to build the prompt.
   * @param context Pre-fetched issue context (comments, revision handoff). Omit for tasks with no context.
   * @returns Enriched {@link RalphResult} with status, PR URL, and captured output.
   */
  async execute(issue: JiraIssue, context?: IssueContext): Promise<RalphResult> {
    const prompt = buildPrompt(issue, context);
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

  /** Path to the untruncated tool output log inside the container. */
  static readonly TOOL_OUTPUT_PATH = "/workspace/.ralph/logs/tool-output.log";

  /**
   * Tear down all containers and associated resources.
   *
   * Detaches the log collector, kills any active copilot process, then runs
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
      const name = await this.compose.getContainerName(this.profile.composeProjectLabel, "app").catch(() => null);
      if (name) {
        await execa("docker", ["rm", "-f", name]).catch(() => {});
      }
    }

    this.logger.info("Containers stopped");
  }

  /**
   * Delete the audit log directory inside the container and recreate it
   * with vscode ownership.
   *
   * The parent `/workspace/.ralph/` is created by Docker as root (side effect
   * of the `:ro` hooks volume mount). Without an explicit `mkdir` + `chown`
   * as root, the vscode user cannot write to `/workspace/.ralph/logs/` and
   * the Copilot CLI `--share` transcript export fails with ENOENT.
   */
  async cleanLogs(): Promise<void> {
    const logDir = this.profile.auditLogPath.substring(0, this.profile.auditLogPath.lastIndexOf("/") + 1);
    try {
      await this.compose.exec(["-T", "--user", "root", "app", "rm", "-rf", logDir]);
      await this.compose.exec(["-T", "--user", "root", "app", "mkdir", "-p", logDir]);
      await this.compose.exec(["-T", "--user", "root", "app", "chown", "vscode:vscode", logDir]);
      this.logger.info(`Logs directory ready: ${logDir}`);
    } catch (err) {
      this.logger.warn(`Failed to prepare logs directory: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Delete configured paths inside the container before agent execution.
   *
   * Paths from `profile.cleanPaths` are absolute paths inside the container.
   * Runs as the vscode user — only cleans paths the agent would have created.
   */
  async cleanWorkspacePaths(): Promise<void> {
    const paths = this.profile.cleanPaths;
    if (paths.length === 0) return;

    for (const fullPath of paths) {
      try {
        await this.compose.exec(["-T", "--user", "vscode", "app", "rm", "-rf", fullPath]);
        this.logger.info(`Cleaned: ${fullPath}`);
      } catch (err) {
        this.logger.warn(`Failed to clean ${fullPath}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}
