import { useState } from "react";
import type { AssistantUsageEntry, ContextWindowEntry } from "./tool-timeline-types";
import {
  CHART_PADDING,
  CHART_WIDTH,
  COLOR_CACHED,
  COLOR_GREEN,
  COLOR_PROMPT,
  formatTokens,
  toXFactory,
} from "./context-window-chart-shared";

const BAR_HEIGHT = 40;

/** Per-turn token bars aligned to the same time axis as the utilization chart. */
export function TokenCostOverlay({
  usageEntries,
  entries,
}: {
  usageEntries: AssistantUsageEntry[];
  entries: ContextWindowEntry[];
}) {
  const plotW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const [hoverTurn, setHoverTurn] = useState<number | null>(null);

  const allTs = [...entries.map((e) => e.tsMs), ...usageEntries.map((e) => e.tsMs)];
  const tMin = Math.min(...allTs);
  const tMax = Math.max(...allTs);
  const tRange = tMax - tMin || 1;

  const maxTotal = Math.max(...usageEntries.map((e) => e.totalTokens), 1);

  const toX = toXFactory(tMin, tRange, plotW);

  const hoverEntry = hoverTurn !== null ? usageEntries[hoverTurn] : null;

  return (
    <div className="relative">
      <div className="text-[10px] text-dim uppercase tracking-wider font-semibold px-1 mb-0.5">
        Per-Turn Token Usage — {usageEntries.length} turns
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${BAR_HEIGHT + 12}`}
        className="w-full"
        style={{ maxHeight: BAR_HEIGHT + 12 }}
        onMouseLeave={() => setHoverTurn(null)}
      >
        {usageEntries.map((entry, i) => {
          const x = toX(entry.tsMs);
          const barW = Math.max((plotW / usageEntries.length) * 0.6, 2);
          const promptH = (entry.promptTokens / maxTotal) * BAR_HEIGHT;
          const completionH = (entry.completionTokens / maxTotal) * BAR_HEIGHT;
          const cachedH = entry.cachedTokens > 0 ? (entry.cachedTokens / maxTotal) * BAR_HEIGHT : 0;
          const promptSegment = promptH - cachedH;

          return (
            <g key={i} onMouseEnter={() => setHoverTurn(i)}>
              {/* Prompt (non-cached) */}
              <rect
                x={x - barW / 2}
                y={BAR_HEIGHT - promptSegment - completionH - cachedH}
                width={barW}
                height={Math.max(promptSegment, 0)}
                fill={COLOR_PROMPT}
                opacity={hoverTurn === i ? 1 : 0.6}
                rx={0.5}
              />
              {/* Cached prompt */}
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
              {/* Completion */}
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

      {/* Legend */}
      <div className="flex gap-3 px-1 items-center">
        <span className="flex items-center gap-1 text-[9px] text-dim">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_PROMPT }} />
          prompt
        </span>
        <span className="flex items-center gap-1 text-[9px] text-dim">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_CACHED }} />
          cached
        </span>
        <span className="flex items-center gap-1 text-[9px] text-dim">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_GREEN }} />
          completion
        </span>
      </div>

      {/* Tooltip */}
      {hoverEntry && hoverTurn !== null && (
        <div
          className="absolute bg-surface-raised border border-border rounded px-2 py-1 text-[10px] pointer-events-none z-10 shadow-md"
          style={{
            left: `${(toX(hoverEntry.tsMs) / CHART_WIDTH) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-mono text-text">
            Turn {hoverTurn + 1}: {formatTokens(hoverEntry.totalTokens)} total
          </div>
          <div className="text-dim">
            prompt: {formatTokens(hoverEntry.promptTokens)}
            {hoverEntry.cachedTokens > 0 && ` (${formatTokens(hoverEntry.cachedTokens)} cached)`}
          </div>
          <div className="text-dim">completion: {formatTokens(hoverEntry.completionTokens)}</div>
        </div>
      )}
    </div>
  );
}
