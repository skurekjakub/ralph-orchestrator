import { execa, type ResultPromise, type Options } from "execa";
import type { RalphConfig, AppConfig } from "../config.js";
import type { JiraIssue } from "../jira/types.js";
import type { ContainerExecResult, RalphResult } from "./types.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** Run devcontainer CLI via npx so the local @devcontainers/cli is preferred */
function devcontainer(args: string[], opts?: Options) {
  return execa("npx", ["--yes", "@devcontainers/cli", ...args], opts);
}

export class ContainerManager {
  private config: RalphConfig;
  private secrets: AppConfig["secrets"];
  private outputConfig: AppConfig["output"];
  private activeProcess: ResultPromise | null = null;

  constructor(appConfig: AppConfig) {
    this.config = appConfig.ralph;
    this.secrets = appConfig.secrets;
    this.outputConfig = appConfig.output;
  }

  /** Check that Docker is running (call before start) */
  async checkPrerequisites(): Promise<void> {
    try {
      await execa("docker", ["info"], { stdio: "ignore" });
    } catch {
      throw new Error(
        "Docker is not running. Start Docker Desktop and try again."
      );
    }
  }

  /** Start the devcontainer */
  async start(): Promise<void> {
    await this.checkPrerequisites();
    console.log("[CONTAINER] Starting devcontainer...");
    await devcontainer([
      "up",
      "--workspace-folder",
      this.config.repoPath,
      "--config",
      join(this.config.repoPath, this.config.devcontainerConfig),
    ]);
    console.log("[CONTAINER] Devcontainer started.");
  }

  /** Execute Ralph inside the container with the given JIRA issue */
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

    // Try to extract PR URL from stdout
    const prUrlMatch = result.stdout.match(
      /Pull Request:\s*(https?:\/\/\S+)/i
    );

    return {
      issueKey: issue.key,
      status,
      durationMs,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      prUrl: prUrlMatch?.[1],
    };
  }

  /** Collect audit logs from the container */
  async collectLogs(issueKey: string): Promise<string | null> {
    mkdirSync(this.outputConfig.logDir, { recursive: true });
    const timestamp = Date.now();
    const localPath = join(
      this.outputConfig.logDir,
      `${issueKey}-${timestamp}.jsonl`
    );

    try {
      // Find the container name
      const containerName = await this.getContainerName();
      await execa("docker", [
        "cp",
        `${containerName}:/workspace/.ralph/logs/audit.jsonl`,
        localPath,
      ]);
      return localPath;
    } catch {
      console.error("[CONTAINER] Failed to collect audit logs.");
      return null;
    }
  }

  /** Collect handoff file from the container */
  async collectHandoff(issueKey: string): Promise<string | null> {
    const handoffDir = join(this.outputConfig.handoffDir, issueKey);
    mkdirSync(handoffDir, { recursive: true });
    const localPath = join(handoffDir, "handoff.md");

    try {
      const containerName = await this.getContainerName();
      await execa("docker", [
        "cp",
        `${containerName}:/workspace/resources/chats/${issueKey}/handoff.md`,
        localPath,
      ]);
      return localPath;
    } catch {
      console.error("[CONTAINER] Failed to collect handoff file.");
      return null;
    }
  }

  /** Stop the devcontainer */
  async stop(): Promise<void> {
    console.log("[CONTAINER] Stopping devcontainer...");

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
      // Use docker compose down to stop the container
      await execa("docker", ["compose", "-f",
        join(this.config.repoPath, ".ralph", "docker-compose.yml"),
        "down",
      ]);
    } catch {
      console.error("[CONTAINER] Graceful stop failed, forcing...");
      const name = await this.getContainerName().catch(() => null);
      if (name) {
        await execa("docker", ["rm", "-f", name]).catch(() => {});
      }
    }

    console.log("[CONTAINER] Devcontainer stopped.");
  }

  /** Clean up the audit log inside the container for the next run */
  async cleanLogs(): Promise<void> {
    try {
      const containerName = await this.getContainerName();
      await execa("docker", [
        "exec",
        containerName,
        "rm",
        "-rf",
        "/workspace/.ralph/logs/",
      ]);
    } catch {
      // non-critical
    }
  }

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
      "--",
      "copilot",
      "--agent",
      this.config.agentName,
      "--experimental",
      "--yolo",
      "-p",
      prompt,
    ];

    try {
      this.activeProcess = devcontainer(args, {
        timeout: this.config.timeoutMs,
      }) as ResultPromise;

      const result = await this.activeProcess;
      this.activeProcess = null;

      return {
        exitCode: result.exitCode ?? 0,
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
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
