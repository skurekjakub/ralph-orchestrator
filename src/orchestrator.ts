import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { execa } from "execa";
import type { AppConfig, AgentProfile } from "./config.js";
import { JiraClient } from "./jira/client.js";
import { JiraPoller } from "./jira/poller.js";
import { LogCollector } from "./logs/collector.js";
import { ActivityLog } from "./services/activity-log.js";
import { ProfileRouter } from "./services/profile-router.js";
import { extractAdfText } from "./jira/field-extractor.js";
import { TaskRunner } from "./services/task-runner.js";
import { HeartbeatSender } from "./services/heartbeat.js";
import { OperationLedger, OperationStatus } from "./services/operation-ledger.js";
import type { Operation } from "./services/operation-ledger.js";
import { OrchestratorComments } from "./services/orchestrator-comments.js";
import { ContainerManager } from "./container/manager.js";
import { sleep } from "./retry.js";
import type { JiraIssue, JiraComment } from "./jira/types.js";
import type { OrchestratorState, CompletedTask } from "./orchestrator-types.js";

/** Flattened trigger: one trigger comment matched to one variant. */
interface DiscoveredTrigger {
  issue: JiraIssue;
  profile: AgentProfile;
  comment: JiraComment;
  commentText: string;
}

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
  private activityLog: ActivityLog;
  private router: ProfileRouter;
  private taskRunner: TaskRunner;
  private ledger: OperationLedger;
  private heartbeat: HeartbeatSender | null = null;

  /** Issues discovered in the latest poll cycle, awaiting comment scanning. */
  private discoveredIssues: JiraIssue[] = [];

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

    this.router = new ProfileRouter(config.profiles);

    this.jiraClient = new JiraClient(
      config.jira,
      config.secrets.jiraEmail,
      config.secrets.jiraPat
    );

    this.poller = new JiraPoller(
      this.jiraClient,
      config.jira,
      (issues) => this.onIssuesFound(issues),
      logger
    );

    const logCollector = new LogCollector(config.output);
    this.taskRunner = new TaskRunner(config, this.jiraClient, logCollector, logger, containerLogger);
    this.ledger = new OperationLedger(join(config.output.logDir, "history"));

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
    const pendingOps = this.ledger.getAllPending();
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
      queueSize: pendingOps.length,
      queueItems: pendingOps.map((p) => ({
        key: p.issueKey,
        summary: p.operation.variant,
      })),
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

    const recovered = this.ledger.recoverActiveOperations();
    for (const { issueKey, operation } of recovered) {
      this.warn(
        `Recovered crashed operation on ${issueKey} (variant: ${operation.variant}) — marked as error`
      );
      await this.jiraClient.addComment(
        issueKey,
        OrchestratorComments.crashRecovery(operation.variant.split(":")[1])
      ).catch(() => {});
    }

    while (this.running) {
      if (this.busy) {
        await sleep(5000);
        continue;
      }

      if (this.discoveredIssues.length > 0) {
        const issues = this.discoveredIssues.splice(0);
        await this.scanForTriggers(issues);
      }

      const pending = this.ledger.getAllPending();
      if (pending.length === 0) {
        await sleep(5000);
        continue;
      }

      const next = pending[0];
      await this.executeOperation(next.issueKey, next.operation);
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

  /**
   * Scan polled issues for trigger comments and plan operations in the ledger.
   *
   * For each issue, fetches comments once, then checks each variant's
   * commentTrigger against the comments. Unconsumed triggers get planned
   * as pending operations; already-consumed triggers are skipped.
   */
  private async scanForTriggers(issues: JiraIssue[]): Promise<void> {
    let planned = 0;

    for (const issue of issues) {
      let comments: JiraComment[] | null = null;

      for (const profile of this.config.profiles) {
        const trigger = profile.match.commentTrigger;
        if (!trigger) continue;

        if (!this.router.matchesProjectAndStatus(issue, profile)) continue;

        if (!comments) {
          try {
            comments = await this.jiraClient.getComments(issue.key);
          } catch (err) {
            this.warn(
              `Failed to fetch comments for ${issue.key}: ${err instanceof Error ? err.message : String(err)}`
            );
            comments = [];
          }
        }

        const variant = `${profile.id}:${profile.agentName}`;
        const consumedIds = this.ledger.getConsumedTriggerIds(issue.key, variant);

        for (const comment of comments) {
          if (consumedIds.has(comment.id)) continue;

          const text = typeof comment.body === "string"
            ? comment.body
            : extractAdfText(comment.body);

          if (!text.toLowerCase().includes(trigger.toLowerCase())) continue;

          this.ledger.plan(issue.key, {
            variant,
            triggerCommentId: comment.id,
            commentTimestamp: comment.created,
          });

          planned++;
          this.log(
            `Planned ${variant} on ${issue.key} (trigger comment ${comment.id})`
          );

          await this.jiraClient.addComment(
            issue.key,
            OrchestratorComments.ack(profile.agentName)
          ).catch((err) => {
            this.warn(`Failed to post ack comment on ${issue.key}: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
      }
    }

    if (planned > 0) this.emitState();
  }

  /**
   * Execute a single pending operation: transition → agent → record result.
   *
   * Re-validates the issue's current JIRA status before executing — if the
   * status changed since planning, the operation is rejected.
   */
  private async executeOperation(issueKey: string, operation: Operation): Promise<void> {
    const profile = this.config.profiles.find(
      (p) => `${p.id}:${p.agentName}` === operation.variant
    );
    if (!profile) {
      this.ledger.transition(issueKey, operation.id, OperationStatus.Error, {
        reason: `Profile ${operation.variant} no longer exists`,
      });
      return;
    }

    let issue: JiraIssue;
    try {
      const results = await this.jiraClient.searchIssues(`key = ${issueKey}`, 1);
      if (results.length === 0) {
        this.ledger.transition(issueKey, operation.id, OperationStatus.Error, {
          reason: "Issue not found in JIRA",
        });
        return;
      }
      issue = results[0];
    } catch (err) {
      this.ledger.transition(issueKey, operation.id, OperationStatus.Error, {
        reason: `Failed to fetch issue: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (!this.router.matchesProjectAndStatus(issue, profile)) {
      this.ledger.transition(issueKey, operation.id, OperationStatus.Rejected, {
        reason: `Issue status "${issue.fields.status.name}" no longer matches profile`,
      });
      await this.jiraClient.addComment(
        issueKey,
        OrchestratorComments.staleStatus(profile.agentName, issue.fields.status.name)
      ).catch(() => {});
      return;
    }

    if (profile.preflight) {
      const { buildPreflightContext, runPreflight } = await import("./services/preflight.js");
      const comments = await this.jiraClient.getComments(issueKey).catch(() => []);
      const ctx = await buildPreflightContext(this.jiraClient, issueKey, comments);
      const result = runPreflight(profile.preflight, issue, ctx);
      if (!result.ok) {
        const comment = profile.failureComment
          ?? `[Ralph-Orchestrator] ${profile.agentName} can't proceed: ${result.reason}`;
        this.ledger.transition(issueKey, operation.id, OperationStatus.Rejected, {
          reason: `preflight:${profile.preflight} — ${result.reason}`,
        });
        await this.jiraClient.addComment(issueKey, comment).catch(() => {});
        this.log(`Preflight failed for ${issue.key} (${profile.preflight}): ${result.reason}`);
        return;
      }
    }

    this.busy = true;
    this.currentIssue = issue;
    this.currentProfileId = profile.id;
    this.currentProfile = profile;
    this.workStartedAt = Date.now();
    this.emitState();

    this.log(`Picked up ${issue.key}: ${issue.fields.summary} (${operation.variant})`);
    this.ledger.transition(issueKey, operation.id, OperationStatus.Active);

    try {
      this.activityLog.startTaskLog(issue.key);
      const { result, container } = await this.taskRunner.run(issue, profile);
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

      this.ledger.transition(issueKey, operation.id, OperationStatus.Completed, {
        resultStatus: result.status,
      });

      if (result.status === "completed" || result.status === "partial") {
        await this.taskRunner.transitionAfterAgent(issue.key, profile);
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

      this.ledger.transition(issueKey, operation.id, OperationStatus.Error, {
        reason: errorMsg,
      });

      await this.taskRunner.postErrorComment(issue.key, errorMsg);
    } finally {
      this.activityLog.endTaskLog();
      await this.teardownContainer(profile);
      this.resetTaskState();
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
  private resetTaskState(): void {
    this.busy = false;
    this.currentIssue = null;
    this.currentProfileId = null;
    this.currentProfile = null;
    this.activeContainer = null;
    this.workStartedAt = null;
    this.emitState();
  }

  /**
   * Poller callback — stashes discovered issues for the main loop to scan.
   * Comment fetching happens in the main loop (not inside the poller callback)
   * so we don't block the poller with many sequential API calls.
   */
  private async onIssuesFound(issues: JiraIssue[]): Promise<void> {
    this.discoveredIssues.push(...issues);
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
      queueSize: this.ledger.getAllPending().length,
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
