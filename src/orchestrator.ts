import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { execa } from "execa";
import type { AppConfig, AgentProfile } from "./config.js";
import { JiraClient } from "./jira/client.js";
import { JiraPoller } from "./jira/poller.js";
import { TaskQueue } from "./queue.js";
import { LogCollector } from "./logs/collector.js";
import { ActivityLog } from "./services/activity-log.js";
import { ProfileRouter } from "./services/profile-router.js";
import type { CommentFetcher } from "./services/profile-router.js";
import { extractAdfText } from "./jira/field-extractor.js";
import { TaskRunner } from "./services/task-runner.js";
import { HeartbeatSender } from "./services/heartbeat.js";
import { ContainerManager } from "./container/manager.js";
import { sleep } from "./retry.js";
import type { JiraIssue } from "./jira/types.js";
import type { OrchestratorState, CompletedTask } from "./orchestrator-types.js";

/**
 * Main orchestration loop.
 *
 * Wires together the JIRA poller, profile router, task runner, and activity log.
 * Processes one JIRA issue at a time:
 *
 * 1. Poll JIRA -> enqueue matching issues
 * 2. Dequeue -> route to matching profile
 * 3. Delegate to TaskRunner (transitions, container, agent, logs)
 * 4. Track completion and emit state updates
 *
 * All heavy lifting is delegated to focused services:
 * - {@link ActivityLog} -- ring buffer + persistent JSONL
 * - {@link ProfileRouter} -- issue -> profile matching
 * - {@link TaskRunner} -- single-issue pipeline
 * - {@link ContainerManager} -- container lifecycle
 */
export class Orchestrator {
  private jiraClient: JiraClient;
  private poller: JiraPoller;
  private queue: TaskQueue;
  private activityLog: ActivityLog;
  private router: ProfileRouter;
  private taskRunner: TaskRunner;
  private heartbeat: HeartbeatSender | null = null;

  private busy = false;
  private running = false;
  /** Unique ID for this orchestrator session — fresh UUID on every startup. */
  private readonly agentId = randomUUID();
  private currentIssue: JiraIssue | null = null;
  private currentProfileId: string | null = null;
  private currentProfile: AgentProfile | null = null;
  private activeContainer: ContainerManager | null = null;
  private workStartedAt: number | null = null;
  private completedToday: CompletedTask[] = [];
  private stateCallback: ((state: OrchestratorState) => void) | null = null;

  constructor(private config: AppConfig) {
    this.activityLog = new ActivityLog(config.output.logDir);
    this.activityLog.onLogChange(() => this.emitState());

    const logger = this.activityLog.createLogger();
    const containerLogger = this.activityLog.createContainerLogger();

    const commentFetcher: CommentFetcher = async (issueKey) => {
      const comments = await this.jiraClient.getComments(issueKey);
      return comments.map((c) => {
        return typeof c.body === "string" ? c.body : extractAdfText(c.body);
      });
    };

    this.router = new ProfileRouter(config.profiles, commentFetcher);

    this.jiraClient = new JiraClient(
      config.jira,
      config.secrets.jiraEmail,
      config.secrets.jiraPat
    );

    this.queue = new TaskQueue();

    this.poller = new JiraPoller(
      this.jiraClient,
      config.jira,
      (issues) => this.onIssuesFound(issues),
      logger
    );

    const logCollector = new LogCollector(config.output);
    this.taskRunner = new TaskRunner(config, this.jiraClient, logCollector, logger, containerLogger);

    if (config.dashboard.enabled) {
      this.heartbeat = new HeartbeatSender(
        config.dashboard.url,
        config.dashboard.secret,
        config.dashboard.intervalMs,
        logger,
      );
    }
  }

  /** Subscribe to state changes for the Ink dashboard. */
  onStateChange(callback: (state: OrchestratorState) => void): void {
    this.stateCallback = callback;
  }

  /** Get current state snapshot. */
  getState(): OrchestratorState {
    return {
      status: !this.running
        ? "stopping"
        : this.busy
          ? "working"
          : "idle",
      currentIssue: this.currentIssue
        ? {
            key: this.currentIssue.key,
            summary: this.currentIssue.fields.summary,
          }
        : null,
      currentProfile: this.currentProfileId,
      startedAt: this.workStartedAt,
      completedToday: [...this.completedToday],
      queueSize: this.queue.size,
      queueItems: this.queue.items,
      logs: this.activityLog.entries,
      orchestratorLogs: this.activityLog.entries.filter((e) => e.source !== "container"),
      containerLogs: this.activityLog.entries.filter((e) => e.source === "container"),
      profileIds: this.router.profileIds,
    };
  }

  /** Start the orchestrator loop. */
  async start(): Promise<void> {
    this.running = true;
    this.poller.start();

    if (this.heartbeat) {
      this.heartbeat.start(() => this.getHeartbeatPayload());
      this.log("Dashboard heartbeat enabled");
    }

    this.emitState();

    this.log("Orchestrator started -- polling JIRA for new tasks");
    this.log(`Agent ID: ${this.agentId}`);
    this.log(`Poll interval: ${this.config.jira.pollIntervalMs / 1000}s`);
    this.log(`JQL queries: ${this.config.jira.jql.length}`);
    this.log(`Agent profiles: ${this.router.profileIds.join(", ")}`);

    while (this.running) {
      if (this.busy) {
        await sleep(5000);
        continue;
      }

      const issue = this.queue.dequeue();
      if (!issue) {
        await sleep(5000);
        continue;
      }

      await this.processIssue(issue);
    }

    this.poller.stop();
    this.log("Orchestrator stopped");
  }

  /** Signal the main loop to stop after the current iteration. */
  stop(): void {
    this.running = false;
    this.emitState();
  }

  /** Full graceful shutdown -- stops poller, kills container if busy, cleans up. */
  async shutdown(): Promise<void> {
    this.log("Shutting down gracefully...");
    this.running = false;
    this.poller.stop();
    this.heartbeat?.stop();
    this.emitState();

    if (this.busy && this.currentProfile) {
      this.log("Task in progress -- stopping container...");
      await this.teardownContainer(this.currentProfile);
    }

    this.log("Shutdown complete");
  }

  /** Process a single issue: route -> run -> track. */
  private async processIssue(issue: JiraIssue): Promise<void> {
    this.busy = true;
    this.currentIssue = issue;
    this.workStartedAt = Date.now();
    this.emitState();

    this.log(`Picked up ${issue.key}: ${issue.fields.summary}`);

    const matchResult = await this.router.match(issue);
    if (!matchResult) {
      this.warn(`No matching profile for ${issue.key} -- skipping`);
      this.resetTaskState(issue.key);
      return;
    }

    const { profile, isRevision } = matchResult;
    this.currentProfileId = profile.id;
    this.currentProfile = profile;
    this.emitState();
    this.log(
      `Matched profile: ${profile.id} (repo: ${profile.repoPath}, agent: ${profile.agentName})${
        isRevision ? " [REVISION]" : ""
      }`
    );

    try {
      this.activityLog.startTaskLog(issue.key);
      const { result, container } = await this.taskRunner.run(issue, profile, isRevision);
      this.activeContainer = container;

      this.completedToday.push({
        key: issue.key,
        summary: issue.fields.summary,
        profileId: profile.id,
        status: result.status,
        durationMs: result.durationMs || Date.now() - (this.workStartedAt ?? Date.now()),
        prUrl: result.prUrl,
        completedAt: Date.now(),
      });

      this.log(
        `Done ${issue.key}: ${result.status} (${Math.round((result.durationMs || 0) / 1000)}s)`
      );

      if (result.status === "completed" || result.status === "partial") {
        await this.taskRunner.transitionToReview(issue.key, profile);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logError(`Error processing ${issue.key}: ${errorMsg}`);

      this.completedToday.push({
        key: issue.key,
        summary: issue.fields.summary,
        profileId: profile.id,
        status: "error",
        durationMs: Date.now() - (this.workStartedAt ?? Date.now()),
        completedAt: Date.now(),
      });

      await this.taskRunner.postErrorComment(issue.key, errorMsg);
    } finally {
      this.activityLog.endTaskLog();
      await this.teardownContainer(profile);
      this.resetTaskState(issue.key);
    }
  }

  /**
   * Guarantee container teardown regardless of how the task ended.
   *
   * First tries a graceful `container.stop()` via the active container reference.
   * If that fails or wasn't available, falls back to a raw `docker compose down`
   * using the profile's compose file path — this catches containers that were
   * started but never returned to the orchestrator (e.g. crash during setup).
   */
  private async teardownContainer(profile: AgentProfile): Promise<void> {
    this.log("Stopping containers...");

    if (this.activeContainer) {
      try {
        await this.activeContainer.stop();
        this.log("Containers stopped");
        return;
      } catch (err) {
        this.warn(
          `Graceful stop failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Fallback: raw docker compose down using the profile's compose file
    const composeFile = resolve(process.cwd(), profile.composeFile);
    try {
      await execa("docker", [
        "compose", "-f", composeFile,
        "down", "--volumes", "--remove-orphans",
      ]);
      this.log("Containers stopped (fallback)");
    } catch (err) {
      this.warn(
        `Fallback teardown failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Reset all per-task state and emit an update. */
  private resetTaskState(issueKey: string): void {
    this.busy = false;
    this.currentIssue = null;
    this.currentProfileId = null;
    this.currentProfile = null;
    this.activeContainer = null;
    this.workStartedAt = null;
    this.queue.markProcessed(issueKey);
    this.emitState();
  }

  private async onIssuesFound(issues: JiraIssue[]): Promise<void> {
    let added = 0;
    for (const issue of issues) {
      const matchResult = await this.router.match(issue);
      const isRevision = matchResult?.isRevision ?? false;
      if (this.queue.enqueue(issue, isRevision)) {
        added++;
        this.log(
          `Enqueued ${issue.key}: ${issue.fields.summary}${isRevision ? " [revision]" : ""}`
        );
      }
    }
    if (added > 0) {
      this.emitState();
    }
  }

  private emitState(): void {
    this.stateCallback?.(this.getState());
  }

  private log(message: string): void {
    this.activityLog.push("info", message);
  }
  private warn(message: string): void {
    this.activityLog.push("warn", message);
  }
  private logError(message: string): void {
    this.activityLog.push("error", message);
  }

  /** Build the heartbeat payload from current state. */
  private getHeartbeatPayload() {
    const lastCompleted = this.completedToday.at(-1);
    return {
      agentId: this.agentId,
      status: (!this.running ? "stopped" : this.busy ? "working" : "polling") as
        "idle" | "working" | "building" | "polling" | "stopped",
      queueSize: this.queue.size,
      currentTask: this.currentIssue?.key ?? null,
      currentTaskStartedAt: this.workStartedAt
        ? new Date(this.workStartedAt).toISOString()
        : null,
      profileId: this.currentProfileId,
      totalProcessed: this.completedToday.length,
      lastCompletedTask: lastCompleted?.key ?? null,
      lastCompletedAt: lastCompleted?.completedAt
        ? new Date(lastCompleted.completedAt).toISOString()
        : null,
    };
  }
}
