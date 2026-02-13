import { execa, type ResultPromise, type Options } from "execa";
import type { RalphConfig, AppConfig } from "../config.js";
import type { JiraIssue } from "../jira/types.js";
import type { ContainerExecResult, RalphResult } from "./types.js";
import type { Logger } from "../logger.js";
import { consoleLogger } from "../logger.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Run devcontainer CLI via npx so the local `@devcontainers/cli` package is used.
 * Never assumes a global installation.
 */
function devcontainer(args: string[], opts?: Options) {
  return execa("npx", ["--yes", "@devcontainers/cli", ...args], opts);
}

/**
 * Manages the full devcontainer lifecycle for a single Ralph execution:
 *
 * 1. **start()** — `devcontainer up` (builds image, runs `setup.sh`, streams progress)
 * 2. **execute()** — `devcontainer exec copilot` (runs the Ralph agent, streams output)
 * 3. **collectLogs()** — Pulls audit JSONL from the container to the local filesystem
 * 4. **stop()** — `docker compose down --volumes --remove-orphans` (tears everything down)
 *
 * All subprocess output is streamed to the provided {@link Logger} in real-time.
 */
export class ContainerManager {
  private config: RalphConfig;
  private secrets: AppConfig["secrets"];
  private outputConfig: AppConfig["output"];
  private jiraBaseUrl: string;
  private jiraCloudId: string;
  private activeProcess: ResultPromise | null = null;
  private logger: Logger;

  /**
   * @param appConfig Full application config (ralph, secrets, jira, output settings).
   * @param logger Logger for streaming build/exec output. Defaults to {@link consoleLogger}.
   */
  constructor(appConfig: AppConfig, logger?: Logger) {
    this.config = appConfig.ralph;
    this.secrets = appConfig.secrets;
    this.outputConfig = appConfig.output;
    this.jiraBaseUrl = appConfig.jira.baseUrl;
    this.jiraCloudId = appConfig.jira.cloudId;
    this.logger = logger ?? consoleLogger;
  }

  /** Verify that Docker is running. Throws if `docker info` fails. */
  async checkPrerequisites(): Promise<void> {
    try {
      await execa("docker", ["info"], { stdio: "ignore" });
    } catch {
      throw new Error(
        "Docker is not running. Start Docker Desktop and try again."
      );
    }
  }

  /** Start the devcontainer (streams build/setup progress to logger). */
  async start(): Promise<void> {
    await this.checkPrerequisites();
    this.logger.info("Starting devcontainer...");

    const proc = devcontainer([
      "up",
      "--workspace-folder",
      this.config.repoPath,
      "--config",
      join(this.config.repoPath, this.config.devcontainerConfig),
    ]);

    // Stream build/setup output to the activity log in real-time
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
    this.logger.info("Devcontainer started");
  }

  /**
   * Execute the Ralph Copilot CLI agent inside the running container.
   *
   * Parses the agent’s structured `===RALPH_RESULT_START===` block for PR URL
   * and status. Streams stdout/stderr to the logger in real-time.
   *
   * @param issue JIRA issue to process — used to build the prompt.
   * @returns Enriched {@link RalphResult} with status, PR URL, and captured output.
   */
  async execute(issue: JiraIssue): Promise<RalphResult> {
    const prompt = this.buildPrompt(issue);
    const startTime = Date.now();

    const result = await this.execInContainer(prompt);
    const durationMs = Date.now() - startTime;

    // Determine status from exit code
    let status: RalphResult["status"];
    if (result.timedOut) {
      status = "partial";
    } else if (result.exitCode === 0) {
      status = "completed";
    } else {
      status = "error";
    }

    // Parse the structured result block (informational only — Ralph handles
    // its own JIRA comments + PR creation; we just log these for the dashboard)
    const resultBlock = result.stdout.match(
      /===RALPH_RESULT_START===([\s\S]*?)===RALPH_RESULT_END===/
    );
    let prUrl: string | undefined;

    if (resultBlock) {
      const prMatch = resultBlock[1].match(/PR_URL:\s*(\S+)/);
      if (prMatch && prMatch[1] !== "none") {
        prUrl = prMatch[1];
      }
      const statusMatch = resultBlock[1].match(/STATUS:\s*(\S+)/);
      if (statusMatch) {
        const agentStatus = statusMatch[1];
        // Prefer agent-reported status over exit code inference
        if (agentStatus === "completed" || agentStatus === "partial" || agentStatus === "blocked") {
          status = agentStatus as RalphResult["status"];
        }
      }
    }

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
   * Uses `devcontainer exec cat` to read the file — must be called before {@link stop}.
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
      // Use devcontainer exec to cat the audit log and write it locally
      const configPath = join(
        this.config.repoPath,
        this.config.devcontainerConfig
      );
      const result = await devcontainer([
        "exec",
        "--workspace-folder",
        this.config.repoPath,
        "--config",
        configPath,
        "--",
        "cat",
        "/workspace/.ralph/logs/audit.jsonl",
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
   * Tear down the devcontainer and all associated resources.
   *
   * Kills any active copilot process, then runs `docker compose down --volumes --remove-orphans`.
   * Falls back to `docker rm -f` if compose fails.
   */
  async stop(): Promise<void> {
    this.logger.info("Stopping devcontainer...");

    // Kill active process if still running
    if (this.activeProcess) {
      try {
        this.activeProcess.kill("SIGTERM");
      } catch {
        // already terminated
      }
      this.activeProcess = null;
    }

    try {
      // devcontainer CLI has no "down" command — use docker compose directly
      await execa("docker", ["compose", "-f",
        join(this.config.repoPath, ".ralph", "docker-compose.yml"),
        "down", "--volumes", "--remove-orphans",
      ]);
    } catch {
      this.logger.warn("Graceful stop failed, forcing docker rm...");
      const name = await this.getContainerName().catch(() => null);
      if (name) {
        await execa("docker", ["rm", "-f", name]).catch(() => {});
      }
    }

    this.logger.info("Devcontainer stopped");
  }

  /** Delete the audit log directory inside the container to prepare for the next run. */
  async cleanLogs(): Promise<void> {
    try {
      const configPath = join(
        this.config.repoPath,
        this.config.devcontainerConfig
      );
      await devcontainer([
        "exec",
        "--workspace-folder",
        this.config.repoPath,
        "--config",
        configPath,
        "--",
        "rm",
        "-rf",
        "/workspace/.ralph/logs/",
      ]);
    } catch {
      // non-critical
    }
  }

  /**
   * Execute the copilot CLI inside the container via `devcontainer exec`.
   *
   * Passes all required environment variables (GH_TOKEN, ADO PATs, JIRA creds)
   * via `--remote-env` flags. Streams stdout/stderr to the logger with `[copilot]` prefix.
   *
   * @param prompt The fully-built prompt string to pass to the Copilot CLI.
   * @returns Raw {@link ContainerExecResult} with exit code and captured output.
   */
  private async execInContainer(
    prompt: string
  ): Promise<ContainerExecResult> {
    const configPath = join(
      this.config.repoPath,
      this.config.devcontainerConfig
    );

    const args = [
      "exec",
      "--workspace-folder",
      this.config.repoPath,
      "--config",
      configPath,
      "--remote-env",
      `GH_TOKEN=${this.secrets.ghToken}`,
      "--remote-env",
      `ADO_PAT_DOCS=${this.secrets.adoPatDocs}`,
      "--remote-env",
      `ADO_MCP_AUTH_TOKEN=${this.secrets.adoPatDocs}`,
      "--remote-env",
      `ADO_PAT_XPERIENCE=${this.secrets.adoPatXperience}`,
      "--remote-env",
      `JIRA_PAT=${this.secrets.jiraPat}`,
      "--remote-env",
      `JIRA_EMAIL=${this.secrets.jiraEmail}`,
      "--remote-env",
      `JIRA_BASE_URL=${this.jiraBaseUrl}`,
      "--remote-env",
      `JIRA_CLOUD_ID=${this.jiraCloudId}`,
      "--",
      "copilot",
      "--agent",
      this.config.agentName,
      "--model",
      "claude-opus-4.6",
      "--hooks-config",
      "/workspace/.github/hooks/ralph-audit.json",
      "--experimental",
      "--yolo",
      "-p",
      prompt,
    ];

    try {
      this.activeProcess = devcontainer(args, {
        timeout: this.config.timeoutMs,
      }) as ResultPromise;

      // Stream stdout/stderr lines to the logger in real-time
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      if (this.activeProcess.stdout) {
        let stdoutBuffer = "";
        this.activeProcess.stdout.on("data", (chunk: Buffer | string) => {
          const text = String(chunk);
          stdoutChunks.push(text);
          stdoutBuffer += text;
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.logger.info(`[copilot] ${trimmed}`);
            }
          }
        });
      }

      if (this.activeProcess.stderr) {
        let stderrBuffer = "";
        this.activeProcess.stderr.on("data", (chunk: Buffer | string) => {
          const text = String(chunk);
          stderrChunks.push(text);
          stderrBuffer += text;
          const lines = stderrBuffer.split("\n");
          stderrBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.logger.warn(`[copilot] ${trimmed}`);
            }
          }
        });
      }

      const result = await this.activeProcess;
      this.activeProcess = null;

      return {
        exitCode: result.exitCode ?? 0,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        timedOut: false,
      };
    } catch (err: unknown) {
      this.activeProcess = null;

      const error = err as {
        exitCode?: number;
        stdout?: string;
        stderr?: string;
        timedOut?: boolean;
      };

      return {
        exitCode: error.exitCode ?? 1,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
        timedOut: error.timedOut ?? false,
      };
    }
  }

  /**
   * Build the Copilot CLI prompt from a JIRA issue.
   *
   * Includes: key, summary, description (ADF serialized as JSON), labels,
   * components, priority, and any long custom field values.
   */
  private buildPrompt(issue: JiraIssue): string {
    const parts: string[] = [
      `JIRA Issue: ${issue.key}`,
      `Title: ${issue.fields.summary}`,
    ];

    if (issue.fields.description) {
      // ADF is complex — serialize as JSON for the agent to parse
      const descStr =
        typeof issue.fields.description === "string"
          ? issue.fields.description
          : JSON.stringify(issue.fields.description, null, 2);
      parts.push(`Description:\n${descStr}`);
    }

    if (issue.fields.labels && issue.fields.labels.length > 0) {
      parts.push(`Labels: ${issue.fields.labels.join(", ")}`);
    }

    if (issue.fields.components && issue.fields.components.length > 0) {
      parts.push(
        `Components: ${issue.fields.components.map((c) => c.name).join(", ")}`
      );
    }

    if (issue.fields.priority) {
      parts.push(`Priority: ${issue.fields.priority.name}`);
    }

    // Scan for acceptance criteria in custom fields
    for (const [key, value] of Object.entries(issue.fields)) {
      if (
        key.startsWith("customfield_") &&
        value &&
        typeof value === "string" &&
        value.length > 10
      ) {
        parts.push(`${key}: ${value}`);
      }
    }

    return parts.join("\n\n");
  }

  /** Look up the running ralph-sandbox app container ID via `docker ps`. */
  private async getContainerName(): Promise<string> {
    const result = await execa("docker", [
      "ps",
      "--filter",
      "label=com.docker.compose.project=ralph-sandbox",
      "--filter",
      "label=com.docker.compose.service=app",
      "-q",
    ]);
    const id = result.stdout.trim();
    if (!id) throw new Error("Ralph container not found");
    return id;
  }
}
