import type { RalphResult } from "./container/types.js";
import type { AgentProfile, AppConfig } from "./config.js";
import type { ContainerManager } from "./container/manager.js";
import type { JiraIssue } from "./jira/types.js";
import type { JiraClient } from "./jira/client.js";
import type { JiraPoller } from "./jira/poller.js";
import type { ActivityLog } from "./services/activity-log.js";
import type { ProfileRouter } from "./services/profile-router.js";
import type { TaskRunner } from "./services/task-runner.js";
import type { TriggerScanner } from "./services/trigger-scanner.js";
import type { OperationLedger } from "./services/operation-ledger.js";
import type { HeartbeatSender } from "./services/heartbeat.js";
import type { Logger } from "./logger.js";

/**
 * Pre-built service dependencies injected into the Orchestrator.
 *
 * Created by {@link createOrchestratorDeps} (or manually in tests).
 * The orchestrator owns lifecycle (start/stop) but not construction.
 */
export interface OrchestratorDeps {
  config: AppConfig;
  activityLog: ActivityLog;
  jiraClient: JiraClient;
  poller: JiraPoller;
  router: ProfileRouter;
  taskRunner: TaskRunner;
  triggerScanner: TriggerScanner;
  ledger: OperationLedger;
  heartbeat: HeartbeatSender | null;
  logger: Logger;
}

/** Tracks the currently executing task. Null when the orchestrator is idle. */
export interface ActiveTask {
  issue: JiraIssue;
  profile: AgentProfile;
  container: ContainerManager | null;
  startedAt: number;
}

/** Snapshot of the orchestrator's current state, pushed to the Ink dashboard on every change. */
export interface OrchestratorState {
  /** Current lifecycle phase. */
  status: "idle" | "polling" | "working" | "stopping";
  /** The JIRA issue currently being processed, or null if idle. */
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
  /** Container-only log entries (copilot output). */
  containerLogs: readonly LogEntry[];
  /** All configured agent profile IDs. */
  profileIds: readonly string[];
}

/** A single log entry stored in the ring buffer and persisted to the activity JSONL file. */
export interface LogEntry {
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  /** Severity level. */
  level: "info" | "warn" | "error";
  /** Human-readable log message. */
  message: string;
  /** Origin of the log entry. Defaults to `"orchestrator"` for backward compatibility. */
  source?: "orchestrator" | "container";
}

/** Record of a completed task, displayed in the Ink HistoryPanel. */
export interface CompletedTask {
  /** JIRA issue key (e.g. `DF-2759`). */
  key: string;
  /** JIRA issue summary / title. */
  summary: string;
  /** Agent profile ID that handled this task. */
  profileId: string;
  /** Final status reported by the Ralph agent or inferred from exit code. */
  status: RalphResult["status"];
  /** Total wall-clock time from container start to exec completion. */
  durationMs: number;
  /** ADO pull request URL, if one was created. */
  prUrl?: string;
  /** Unix timestamp when the task finished (used for accurate heartbeat reporting). */
  completedAt: number;
}
