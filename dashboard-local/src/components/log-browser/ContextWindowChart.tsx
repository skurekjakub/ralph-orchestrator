import { useMemo, useState } from "react";
import type { AssistantUsageEntry, ContextWindowEntry, SubagentSpan } from "./tool-timeline-types";
import { formatTokens } from "./context-window-chart-shared";
import { CumulativeTokenTracker } from "./CumulativeTokenTracker";
import { TokenCostOverlay } from "./TokenCostOverlay";
import { UtilizationChart } from "./UtilizationChart";

interface ContextWindowChartProps {
  entries: ContextWindowEntry[];
  usageEntries: AssistantUsageEntry[];
  subagentSpans: SubagentSpan[];
}

export function ContextWindowChart({ entries, usageEntries, subagentSpans }: ContextWindowChartProps) {
  const [expanded, setExpanded] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const maxTokens = entries[0].maxTokens;
    const peak = Math.max(...entries.map((e) => e.utilization));
    return { maxTokens, peak };
  }, [entries]);

  const cumulativeUsage = useMemo(() => {
    let totalPrompt = 0;
    let totalCompletion = 0;
    for (const entry of usageEntries) {
      totalPrompt += entry.promptTokens;
      totalCompletion += entry.completionTokens;
    }
    return { totalPrompt, totalCompletion, turns: usageEntries.length };
  }, [usageEntries]);

  if (entries.length === 0 && usageEntries.length === 0) {
    return null;
  }

  const maxTokensLabel = stats ? `${Math.round(stats.maxTokens / 1000)}K` : "—";
  const peakLabel = stats ? `${stats.peak.toFixed(1)}%` : "—";

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 self-start rounded px-1 py-0.5 hover:bg-white/[0.04] transition-colors"
      >
        <span className="text-[10px] text-dim">{expanded ? "▾" : "▸"}</span>
        <span className="text-[10px] text-dim uppercase tracking-wider font-semibold">
          Context Window — max: {maxTokensLabel}, peak: {peakLabel}
          {cumulativeUsage.turns > 0 && (
            <span className="ml-2 normal-case text-text font-normal">
              {cumulativeUsage.turns} turns, {formatTokens(cumulativeUsage.totalPrompt + cumulativeUsage.totalCompletion)} total tokens
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2">
          {entries.length > 0 && (
            <UtilizationChart
              entries={entries}
              subagentSpans={subagentSpans}
              hoverIndex={hoverIndex}
              onHover={setHoverIndex}
            />
          )}
          {usageEntries.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <TokenCostOverlay usageEntries={usageEntries} entries={entries} />
              <CumulativeTokenTracker usageEntries={usageEntries} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
