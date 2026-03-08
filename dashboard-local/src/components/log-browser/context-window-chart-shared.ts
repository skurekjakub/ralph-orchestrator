/** Shared constants and utilities for context window chart sub-components. */

export const CHART_WIDTH = 800;
export const CHART_PADDING = { top: 8, right: 16, bottom: 20, left: 52 };
export const THRESHOLD_PCT = 80;

export const COLOR_GREEN = "#3fb950";
export const COLOR_YELLOW = "#d29922";
export const COLOR_RED = "#f85149";
export const COLOR_SUBAGENT = "#22d3ee";
export const COLOR_PROMPT = "#58a6ff";
export const COLOR_CACHED = "#7d8590";
export const COLOR_LINE = "#e6edf3";

export function utilizationColor(pct: number): string {
  if (pct >= THRESHOLD_PCT) return COLOR_RED;
  if (pct >= 50) return COLOR_YELLOW;
  return COLOR_GREEN;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

export function toXFactory(tMin: number, tRange: number, plotW: number) {
  return (tsMs: number) => CHART_PADDING.left + ((tsMs - tMin) / tRange) * plotW;
}
