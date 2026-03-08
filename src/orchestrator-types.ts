import { TaskStatus } from "./container/types.js";
import type { IAgentProfile } from "./config/types.js";
import type { WorkItem } from "./datasource/types.js";

/** Tracks the currently executing task. Null when the orchestrator is idle. */
export interface ActiveTask {
  workItem: WorkItem;
  profile: IAgentProfile;
  startedAt: number;
}

/** Identifies the phase of a JIRA status transition relative to agent execution. */
export enum TransitionPhase {
  BeforeAgent = "beforeAgent",
  AfterAgent = "afterAgent",
}

/** Orchestrator lifecycle phase. */
export enum OrchestratorStatus {
  Idle = "idle",
  Polling = "polling",
  Working = "working",
  Stopping = "stopping",
}

/** Severity level for log entries. */
export enum LogLevel {
  Info = "info",
  Warn = "warn",
  Error = "error",
}

/** Origin of a log entry. */
export enum LogSource {
  Orchestrator = "orchestrator",
  Container = "container",
}

/** Snapshot of the orchestrator's current state, pushed to the Ink dashboard on every change. */
export interface OrchestratorState {
  /** Current lifecycle phase. */
  status: OrchestratorStatus;
  /** The work item currently being processed, or null if idle. */
  currentIssue: { key: string; summary: string } | null;
  /** The agent profile being used for the current task, or null if idle. */
  currentProfile: string | null;
  /** Unix timestamp when the current task started, or null if idle. */
  startedAt: number | null;
  /** Tasks completed during this orchestrator session. */
  completedToday: CompletedTask[];
  /** Number of issues waiting in the queue. */
  queueSize: number;
  /** Read-only snapshot of queued issue keys and summaries. */
  queueItems: readonly { key: string; summary: string }[];
  /** Ring buffer of recent log entries (for the Ink panel). */
  logs: readonly LogEntry[];
  /** Orchestrator-only log entries. */
  orchestratorLogs: readonly LogEntry[];
  /** Container-only log entries (CLI output). */
  containerLogs: readonly LogEntry[];
  /** All configured agent profile IDs. */
  profileIds: readonly string[];
}

/** A single log entry stored in the ring buffer and persisted to the activity JSONL file. */
export interface LogEntry {
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  /** Severity level. */
  level: LogLevel;
  /** Human-readable log message. */
  message: string;
  /** Origin of the log entry. Defaults to `"orchestrator"` for backward compatibility. */
  source?: LogSource;
}

/** Record of a completed task, displayed in the Ink HistoryPanel. */
export interface CompletedTask {
  /** JIRA issue key (e.g. `DF-2759`). */
  key: string;
  /** Work item summary / title. */
  summary: string;
  /** Agent profile ID that handled this task. */
  profileId: string;
  /** Final status reported by the Ralph agent or inferred from exit code. */
  status: TaskStatus;
  /** Total wall-clock time from container start to exec completion. */
  durationMs: number;
  /** ADO pull request URL, if one was created. */
  prUrl?: string;
  /** Unix timestamp when the task finished (used for accurate heartbeat reporting). */
  completedAt: number;
}
