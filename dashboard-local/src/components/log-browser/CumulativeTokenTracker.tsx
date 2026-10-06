import { useMemo } from "react";
import type { AssistantUsageEntry } from "./tool-timeline-types";
import {
  CHART_PADDING,
  CHART_WIDTH,
  COLOR_LINE,
  COLOR_PROMPT,
  buildLinePath,
  formatTokens,
  toXFactory,
} from "./context-window-chart-shared";

const HEIGHT = 60;

/** Cumulative token consumption tracker with running totals. */
export function CumulativeTokenTracker({ usageEntries }: { usageEntries: AssistantUsageEntry[] }) {
  const plotW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const cumulative = useMemo(() => {
    let runningTotal = 0;
    let runningPrompt = 0;
    let runningCompletion = 0;
    return usageEntries.map((entry) => {
      runningTotal += entry.totalTokens;
      runningPrompt += entry.promptTokens;
      runningCompletion += entry.completionTokens;
      return { tsMs: entry.tsMs, total: runningTotal, prompt: runningPrompt, completion: runningCompletion };
    });
  }, [usageEntries]);

  if (cumulative.length === 0) return null;

  const tMin = cumulative[0].tsMs;
  const tMax = cumulative[cumulative.length - 1].tsMs;
  const tRange = tMax - tMin || 1;
  const maxTotal = cumulative[cumulative.length - 1].total || 1;

  const toX = toXFactory(tMin, tRange, plotW);
  const toY = (tokens: number) => CHART_PADDING.top + plotH - (tokens / maxTotal) * plotH;

  const totalLine = buildLinePath(cumulative.map((c) => ({ x: toX(c.tsMs), y: toY(c.total) })));
  const promptLine = buildLinePath(cumulative.map((c) => ({ x: toX(c.tsMs), y: toY(c.prompt) })));

  const finalTotal = cumulative[cumulative.length - 1].total;
  const finalPrompt = cumulative[cumulative.length - 1].prompt;
  const finalCompletion = cumulative[cumulative.length - 1].completion;

  return (
    <div>
      <div className="flex items-baseline gap-2 px-1 mb-0.5">
        <span className="text-[10px] text-dim uppercase tracking-wider font-semibold">Cumulative Token Spend</span>
        <span className="text-[10px] text-text font-mono">{formatTokens(finalTotal)} total</span>
        <span className="text-[10px] text-dim font-mono">
          ({formatTokens(finalPrompt)} prompt + {formatTokens(finalCompletion)} completion)
        </span>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${HEIGHT}`} className="w-full" style={{ maxHeight: HEIGHT }}>
        {/* Y-axis labels */}
        {[0, 0.5, 1].map((frac) => {
          const val = frac * maxTotal;
          const y = toY(val);
          return (
            <g key={frac}>
              <line
                x1={CHART_PADDING.left}
                x2={CHART_WIDTH - CHART_PADDING.right}
                y1={y}
                y2={y}
                stroke="#30363d"
                strokeWidth={0.5}
              />
              <text x={CHART_PADDING.left - 4} y={y + 3} textAnchor="end" fill="#7d8590" fontSize={7}>
                {formatTokens(val)}
              </text>
            </g>
          );
        })}

        {/* Prompt line */}
        <path d={promptLine} fill="none" stroke={COLOR_PROMPT} strokeWidth={1} opacity={0.6} />

        {/* Total line */}
        <path d={totalLine} fill="none" stroke={COLOR_LINE} strokeWidth={1.2} opacity={0.8} />
      </svg>

      <div className="flex gap-3 px-1 items-center">
        <span className="flex items-center gap-1 text-[9px] text-dim">
          <span className="w-2 h-1 rounded-sm" style={{ backgroundColor: COLOR_LINE }} />
          total
        </span>
        <span className="flex items-center gap-1 text-[9px] text-dim">
          <span className="w-2 h-1 rounded-sm" style={{ backgroundColor: COLOR_PROMPT }} />
          prompt
        </span>
      </div>
    </div>
  );
}
