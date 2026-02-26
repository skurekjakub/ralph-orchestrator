/** Mirrors OrchestratorState from the orchestrator — kept in sync manually. */
export interface OrchestratorState {
  status: "idle" | "polling" | "working" | "stopping";
  currentIssue: { key: string; summary: string } | null;
  currentProfile: string | null;
  startedAt: number | null;
  completedToday: CompletedTask[];
  queueSize: number;
  queueItems: readonly { key: string; summary: string }[];
  logs: readonly LogEntry[];
  orchestratorLogs: readonly LogEntry[];
  containerLogs: readonly LogEntry[];
  profileIds: readonly string[];
}

export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
  source?: "orchestrator" | "container";
}

export interface CompletedTask {
  key: string;
  summary: string;
  profileId: string;
  status: "completed" | "partial" | "blocked" | "error";
  durationMs: number;
  prUrl?: string;
  completedAt: number;
}

export type DashboardMessage =
  | { type: "state"; data: OrchestratorState }
  | { type: "log"; data: LogEntry }
  | { type: "toolOutput"; data: string };

/** A group of log files belonging to a single task execution. */
export interface TaskLogGroup {
  id: string;
  issueKey: string;
  timestamp?: number;
  files: {
    log?: string;
    summary?: string;
    audit?: string;
    transcript?: string;
    toolOutput?: string;
    preTool?: string;
  };
  summary?: {
    issueKey?: string;
    status?: string;
    durationMs?: number;
    exitCode?: number;
    prUrl?: string;
    timestamp?: string;
  };
}
