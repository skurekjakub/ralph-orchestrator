import type { IAgentProfile, IDataSourceConfig, IOutputConfig, IRalphchivesConfig } from "./config/types.js";
import { TaskStatus } from "./container/types.js";
import { LogLevel, TransitionPhase, type ActiveTask } from "./orchestrator-types.js";
import { OperationStatus, type Operation, type IOperationLedger } from "./services/operation-ledger.js";
import { OrchestratorObserver } from "./orchestrator-observer.js";
import type { WorkItem } from "./datasource/types.js";
import type { IWorkItemPoller } from "./datasource/poller.js";
import { buildTaskContext, type TaskCallbacks } from "./services/task-context.js";
import type { PreflightContext } from "./services/preflight.js";
import { toErrorMessage } from "./util/error.js";
import type { IActivityLog } from "./services/activity-log.js";
import type { IProfileRouter } from "./services/profile-router.js";
import type { IIssueManager } from "./services/issue-manager.js";
import type { IResourceManager } from "./services/task-resource-manager.js";
import type { ITaskRunner } from "./services/task-runner.js";
import type { ITriggerScanner } from "./services/trigger-scanner.js";
import type { IVcsSourceClient } from "./services/vcs-source-client.js";
import type { IHeartbeatSender } from "./services/heartbeat.js";
import type { Logger } from "./logger.js";

/** Everything the pre-activation phases resolved for an operation that is cleared to run. */
interface PreparedOperation {
  profile: IAgentProfile;
  workItem: WorkItem;
  /** Set only for revision tasks, which run the `revision-ready` preflight. */
  revisionPreflightCtx: PreflightContext | null;
}

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
  private readonly vcsSourceClient: IVcsSourceClient;
  private readonly taskRunner: ITaskRunner;
  private readonly triggerScanner: ITriggerScanner;
  private readonly ledger: IOperationLedger;
  private readonly ralphchivesConfig: IRalphchivesConfig;
  private readonly outputConfig: IOutputConfig;
  private readonly heartbeat: IHeartbeatSender | null;
  private taskCallbacks: TaskCallbacks = {};

  private activeTask: ActiveTask | null = null;
  private running = false;
  private readonly abortController = new AbortController();
  /** Tracks the in-flight operation so shutdown() can await its teardown. */
  private activeOperationPromise: Promise<void> | null = null;
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
    vcsSourceClient,
    taskRunner,
    triggerScanner,
    ledger,
    heartbeat,
    ralphchivesConfig,
    outputConfig,
  }: {
    dataSources: Readonly<Record<string, IDataSourceConfig>>;
    profiles: readonly IAgentProfile[];
    activityLog: IActivityLog;
    pollers: ReadonlyMap<string, IWorkItemPoller>;
    router: IProfileRouter;
    issueManager: IIssueManager;
    resources: IResourceManager;
    vcsSourceClient: IVcsSourceClient;
    taskRunner: ITaskRunner;
    triggerScanner: ITriggerScanner;
    ledger: IOperationLedger;
    heartbeat: IHeartbeatSender | null;
    ralphchivesConfig: IRalphchivesConfig;
    outputConfig: IOutputConfig;
    logger?: Logger;
  }) {
    this.dataSources = dataSources;
    this.profiles = profiles;
    this.activityLog = activityLog;
    this.pollers = pollers;
    this.router = router;
    this.issueManager = issueManager;
    this.resources = resources;
    this.vcsSourceClient = vcsSourceClient;
    this.taskRunner = taskRunner;
    this.triggerScanner = triggerScanner;
    this.ralphchivesConfig = ralphchivesConfig;
    this.outputConfig = outputConfig;
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
      this.warn(`Recovered crashed operation on ${issueKey} (variant: ${operation.variant}) — marked as error`);
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
        const planned = await this.triggerScanner.scan(discovered, this.profiles);
        if (planned > 0) this.emitState();
      }

      const pending = this.ledger.getAllPending();
      if (pending.length === 0) {
        await this.waitForWork();
        continue;
      }

      const next = pending[0];
      this.activeOperationPromise = this.executeOperation(next.issueKey, next.operation);
      await this.activeOperationPromise;
      this.activeOperationPromise = null;
    }

    this.log("Orchestrator stopped");
  }

  /** Signal the main loop to stop after the current iteration. */
  stop(): void {
    this.running = false;
    for (const poller of this.pollers.values()) {
      poller.stop();
    }
    this.wakeUp();
    this.emitState();
  }

  /** Full graceful shutdown -- stops poller, kills container if busy, cleans up. */
  async shutdown(): Promise<void> {
    this.log("Shutting down gracefully...");
    this.running = false;
    // Aborting the signal causes the running container to stop itself via the
    // listener registered in ContainerManager.start() — no direct container
    // reference needed here.
    this.abortController.abort();
    for (const poller of this.pollers.values()) {
      poller.stop();
    }
    this.heartbeat?.stop();
    this.wakeUp();

    // Wait for the active operation to finish its teardown (finally block
    // calls teardownContainer → compose down). Without this, process.exit()
    // kills the process while compose down is still in flight, orphaning
    // containers.
    if (this.activeOperationPromise) {
      try {
        await this.activeOperationPromise;
      } catch {
        // Operation may throw — we only need the teardown to complete.
      }
    }

    this.emitState();
    this.log("Shutdown complete");
  }

  /**
   * Execute a single pending operation: validate → preflight → agent → record.
   *
   * Each phase is a private method that returns `null` to signal abort.
   * Abort paths handle their own ledger transitions, comments, and state emission.
   * An exception thrown before activation is recorded as `pending → error`.
   */
  private async executeOperation(issueKey: string, operation: Operation): Promise<void> {
    let prepared: PreparedOperation | null;
    try {
      prepared = await this.prepareOperation(issueKey, operation);
    } catch (err) {
      // Escaping here would reject start() with the operation still pending, and
      // getAllPending() would hand the same operation back first on every restart.
      this.failPendingOperation(issueKey, operation, toErrorMessage(err));
      return;
    }
    if (!prepared) return;

    await this.runTask(prepared.workItem, prepared.profile, operation, prepared.revisionPreflightCtx);
  }

  /**
   * Run every pre-activation phase for a pending operation.
   * Returns `null` when a phase has already recorded a terminal ledger state.
   */
  private async prepareOperation(issueKey: string, operation: Operation): Promise<PreparedOperation | null> {
    const profile = this.resolveProfile(issueKey, operation);
    if (!profile) return null;

    const workItem = await this.refreshIssue(issueKey, operation);
    if (!workItem) return null;

    if (!this.validateStatusMatch(workItem, profile, operation)) return null;

    if (profile.preflight) {
      if (!(await this.runPreflight(workItem, profile, operation))) return null;
    }

    // Auto-preflight for revision tasks — requires an existing PR and handoff.
    const revisionStatuses = profile.match.revisionStatuses ?? [];
    const itemStatus = workItem.status.toLowerCase();
    const isRevision = revisionStatuses.some((s) => s.toLowerCase() === itemStatus);
    let revisionPreflightCtx: PreflightContext | null = null;
    if (isRevision) {
      revisionPreflightCtx = await this.runPreflight(workItem, profile, operation, "revision-ready");
      if (!revisionPreflightCtx) return null;
    }

    return { profile, workItem, revisionPreflightCtx };
  }

  /**
   * Record that a pending operation could not be started (`pending → error`).
   * The terminal state keeps the trigger consumed and removes the operation from the pending queue.
   */
  private failPendingOperation(issueKey: string, operation: Operation, reason: string): void {
    // Persist first so the state emitted by logError no longer lists the operation as pending.
    this.ledger.transition(operation.dataSource, issueKey, operation.id, OperationStatus.Error, { reason });
    this.logError(`Operation on ${issueKey} failed before activation: ${reason}`);
  }

  /** Look up the profile for an operation's variant. Returns `null` if the profile no longer exists. */
  private resolveProfile(issueKey: string, operation: Operation): IAgentProfile | null {
    const profile = this.profiles.find((p) => p.variantKey === operation.variant);
    if (!profile) {
      this.failPendingOperation(issueKey, operation, `Profile ${operation.variant} no longer exists`);
      return null;
    }
    return profile;
  }

  /** Re-fetch the work item to get its current status. Returns `null` on failure or not found. */
  private async refreshIssue(issueKey: string, operation: Operation): Promise<WorkItem | null> {
    const workItem = await this.issueManager.refreshWorkItem(operation.dataSource, issueKey);
    if (!workItem) {
      this.failPendingOperation(issueKey, operation, "Work item not found or unreachable");
      return null;
    }
    return workItem;
  }

  /** Verify the work item's current status still matches the profile. Returns `false` if rejected. */
  private validateStatusMatch(workItem: WorkItem, profile: IAgentProfile, operation: Operation): boolean {
    if (this.router.matchesProjectAndStatus(workItem, profile)) return true;
    this.log(`Rejected ${workItem.id}: status "${workItem.status}" no longer matches profile ${profile.displayName}`);
    this.ledger.transition(operation.dataSource, workItem.id, operation.id, OperationStatus.Rejected, {
      reason: `Issue status "${workItem.status}" no longer matches profile`,
    });
    this.issueManager.postStaleStatusComment(workItem.source, workItem.id, profile.displayName, workItem.status);
    this.emitState();
    return false;
  }

  /** Run a preflight check. Returns the {@link PreflightContext} on success, or `null` if the check fails. */
  private async runPreflight(
    workItem: WorkItem,
    profile: IAgentProfile,
    operation: Operation,
    checkName?: string,
  ): Promise<PreflightContext | null> {
    const name = checkName ?? profile.preflight!;
    const { buildPreflightContext, runPreflight } = await import("./services/preflight.js");
    const comments = await this.issueManager.getComments(workItem.source, workItem.id);
    const ctx = await buildPreflightContext(
      this.resources,
      this.vcsSourceClient,
      profile,
      this.activityLog.createLogger(),
      workItem.source,
      workItem.id,
      comments,
    );
    const result = runPreflight(name, workItem, ctx);
    if (result.ok) return ctx;

    const comment =
      profile.failureComment ?? `[Ralph-Orchestrator] ${profile.displayName} can't proceed: ${result.reason}`;
    this.ledger.transition(operation.dataSource, workItem.id, operation.id, OperationStatus.Rejected, {
      reason: `preflight:${name} — ${result.reason}`,
    });
    await this.issueManager.postComment(workItem.source, workItem.id, comment);
    this.log(`Preflight failed for ${workItem.id} (${name}): ${result.reason}`);
    return null;
  }

  /** Execute the task runner, record completion/error, and handle teardown. */
  private async runTask(
    workItem: WorkItem,
    profile: IAgentProfile,
    operation: Operation,
    preflightCtx?: PreflightContext | null,
  ): Promise<void> {
    this.activeTask = {
      workItem,
      profile,
      startedAt: Date.now(),
    };

    this.log(`Picked up ${workItem.id}: ${workItem.title} (${operation.variant})`);
    this.ledger.transition(operation.dataSource, workItem.id, operation.id, OperationStatus.Active);

    const taskId = `${workItem.id}-${this.activeTask.startedAt}`;

    try {
      this.activityLog.startTaskLog(taskId);
      const ctx = buildTaskContext(
        workItem,
        profile,
        taskId,
        this.ralphchivesConfig,
        operation.triggerParams,
        preflightCtx?.prUrl,
        preflightCtx?.prBranches ?? null,
        this.outputConfig.logDir,
        this.abortController.signal,
        this.taskCallbacks.onToolOutput,
        this.taskCallbacks.onPreToolUse,
      );
      const result = await this.taskRunner.run(ctx);

      this.observer.recordCompletion({
        key: workItem.id,
        summary: workItem.title,
        profileId: profile.id,
        status: result.status,
        durationMs: result.durationMs || Date.now() - this.activeTask.startedAt,
        prUrl: result.prUrl,
        completedAt: Date.now(),
      });

      this.log(`Done ${workItem.id}: ${result.status} (${Math.round((result.durationMs || 0) / 1000)}s)`);

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
        await this.issueManager.transitionWorkItem(
          workItem.source,
          workItem.id,
          profile.afterAgent?.targetStatus,
          TransitionPhase.AfterAgent,
        );
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

  /** Safety-net container teardown in the task finally block. */
  private async teardownContainer(profile: IAgentProfile): Promise<void> {
    this.log("Stopping containers...");
    // Container is already stopped (either by the abort signal listener in
    // ContainerManager.start, or by TaskRunner's happy-path teardown). Passing
    // null always takes the forceDown path which is a benign no-op on an
    // already-stopped compose project.
    await this.taskRunner.teardown(profile, null);
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
