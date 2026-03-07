import { getToolCategory } from "./tool-timeline-categories";

export const CAT_HEX: Record<ReturnType<typeof getToolCategory>, string> = {
  skill: "#a855f7",
  subagent: "#22d3ee",
  mcp: "#58a6ff",
  edit: "#3fb950",
  shell: "#d29922",
  nav: "#7d8590",
  other: "#e6edf3",
};

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}