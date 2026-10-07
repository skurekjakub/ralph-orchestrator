import type { TaskLogFileKey, TaskLogGroup } from "../../types";

export function formatDate(ts?: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export const statusBadge: Record<string, string> = {
  completed: "bg-success/15 text-success",
  error: "bg-error/15 text-error",
  partial: "bg-warn/15 text-warn",
  blocked: "bg-dim/15 text-dim",
};

/** Button label and icon of each task file the execution row opens in the file viewer, in display order. */
export const fileLabels: Partial<Record<TaskLogFileKey, { label: string; icon: string }>> = {
  log: { label: "Log", icon: "📄" },
  summary: { label: "Summary", icon: "📊" },
  audit: { label: "Audit", icon: "🔍" },
  transcript: { label: "Transcript", icon: "💬" },
  claudeTranscript: { label: "Claude Transcript", icon: "💬" },
  toolOutput: { label: "Tool Output", icon: "🔧" },
  preTool: { label: "Tool Log", icon: "📋" },
  claudeRunTelemetry: { label: "Run Telemetry", icon: "📈" },
  claudeCliDebug: { label: "Claude Debug Log", icon: "🐞" },
};

export interface IssueGroup {
  taskId: string;
  executions: TaskLogGroup[];
  latestStatus?: string;
  latestTimestamp?: number;
}
