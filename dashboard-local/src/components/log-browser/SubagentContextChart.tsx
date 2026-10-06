import { useMemo, useState } from "react";
import type { AgentWindowSlice } from "./context-window-parser";
import {
  CHART_PADDING,
  CHART_WIDTH,
  COLOR_CACHED,
  COLOR_GREEN,
  COLOR_PROMPT,
  COLOR_RED,
  COLOR_YELLOW,
  THRESHOLD_PCT,
  formatTokens,
  toXFactory,
  utilizationColor,
} from "./context-window-chart-shared";

const UTIL_HEIGHT = 80;
const BAR_HEIGHT = 32;

/** Compact context window chart for a single subagent. */
export function SubagentContextChart({ slice }: { slice: AgentWindowSlice }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverTurn, setHoverTurn] = useState<number | null>(null);

  const { entries, usageEntries } = slice;
  const hasEntries = entries.length > 0;
  const hasUsage = usageEntries.length > 0;

  const stats = useMemo(() => {
    if (!hasEntries) return null;
    const maxTokens = entries[0].maxTokens;
    const peak = Math.max(...entries.map((e) => e.utilization));
    return { maxTokens, peak };
  }, [entries, hasEntries]);

  const tokenTotals = useMemo(() => {
    let prompt = 0;
    let completion = 0;
    for (const u of usageEntries) {
      prompt += u.promptTokens;
      completion += u.completionTokens;
    }
    return { prompt, completion, total: prompt + completion, turns: usageEntries.length };
  }, [usageEntries]);

  if (!hasEntries && !hasUsage) return null;

  return (
    <div className="flex flex-col gap-0.5 rounded border border-border/50 bg-white/[0.02] px-2 py-1.5">
      {/* Header */}
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold text-text">{slice.name}</span>
        {slice.model && <span className="text-[9px] text-dim">{slice.model}</span>}
        {stats && <span className="text-[9px] text-dim">peak: {stats.peak.toFixed(1)}%</span>}
        {tokenTotals.turns > 0 && (
          <span className="text-[9px] text-dim">
            {tokenTotals.turns} turns, {formatTokens(tokenTotals.total)} tokens
          </span>
        )}
      </div>

      {/* Utilization mini-chart */}
      {hasEntries && <UtilizationMini entries={entries} hoverIndex={hoverIndex} onHover={setHoverIndex} />}

      {/* Token cost bars */}
      {hasUsage && (
        <TokenCostMini usageEntries={usageEntries} entries={entries} hoverTurn={hoverTurn} onHover={setHoverTurn} />
      )}
    </div>
  );
}

function UtilizationMini({
  entries,
  hoverIndex,
  onHover,
}: {
  entries: AgentWindowSlice["entries"];
  hoverIndex: number | null;
  onHover: (i: number | null) => void;
}) {
  const plotW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = UTIL_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const tMin = entries[0].tsMs;
  const tMax = entries[entries.length - 1].tsMs;
  const tRange = tMax - tMin || 1;
  const toX = toXFactory(tMin, tRange, plotW);
  const toY = (pct: number) => CHART_PADDING.top + plotH - (pct / 100) * plotH;

  const areaPath = useMemo(() => {
    const pts = entries.map((e) => ({ x: toX(e.tsMs), y: toY(e.utilization) }));
    const baseline = CHART_PADDING.top + plotH;
    let d = `M ${pts[0].x} ${baseline} L ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    d += ` L ${pts[pts.length - 1].x} ${baseline} Z`;
    return d;
  }, [entries, tMin, tRange]);

  const linePath = useMemo(() => {
    const pts = entries.map((e) => ({ x: toX(e.tsMs), y: toY(e.utilization) }));
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    return d;
  }, [entries, tMin, tRange]);

  const thresholdY = toY(THRESHOLD_PCT);
  const hoverEntry = hoverIndex !== null ? entries[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${UTIL_HEIGHT}`}
        className="w-full"
        style={{ maxHeight: UTIL_HEIGHT }}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id={`sub-area-grad-${entries[0].tsMs}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={COLOR_RED} stopOpacity={0.3} />
            <stop offset={`${100 - THRESHOLD_PCT}%`} stopColor={COLOR_YELLOW} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COLOR_GREEN} stopOpacity={0.1} />
          </linearGradient>
        </defs>

        {/* Grid */}
        {[0, 50, 100].map((pct) => (
          <g key={pct}>
            <line
              x1={CHART_PADDING.left}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y1={toY(pct)}
              y2={toY(pct)}
              stroke="#30363d"
              strokeWidth={0.5}
            />
            <text x={CHART_PADDING.left - 4} y={toY(pct) + 3} textAnchor="end" fill="#7d8590" fontSize={7}>
              {pct}%
            </text>
          </g>
        ))}

        {/* Threshold */}
        <line
          x1={CHART_PADDING.left}
          x2={CHART_WIDTH - CHART_PADDING.right}
          y1={thresholdY}
          y2={thresholdY}
          stroke={COLOR_RED}
          strokeWidth={0.6}
          strokeDasharray="3 2"
          opacity={0.4}
        />

        <path d={areaPath} fill={`url(#sub-area-grad-${entries[0].tsMs})`} />
        <path d={linePath} fill="none" stroke={COLOR_GREEN} strokeWidth={1} opacity={0.8} />

        {/* Hover hitboxes */}
        {entries.map((entry, i) => {
          const x = toX(entry.tsMs);
          const nextX = i < entries.length - 1 ? toX(entries[i + 1].tsMs) : CHART_WIDTH - CHART_PADDING.right;
          const hitW = Math.max(nextX - x, 3);
          return (
            <rect
              key={i}
              x={x - hitW / 2}
              y={CHART_PADDING.top}
              width={hitW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => onHover(i)}
            />
          );
        })}

        {hoverEntry && hoverIndex !== null && (
          <circle
            cx={toX(hoverEntry.tsMs)}
            cy={toY(hoverEntry.utilization)}
            r={2.5}
            fill={utilizationColor(hoverEntry.utilization)}
            stroke="#0d1117"
            strokeWidth={1}
          />
        )}
      </svg>

      {hoverEntry && (
        <div
          className="absolute bg-surface-raised border border-border rounded px-2 py-1 text-[10px] pointer-events-none z-10 shadow-md"
          style={{ left: `${(toX(hoverEntry.tsMs) / CHART_WIDTH) * 100}%`, top: 0, transform: "translateX(-50%)" }}
        >
          <div className="font-mono text-text">
            {hoverEntry.utilization.toFixed(1)}% — {formatTokens(hoverEntry.usedTokens)} /{" "}
            {formatTokens(hoverEntry.maxTokens)}
          </div>
        </div>
      )}
    </div>
  );
}

function TokenCostMini({
  usageEntries,
  entries,
  hoverTurn,
  onHover,
}: {
  usageEntries: AgentWindowSlice["usageEntries"];
  entries: AgentWindowSlice["entries"];
  hoverTurn: number | null;
  onHover: (i: number | null) => void;
}) {
  const plotW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const allTs = [...entries.map((e) => e.tsMs), ...usageEntries.map((e) => e.tsMs)];
  const tMin = Math.min(...allTs);
  const tMax = Math.max(...allTs);
  const tRange = tMax - tMin || 1;
  const maxTotal = Math.max(...usageEntries.map((e) => e.totalTokens), 1);
  const toX = toXFactory(tMin, tRange, plotW);
  const hoverEntry = hoverTurn !== null ? usageEntries[hoverTurn] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${BAR_HEIGHT + 4}`}
        className="w-full"
        style={{ maxHeight: BAR_HEIGHT + 4 }}
        onMouseLeave={() => onHover(null)}
      >
        {usageEntries.map((entry, i) => {
          const x = toX(entry.tsMs);
          const barW = Math.max((plotW / usageEntries.length) * 0.6, 2);
          const promptH = (entry.promptTokens / maxTotal) * BAR_HEIGHT;
          const completionH = (entry.completionTokens / maxTotal) * BAR_HEIGHT;
          const cachedH = entry.cachedTokens > 0 ? (entry.cachedTokens / maxTotal) * BAR_HEIGHT : 0;
          const promptSeg = promptH - cachedH;

          return (
            <g key={i} onMouseEnter={() => onHover(i)}>
              <rect
                x={x - barW / 2}
                y={BAR_HEIGHT - promptSeg - completionH - cachedH}
                width={barW}
                height={Math.max(promptSeg, 0)}
                fill={COLOR_PROMPT}
                opacity={hoverTurn === i ? 1 : 0.6}
                rx={0.5}
              />
              {cachedH > 0 && (
                <rect
                  x={x - barW / 2}
                  y={BAR_HEIGHT - completionH - cachedH}
                  width={barW}
                  height={cachedH}
                  fill={COLOR_CACHED}
                  opacity={hoverTurn === i ? 1 : 0.4}
                  rx={0.5}
                />
              )}
              <rect
                x={x - barW / 2}
                y={BAR_HEIGHT - completionH}
                width={barW}
                height={completionH}
                fill={COLOR_GREEN}
                opacity={hoverTurn === i ? 1 : 0.6}
                rx={0.5}
              />
            </g>
          );
        })}
      </svg>

      {hoverEntry && hoverTurn !== null && (
        <div
          className="absolute bg-surface-raised border border-border rounded px-2 py-1 text-[10px] pointer-events-none z-10 shadow-md"
          style={{ left: `${(toX(hoverEntry.tsMs) / CHART_WIDTH) * 100}%`, top: 0, transform: "translateX(-50%)" }}
        >
          <div className="font-mono text-text">
            Turn {hoverTurn + 1}: {formatTokens(hoverEntry.totalTokens)} total
          </div>
          <div className="text-dim">
            prompt: {formatTokens(hoverEntry.promptTokens)}
            {hoverEntry.cachedTokens > 0 && ` (${formatTokens(hoverEntry.cachedTokens)} cached)`}
            {" · "}completion: {formatTokens(hoverEntry.completionTokens)}
          </div>
        </div>
      )}
    </div>
  );
}
