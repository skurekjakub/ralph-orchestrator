import { execa } from "execa";
import type { AgentProfile, AppConfig, OutputConfig } from "../config.js";
import type { JiraIssue } from "../jira/types.js";
import type { RalphResult } from "./types.js";
import type { Logger } from "../logger.js";
import { consoleLogger } from "../logger.js";
import { buildPrompt } from "./prompt.js";
import type { IssueContext } from "./prompt.js";
import { parseResultBlock, resolveStatus } from "./result-parser.js";
import { ComposeClient } from "./compose-client.js";
import { CopilotExecutor } from "./copilot-executor.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Manages the full container lifecycle for a single agent profile using
 * `docker compose` directly.
 *
 * Each ContainerManager is bound to one {@link AgentProfile} (repo, compose file,
 * agent name, timeout). The Orchestrator creates one per task.
 *
 * Delegates low-level concerns to:
 * - {@link ComposeClient} — docker compose process spawning and env injection
 * - {@link CopilotExecutor} — Copilot CLI execution with streaming
 *
 * 1. **start()** — `docker compose up -d` + runs the setup script
 * 2. **execute()** — runs the Copilot CLI agent via the executor
 * 3. **collectLogs()** — pulls audit JSONL from the container to the local filesystem
 * 4. **stop()** — `docker compose down --volumes --remove-orphans`
 */
export class ContainerManager {
  private readonly compose: ComposeClient;
  private readonly executor: CopilotExecutor;
  private readonly outputConfig: OutputConfig;
  private readonly logger: Logger;
  private readonly profile: AgentProfile;

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

    const composeFilePath = join(profile.repoPath, profile.composeFile);
    this.compose = new ComposeClient(composeFilePath, {
      secrets: appConfig.secrets,
      jiraBaseUrl: appConfig.jira.baseUrl,
      jiraCloudId: appConfig.jira.cloudId,
    });

    this.executor = new CopilotExecutor(
      this.compose,
      profile,
      containerLogger ?? this.logger,
    );
  }

  /** Verify that Docker is running. Throws if `docker info` fails. */
  async checkPrerequisites(): Promise<void> {
    await this.compose.checkDocker();
  }

  /** Start the containers and run the setup script. */
  async start(): Promise<void> {
    await this.compose.checkDocker();
    this.logger.info("Starting containers...");

    const proc = this.compose.compose(["up", "-d", "--build"]);

    let stdoutBuf = "";
    proc.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutBuf += String(chunk);
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) this.logger.info(`[build] ${trimmed}`);
      }
    });

    let stderrBuf = "";
    proc.stderr?.on("data", (chunk: Buffer | string) => {
      stderrBuf += String(chunk);
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) this.logger.warn(`[build] ${trimmed}`);
      }
    });

    await proc;
    this.logger.info("Containers started");

    this.logger.info("Running setup script...");
    await this.compose.exec(["--user", "vscode", "app", this.profile.setupScript]);
    this.logger.info("Setup complete");
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
      prUrl,
    };
  }

  /**
   * Collect the audit JSONL log from the container and save it locally.
   *
   * Uses `docker compose exec cat` to read the file — must be called before {@link stop}.
   *
   * @param issueKey JIRA key used in the output filename.
   * @returns Local path to the saved JSONL file, or null if collection failed.
   */
  async collectLogs(issueKey: string): Promise<string | null> {
    mkdirSync(this.outputConfig.logDir, { recursive: true });
    const timestamp = Date.now();
    const localPath = join(
      this.outputConfig.logDir,
      `${issueKey}-${timestamp}.jsonl`
    );

    try {
      const result = await this.compose.exec([
        "app", "cat", this.profile.auditLogPath,
      ]);

      const { writeFileSync } = await import("node:fs");
      writeFileSync(localPath, String(result.stdout));
      return localPath;
    } catch {
      this.logger.error("Failed to collect audit logs");
      return null;
    }
  }

  /**
   * Tear down all containers and associated resources.
   *
   * Kills any active copilot process, then runs `docker compose down --volumes --remove-orphans`.
   * Falls back to `docker rm -f` if compose fails.
   */
  async stop(): Promise<void> {
    this.logger.info("Stopping containers...");
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

  /** Delete the audit log directory inside the container to prepare for the next run. */
  async cleanLogs(): Promise<void> {
    const logDir = this.profile.auditLogPath.substring(0, this.profile.auditLogPath.lastIndexOf("/") + 1);
    try {
      await this.compose.exec(["app", "rm", "-rf", logDir]);
    } catch {
      // non-critical
    }
  }
}
