import { randomUUID } from "node:crypto";
import { OrchestratorStatus, LogSource, type OrchestratorState, type CompletedTask, type ActiveTask, type LogEntry } from "./orchestrator-types.js";
import { HeartbeatStatus } from "./services/heartbeat.js";

/** Live data the observer reads from the orchestrator on each state snapshot. */
export interface ObservableContext {
  activeTask: ActiveTask | null;
  running: boolean;
  pendingOps: { taskId: string; variant: string }[];
  logEntries: readonly LogEntry[];
  profileIds: readonly string[];
}

/**
 * Builds state snapshots and heartbeat payloads for external consumers.
 *
 * The orchestrator creates an observer at startup, passing a getter that
 * reads its live state. The Ink dashboard subscribes via `onStateChange()`,
 * and the heartbeat sender reads from `getHeartbeatPayload()`.
 *
 * This keeps observation concerns (state aggregation, formatting, session ID)
 * separate from orchestration concerns (polling, routing, execution).
 */
export class OrchestratorObserver {
  private completedToday: CompletedTask[] = [];
  private stateCallbacks: Array<(state: OrchestratorState) => void> = [];
  private emitting = false;
  readonly agentId = randomUUID();

  constructor(private context: () => ObservableContext) {}

  /** Subscribe to state changes. */
  onStateChange(callback: (state: OrchestratorState) => void): void {
    this.stateCallbacks.push(callback);
  }

  /** Record a completed task for history display and heartbeat reporting. */
  recordCompletion(task: CompletedTask): void {
    this.completedToday.push(task);
  }

  /** Emit the current state snapshot to the registered callback. Guards against reentrancy. */
  emit(): void {
    if (this.emitting) return;
    this.emitting = true;
    try {
      const state = this.getState();
      for (const cb of this.stateCallbacks) cb(state);
    } finally {
      this.emitting = false;
    }
  }

  /** Build a state snapshot for the Ink dashboard. */
  getState(): OrchestratorState {
    const ctx = this.context();
    const task = ctx.activeTask;
    return {
      status: !ctx.running
        ? OrchestratorStatus.Stopping
        : task
          ? OrchestratorStatus.Working
          : OrchestratorStatus.Idle,
      currentIssue: task
        ? {
            key: task.workItem.id,
            summary: task.workItem.title,
          }
        : null,
      currentProfile: task?.profile.variantKey ?? null,
      startedAt: task?.startedAt ?? null,
      completedToday: [...this.completedToday],
      queueSize: ctx.pendingOps.length,
      queueItems: ctx.pendingOps.map((p) => ({
        key: p.taskId,
        summary: p.variant,
      })),
      logs: ctx.logEntries,
      orchestratorLogs: ctx.logEntries.filter((e) => e.source !== LogSource.Container),
      containerLogs: ctx.logEntries.filter((e) => e.source === LogSource.Container),
      profileIds: ctx.profileIds,
    };
  }

  /** Build the heartbeat payload for the Vercel status dashboard. */
  getHeartbeatPayload() {
    const ctx = this.context();
    const task = ctx.activeTask;
    const lastCompleted = this.completedToday.at(-1);
    return {
      agentId: this.agentId,
      status: (!ctx.running ? HeartbeatStatus.Stopped : task ? HeartbeatStatus.Working : HeartbeatStatus.Polling),
      queueSize: ctx.pendingOps.length,
      currentTask: task?.workItem.id ?? null,
      currentTaskStartedAt: task
        ? new Date(task.startedAt).toISOString()
        : null,
      profileId: task?.profile.id ?? null,
      totalProcessed: this.completedToday.length,
      lastCompletedTask: lastCompleted?.key ?? null,
      lastCompletedAt: lastCompleted?.completedAt
        ? new Date(lastCompleted.completedAt).toISOString()
        : null,
    };
  }
}
