import type { IAgentProfile, IDataSourceConfig, IRalphchivesConfig } from "./config/types.js";
import { TaskStatus } from "./container/types.js";
import { LogLevel, TransitionPhase, type ActiveTask } from "./orchestrator-types.js";
import { OperationStatus, type Operation, type IOperationLedger } from "./services/operation-ledger.js";
import { OrchestratorObserver } from "./orchestrator-observer.js";
import type { WorkItem } from "./datasource/types.js";
import type { IWorkItemPoller } from "./datasource/poller.js";
import { buildTaskContext, type TaskCallbacks } from "./services/task-context.js";
import { toErrorMessage } from "./util/error.js";
import type { IActivityLog } from "./services/activity-log.js";
import type { IProfileRouter } from "./services/profile-router.js";
import type { IIssueManager } from "./services/issue-manager.js";
import type { IResourceManager } from "./services/task-resource-manager.js";
import type { ITaskRunner } from "./services/task-runner.js";
import type { ITriggerScanner } from "./services/trigger-scanner.js";
import type { IHeartbeatSender } from "./services/heartbeat.js";
import type { Logger } from "./logger.js";

/**
 * Main orchestration loop.
 *
 * Wires together the data source pollers, profile router, task runner, and activity log.
 * Processes one work item at a time:
 *
 * 1. Poll data sources -> enqueue matching work items
 * 2. Dequeue -> route to matching profile
 * 3. Delegate to TaskRunner (transitions, container, agent, logs)
 * 4. Track completion and emit state updates
 *
 * The loop is event-driven: it awaits a {@link workSignal} that the
 * pollers and {@link OperationLedger} resolve when new work arrives.
 * No polling / sleep timers inside the loop.
 *
 * All heavy lifting is delegated to focused services:
 * - {@link ActivityLog} -- ring buffer + persistent JSONL
 * - {@link ProfileRouter} -- issue -> profile matching
 * - {@link TaskRunner} -- single-issue pipeline
 */
export class Orchestrator {
  private readonly dataSources: Readonly<Record<string, IDataSourceConfig>>;
  private readonly profiles: readonly IAgentProfile[];
  private readonly activityLog: IActivityLog;
  private readonly pollers: ReadonlyMap<string, IWorkItemPoller>;
  private readonly router: IProfileRouter;
  private readonly issueManager: IIssueManager;
  private readonly resources: IResourceManager;
  private readonly taskRunner: ITaskRunner;
  private readonly triggerScanner: ITriggerScanner;
  private readonly ledger: IOperationLedger;
  private readonly ralphchivesConfig: IRalphchivesConfig;
  private readonly heartbeat: IHeartbeatSender | null;
  private taskCallbacks: TaskCallbacks = {};

  private activeTask: ActiveTask | null = null;
  private running = false;
  readonly observer: OrchestratorObserver;

  /**
   * Resettable promise resolved by the poller / ledger / stop signal.
   * The main loop awaits this instead of sleeping on a fixed interval.
   */
  private workSignalResolve: (() => void) | null = null;

  constructor({
    dataSources,
    profiles,
    activityLog,
    pollers,
    router,
    issueManager,
    resources,
    taskRunner,
    triggerScanner,
    ledger,
    heartbeat,
    ralphchivesConfig,
  }: {
    dataSources: Readonly<Record<string, IDataSourceConfig>>;
    profiles: readonly IAgentProfile[];
    activityLog: IActivityLog;
    pollers: ReadonlyMap<string, IWorkItemPoller>;
    router: IProfileRouter;
    issueManager: IIssueManager;
    resources: IResourceManager;
    taskRunner: ITaskRunner;
    triggerScanner: ITriggerScanner;
    ledger: IOperationLedger;
    heartbeat: IHeartbeatSender | null;
    ralphchivesConfig: IRalphchivesConfig;
    logger?: Logger;
  }) {
    this.dataSources = dataSources;
    this.profiles = profiles;
    this.activityLog = activityLog;
    this.pollers = pollers;
    this.router = router;
    this.issueManager = issueManager;
    this.resources = resources;
    this.taskRunner = taskRunner;
    this.triggerScanner = triggerScanner;
    this.ralphchivesConfig = ralphchivesConfig;
    this.ledger = ledger;
    this.heartbeat = heartbeat;

    this.observer = new OrchestratorObserver(() => ({
      activeTask: this.activeTask,
      running: this.running,
      pendingOps: this.ledger.getAllPending().map((p) => ({
        taskId: p.issueKey,
        variant: p.operation.variant,
      })),
      logEntries: this.activityLog.entries,
      profileIds: this.router.profileIds,
    }));

    this.ledger.onPending(() => this.wakeUp());
    for (const poller of this.pollers.values()) {
      poller.onItems(() => this.wakeUp());
    }
  }

  /** Set callbacks for real-time streaming during task execution. */
  setTaskCallbacks(callbacks: TaskCallbacks): void {
    this.taskCallbacks = callbacks;
  }

  /**
   * Resolve the current work signal, waking the main loop.
   * Safe to call multiple times — only the first resolve has effect.
   */
  private wakeUp(): void {
    this.workSignalResolve?.();
  }

  /** Return a promise that resolves on the next {@link wakeUp} call. */
  private waitForWork(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.workSignalResolve = resolve;
    });
  }

  /** Push state snapshot to all listeners (dashboard, tests, heartbeat). */
  private emitState(): void {
    this.observer.emit();
  }

  /** Start the orchestrator loop. */
  async start(): Promise<void> {
    this.running = true;

    for (const poller of this.pollers.values()) {
      poller.start();
    }

    if (this.heartbeat) {
      this.heartbeat.start(() => this.observer.getHeartbeatPayload());
      this.log("Dashboard heartbeat enabled");
    }

    this.log("Orchestrator started -- polling data sources for new tasks");
    this.log(`Agent ID: ${this.observer.agentId}`);
    this.log(`Data sources: ${Object.keys(this.dataSources).join(", ")}`);
    this.log(`Agent profiles: ${this.router.profileIds.join(", ")}`);

    const recovered = this.ledger.recoverActiveOperations();
    for (const { issueKey, operation } of recovered) {
      this.warn(
        `Recovered crashed operation on ${issueKey} (variant: ${operation.variant}) — marked as error`,
      );
      await this.issueManager.postCrashRecoveryComment(operation.dataSource, issueKey, operation.variant);
    }

    // Tear down any containers abandoned by a previous SIGINT.
    await this.cleanupAbandonedContainers();

    while (this.running) {
      const discovered: WorkItem[] = [];
      for (const poller of this.pollers.values()) {
        discovered.push(...poller.drain());
      }
      if (discovered.length > 0) {
        const planned = await this.triggerScanner.scan(
          discovered,
          this.profiles,
        );
        if (planned > 0) this.emitState();
      }

      const pending = this.ledger.getAllPending();
      if (pending.length === 0) {
        await this.waitForWork();
        continue;
      }

      const next = pending[0];
      await this.executeOperation(next.issueKey, next.operation);
    }

    for (const poller of this.pollers.values()) {
      poller.stop();
    }
    this.log("Orchestrator stopped");
  }

  /** Signal the main loop to stop after the current iteration. */
  stop(): void {
    this.running = false;
    this.wakeUp();
    this.emitState();
  }

  /** Full graceful shutdown -- stops poller, kills container if busy, cleans up. */
  async shutdown(): Promise<void> {
    this.log("Shutting down gracefully...");
    this.running = false;
    for (const poller of this.pollers.values()) {
      poller.stop();
    }
    this.heartbeat?.stop();
    this.wakeUp();
    this.emitState();

    if (this.activeTask) {
      this.log("Task in progress -- stopping container...");
      await this.teardownContainer(this.activeTask.profile);
    }

    this.log("Shutdown complete");
  }

  /**
   * Execute a single pending operation: validate → preflight → agent → record.
   *
   * Each phase is a private method that returns `null` to signal abort.
   * Abort paths handle their own ledger transitions, comments, and state emission.
   */
  private async executeOperation(
    issueKey: string,
    operation: Operation,
  ): Promise<void> {
    const profile = this.resolveProfile(issueKey, operation);
    if (!profile) return;

    const workItem = await this.refreshIssue(issueKey, operation);
    if (!workItem) return;

    if (!this.validateStatusMatch(workItem, profile, operation)) return;

    if (profile.preflight) {
      if (!await this.runPreflight(workItem, profile, operation)) return;
    }

    // Auto-preflight for revision tasks — requires an existing PR and handoff.
    const revisionStatuses = profile.match.revisionStatuses ?? [];
    const itemStatus = workItem.status.toLowerCase();
    const isRevision = revisionStatuses.some(
      (s) => s.toLowerCase() === itemStatus,
    );
    if (isRevision) {
      if (!await this.runPreflight(workItem, profile, operation, "revision-ready")) return;
    }

    await this.runTask(workItem, profile, operation);
  }

  /** Look up the profile for an operation's variant. Returns `null` if the profile no longer exists. */
  private resolveProfile(issueKey: string, operation: Operation): IAgentProfile | null {
    const profile = this.profiles.find(
      (p) => p.variantKey === operation.variant,
    );
    if (!profile) {
      this.log(`Operation on ${issueKey} failed: profile ${operation.variant} no longer exists`);
      this.ledger.transition(operation.dataSource, issueKey, operation.id, OperationStatus.Error, {
        reason: `Profile ${operation.variant} no longer exists`,
      });
      this.emitState();
      return null;
    }
    return profile;
  }

  /** Re-fetch the work item to get its current status. Returns `null` on failure or not found. */
  private async refreshIssue(issueKey: string, operation: Operation): Promise<WorkItem | null> {
    const workItem = await this.issueManager.refreshWorkItem(operation.dataSource, issueKey);
    if (!workItem) {
      this.log(`Operation on ${issueKey} failed: work item not found or unreachable`);
      this.ledger.transition(operation.dataSource, issueKey, operation.id, OperationStatus.Error, {
        reason: "Work item not found or unreachable",
      });
      this.emitState();
      return null;
    }
    return workItem;
  }

  /** Verify the work item's current status still matches the profile. Returns `false` if rejected. */
  private validateStatusMatch(workItem: WorkItem, profile: IAgentProfile, operation: Operation): boolean {
    if (this.router.matchesProjectAndStatus(workItem, profile)) return true;
    this.log(
      `Rejected ${workItem.id}: status "${workItem.status}" no longer matches profile ${profile.displayName}`,
    );
    this.ledger.transition(operation.dataSource, workItem.id, operation.id, OperationStatus.Rejected, {
      reason: `Issue status "${workItem.status}" no longer matches profile`,
    });
    this.issueManager
      .postStaleStatusComment(workItem.source, workItem.id, profile.displayName, workItem.status);
    this.emitState();
    return false;
  }

  /** Run a preflight check. Uses the profile's configured check or an explicit name. Returns `false` if the check fails. */
  private async runPreflight(
    workItem: WorkItem,
    profile: IAgentProfile,
    operation: Operation,
    checkName?: string,
  ): Promise<boolean> {
    const name = checkName ?? profile.preflight!;
    const { buildPreflightContext, runPreflight } =
      await import("./services/preflight.js");
    const comments = await this.issueManager.getComments(workItem.source, workItem.id);
    const ctx = await buildPreflightContext(
      this.resources,
      workItem.source,
      workItem.id,
      comments,
    );
    const result = runPreflight(name, workItem, ctx);
    if (result.ok) return true;

    const comment =
      profile.failureComment ??
      `[Ralph-Orchestrator] ${profile.displayName} can't proceed: ${result.reason}`;
    this.ledger.transition(
      operation.dataSource,
      workItem.id,
      operation.id,
      OperationStatus.Rejected,
      { reason: `preflight:${name} — ${result.reason}` },
    );
    await this.issueManager.postComment(workItem.source, workItem.id, comment);
    this.log(
      `Preflight failed for ${workItem.id} (${name}): ${result.reason}`,
    );
    return false;
  }

  /** Execute the task runner, record completion/error, and handle teardown. */
  private async runTask(
    workItem: WorkItem,
    profile: IAgentProfile,
    operation: Operation,
  ): Promise<void> {
    this.activeTask = {
      workItem,
      profile,
      container: null,
      startedAt: Date.now(),
    };

    this.log(
      `Picked up ${workItem.id}: ${workItem.title} (${operation.variant})`,
    );
    this.ledger.transition(operation.dataSource, workItem.id, operation.id, OperationStatus.Active);

    const taskId = `${workItem.id}-${this.activeTask.startedAt}`;

    try {
      this.activityLog.startTaskLog(taskId);
      const ctx = buildTaskContext(workItem, profile, taskId, this.ralphchivesConfig, operation.triggerParams);
      const { result, container } = await this.taskRunner.run(ctx, this.taskCallbacks);
      this.activeTask.container = container;

      this.observer.recordCompletion({
        key: workItem.id,
        summary: workItem.title,
        profileId: profile.id,
        status: result.status,
        durationMs: result.durationMs || Date.now() - this.activeTask.startedAt,
        prUrl: result.prUrl,
        completedAt: Date.now(),
      });

      this.log(
        `Done ${workItem.id}: ${result.status} (${Math.round((result.durationMs || 0) / 1000)}s)`,
      );

      const isSuccess = result.status === TaskStatus.Completed || result.status === TaskStatus.Partial;

      this.ledger.transition(
        operation.dataSource,
        workItem.id,
        operation.id,
        isSuccess ? OperationStatus.Completed : OperationStatus.Error,
        {
          resultStatus: result.status,
          ...(!isSuccess && { reason: result.stderr || `Agent finished with status: ${result.status}` }),
        },
      );

      if (isSuccess) {
        await this.issueManager.transitionWorkItem(workItem.source, workItem.id, profile.afterAgent?.targetStatus, TransitionPhase.AfterAgent);
      } else {
        await this.issueManager.postErrorComment(
          workItem.source,
          workItem.id,
          result.stderr || `Agent finished with status: ${result.status}`,
        );
      }
    } catch (err) {
      const errorMsg = toErrorMessage(err);
      this.logError(`Error processing ${workItem.id}: ${errorMsg}`);

      this.observer.recordCompletion({
        key: workItem.id,
        summary: workItem.title,
        profileId: profile.id,
        status: TaskStatus.Error,
        durationMs: Date.now() - this.activeTask.startedAt,
        completedAt: Date.now(),
      });

      this.ledger.transition(operation.dataSource, workItem.id, operation.id, OperationStatus.Error, {
        reason: errorMsg,
      });

      await this.issueManager.postErrorComment(workItem.source, workItem.id, errorMsg);
    } finally {
      this.activityLog.endTaskLog();
      await this.teardownContainer(profile);
      this.resetTaskState();
    }
  }

  /** Delegate container teardown to the task runner (graceful stop + fallback). */
  private async teardownContainer(profile: IAgentProfile): Promise<void> {
    this.log("Stopping containers...");
    await this.taskRunner.teardown(profile, this.activeTask?.container ?? null);
    this.log("Containers stopped");
  }

  /**
   * Tear down containers for all profiles on startup.
   *
   * Catches and logs errors per-profile so one stuck profile doesn't block the others.
   */
  private async cleanupAbandonedContainers(): Promise<void> {
    this.log("Cleaning up abandoned containers from previous session...");
    for (const profile of this.profiles) {
      try {
        await this.taskRunner.teardown(profile, null);
      } catch {
        // teardown already logs warnings internally
      }
    }
    this.log("Container cleanup complete...");
  }

  /** Reset all per-task state and emit an update. */
  private resetTaskState(): void {
    this.activeTask = null;
    this.emitState();
  }

  private log(message: string): void {
    this.activityLog.push(LogLevel.Info, message);
    this.emitState();
  }
  private warn(message: string): void {
    this.activityLog.push(LogLevel.Warn, message);
    this.emitState();
  }
  private logError(message: string): void {
    this.activityLog.push(LogLevel.Error, message);
    this.emitState();
  }
}
