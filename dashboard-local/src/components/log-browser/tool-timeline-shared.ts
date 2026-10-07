import type { ToolCategory } from "./tool-timeline-types";

export const CAT_HEX: Record<ToolCategory, string> = {
  skill: "#a855f7",
  subagent: "#22d3ee",
  mcp: "#58a6ff",
  edit: "#3fb950",
  shell: "#d29922",
  nav: "#7d8590",
  other: "#e6edf3",
};

/** A duration as `850ms`, `12.4s` or `3m 7s`. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

/** An agent's name without its family prefix: `ralph.malph-scout` → `malph-scout`; a name without one is kept. */
export function agentDisplayName(fullName: string): string {
  return fullName.replace(/^[^.]+\./, "");
}
