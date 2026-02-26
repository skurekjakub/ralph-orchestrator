import type { TaskLogGroup } from "../../types";

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

export function formatDuration(ms?: number): string {
  if (!ms) return "";
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

export const statusBadge: Record<string, string> = {
  completed: "bg-success/15 text-success",
  error: "bg-error/15 text-error",
  partial: "bg-warn/15 text-warn",
  blocked: "bg-dim/15 text-dim",
};

export const fileLabels: Record<string, { label: string; icon: string }> = {
  log: { label: "Log", icon: "📄" },
  summary: { label: "Summary", icon: "📊" },
  audit: { label: "Audit", icon: "🔍" },
  transcript: { label: "Transcript", icon: "💬" },
  toolOutput: { label: "Tool Output", icon: "🔧" },
  preTool: { label: "Tool Log", icon: "📋" },
};

export interface IssueGroup {
  issueKey: string;
  executions: TaskLogGroup[];
  latestStatus?: string;
  latestTimestamp?: number;
}
