import { useMemo } from "react";
import type { ContextWindowEntry, SubagentSpan } from "./tool-timeline-types";
import {
  CHART_PADDING,
  CHART_WIDTH,
  COLOR_GREEN,
  COLOR_RED,
  COLOR_SUBAGENT,
  COLOR_YELLOW,
  THRESHOLD_PCT,
  formatTokens,
  toXFactory,
  utilizationColor,
} from "./context-window-chart-shared";

const CHART_HEIGHT = 120;

export function UtilizationChart({
  entries,
  subagentSpans,
  hoverIndex,
  onHover,
}: {
  entries: ContextWindowEntry[];
  subagentSpans: SubagentSpan[];
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
}) {
  const plotW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const tMin = entries[0].tsMs;
  const tMax = entries[entries.length - 1].tsMs;
  const tRange = tMax - tMin || 1;

  const toX = toXFactory(tMin, tRange, plotW);
  const toY = (pct: number) => CHART_PADDING.top + plotH - (pct / 100) * plotH;

  const areaPath = useMemo(() => {
    const points = entries.map((e) => ({ x: toX(e.tsMs), y: toY(e.utilization) }));
    const baseline = CHART_PADDING.top + plotH;
    let d = `M ${points[0].x} ${baseline} L ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    d += ` L ${points[points.length - 1].x} ${baseline} Z`;
    return d;
  }, [entries, tMin, tRange]);

  const linePath = useMemo(() => {
    const points = entries.map((e) => ({ x: toX(e.tsMs), y: toY(e.utilization) }));
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }, [entries, tMin, tRange]);

  const thresholdY = toY(THRESHOLD_PCT);
  const hoverEntry = hoverIndex !== null ? entries[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        style={{ maxHeight: CHART_HEIGHT }}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id="ctx-area-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={COLOR_RED} stopOpacity={0.3} />
            <stop offset={`${100 - THRESHOLD_PCT}%`} stopColor={COLOR_YELLOW} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COLOR_GREEN} stopOpacity={0.1} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line
              x1={CHART_PADDING.left}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y1={toY(pct)}
              y2={toY(pct)}
              stroke="#30363d"
              strokeWidth={0.5}
            />
            <text x={CHART_PADDING.left - 4} y={toY(pct) + 3} textAnchor="end" fill="#7d8590" fontSize={8}>
              {pct}%
            </text>
          </g>
        ))}

        {/* Threshold line at 80% */}
        <line
          x1={CHART_PADDING.left}
          x2={CHART_WIDTH - CHART_PADDING.right}
          y1={thresholdY}
          y2={thresholdY}
          stroke={COLOR_RED}
          strokeWidth={0.8}
          strokeDasharray="4 3"
          opacity={0.5}
        />
        <text x={CHART_WIDTH - CHART_PADDING.right + 2} y={thresholdY + 3} fill={COLOR_RED} fontSize={7} opacity={0.7}>
          80%
        </text>

        {/* Area fill */}
        <path d={areaPath} fill="url(#ctx-area-gradient)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke={COLOR_GREEN} strokeWidth={1.2} opacity={0.8} />

        {/* Subagent dispatch markers */}
        {subagentSpans.map((span) => {
          const x = toX(span.startMs);
          if (x < CHART_PADDING.left || x > CHART_WIDTH - CHART_PADDING.right) return null;
          return (
            <g key={`${span.name}-${span.startMs}`}>
              <line
                x1={x}
                x2={x}
                y1={CHART_PADDING.top}
                y2={CHART_PADDING.top + plotH}
                stroke={COLOR_SUBAGENT}
                strokeWidth={0.8}
                strokeDasharray="2 2"
                opacity={0.5}
              />
              <text x={x + 2} y={CHART_PADDING.top + 8} fill={COLOR_SUBAGENT} fontSize={7} opacity={0.7}>
                {span.name}
              </text>
            </g>
          );
        })}

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

        {/* Hover indicator */}
        {hoverEntry && hoverIndex !== null && (
          <>
            <circle
              cx={toX(hoverEntry.tsMs)}
              cy={toY(hoverEntry.utilization)}
              r={3}
              fill={utilizationColor(hoverEntry.utilization)}
              stroke="#0d1117"
              strokeWidth={1.5}
            />
            <line
              x1={toX(hoverEntry.tsMs)}
              x2={toX(hoverEntry.tsMs)}
              y1={CHART_PADDING.top}
              y2={CHART_PADDING.top + plotH}
              stroke="#e6edf3"
              strokeWidth={0.5}
              opacity={0.3}
            />
          </>
        )}

        {/* Time labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const ts = tMin + frac * tRange;
          const x = toX(ts);
          const label = new Date(ts).toLocaleTimeString("en-GB", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          return (
            <text key={frac} x={x} y={CHART_HEIGHT - 4} textAnchor="middle" fill="#7d8590" fontSize={8}>
              {label}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoverEntry && hoverIndex !== null && (
        <div
          className="absolute bg-surface-raised border border-border rounded px-2 py-1 text-[10px] pointer-events-none z-10 shadow-md"
          style={{
            left: `${(toX(hoverEntry.tsMs) / CHART_WIDTH) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-mono text-text">
            {hoverEntry.utilization.toFixed(1)}% — {formatTokens(hoverEntry.usedTokens)} /{" "}
            {formatTokens(hoverEntry.maxTokens)}
          </div>
          <div className="text-dim">{new Date(hoverEntry.tsMs).toLocaleTimeString("en-GB", { hour12: false })}</div>
        </div>
      )}
    </div>
  );
}
