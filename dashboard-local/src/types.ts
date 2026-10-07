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
  { type: "state"; data: OrchestratorState } | { type: "log"; data: LogEntry } | { type: "toolOutput"; data: string };

/** Files of one task execution, as paths relative to the log directory. */
export interface TaskLogFiles {
  log?: string;
  summary?: string;
  audit?: string;
  /** The transcript attached to the work item: Copilot's own, else the one rendered from the Claude Code sessions. */
  transcript?: string;
  /** The Claude Code transcript of a run whose Copilot stages wrote `transcript`. */
  claudeTranscript?: string;
  toolOutput?: string;
  preTool?: string;
  /** Copilot CLI debug log. */
  cliDebug?: string;
  /** Claude Code debug log. */
  claudeCliDebug?: string;
  /** Telemetry the orchestrator derives from the Claude Code session logs. */
  claudeRunTelemetry?: string;
  /** The exported Claude Code session logs. */
  claudeSessions?: ExportedFolder;
}

/** Keys of {@link TaskLogFiles} that name a single file. */
export type TaskLogFileKey = Exclude<keyof TaskLogFiles, "claudeSessions">;

/** A folder the orchestrator exported from the agent container. */
export interface ExportedFolder {
  /** The folder, relative to the log directory. */
  dir: string;
  /** Every regular file inside it, relative to `dir`, sorted. */
  files: string[];
}

/** A group of log files belonging to a single task execution. */
export interface TaskLogGroup {
  id: string;
  taskId: string;
  timestamp?: number;
  files: TaskLogFiles;
  summary?: {
    taskId?: string;
    status?: string;
    durationMs?: number;
    exitCode?: number;
    prUrl?: string;
    timestamp?: string;
  };
}
