import { useMemo, useState } from "react";
import type { AssistantUsageEntry, ContextWindowEntry, SubagentSpan } from "./tool-timeline-types";
import { splitEntriesByAgent } from "./context-window-parser";
import { formatTokens } from "./context-window-chart-shared";
import { CumulativeTokenTracker } from "./CumulativeTokenTracker";
import { SubagentContextChart } from "./SubagentContextChart";
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
  const [showInfo, setShowInfo] = useState(false);
  const [showSubagents, setShowSubagents] = useState(true);

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

  const agentSlices = useMemo(
    () => splitEntriesByAgent(entries, usageEntries, subagentSpans),
    [entries, usageEntries, subagentSpans],
  );

  const subagentSlices = agentSlices.filter((s) => s.name !== "main");

  if (entries.length === 0 && usageEntries.length === 0) {
    return null;
  }

  const maxTokensLabel = stats ? `${Math.round(stats.maxTokens / 1000)}K` : "—";
  const peakLabel = stats ? `${stats.peak.toFixed(1)}%` : "—";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
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
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowInfo((prev) => !prev)}
            className="text-[10px] text-dim hover:text-text rounded-full w-4 h-4 flex items-center justify-center hover:bg-white/[0.08] transition-colors"
            title="What does this chart show?"
          >
            ?
          </button>
          {showInfo && <ChartInfoTooltip onClose={() => setShowInfo(false)} />}
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
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
          {subagentSlices.length > 0 && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setShowSubagents((prev) => !prev)}
                className="flex items-center gap-1 self-start rounded px-1 py-0.5 hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-[10px] text-dim">{showSubagents ? "▾" : "▸"}</span>
                <span className="text-[10px] text-dim uppercase tracking-wider font-semibold">
                  Subagent Context Windows — {subagentSlices.length} agent{subagentSlices.length > 1 ? "s" : ""}
                </span>
              </button>
              {showSubagents && (
                <div className="flex flex-col gap-1.5 ml-2">
                  {subagentSlices.map((slice) => (
                    <SubagentContextChart key={`${slice.fullName}-${slice.entries[0]?.tsMs ?? slice.usageEntries[0]?.tsMs}`} slice={slice} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChartInfoTooltip({ onClose }: { onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className="absolute left-0 top-5 z-30 w-80 bg-surface-raised border border-border rounded-md shadow-lg p-3 text-[11px] leading-relaxed">
        <div className="font-semibold text-text mb-1.5">Context Window Chart</div>
        <div className="text-dim space-y-1.5">
          <p>
            <span className="text-text font-medium">Scope: main orchestrator agent only.</span>{" "}
            Subagents run in separate context windows — their utilization and token usage are shown in the collapsible section below.
          </p>
          <p>
            <span className="text-text font-medium">Utilization chart</span> — shows what % of the context window is filled over time.
            The <span style={{ color: "#3fb950" }}>green area</span> is current utilization.
            The <span style={{ color: "#f85149" }}>red dashed line</span> at 80% marks the compaction threshold — when exceeded, the CLI compresses the conversation history.
          </p>
          <p>
            <span className="text-text font-medium">Sawtooth pattern</span> — utilization climbs as the agent works, then drops sharply when a subagent is dispatched (context is freed for the tool call). It rises again when the subagent result is ingested.
            <span style={{ color: "#22d3ee" }}> Cyan dashed lines</span> mark subagent dispatch points.
          </p>
          <p>
            <span className="text-text font-medium">Per-turn token usage</span> — stacked bars per API call:
            {" "}<span style={{ color: "#58a6ff" }}>blue</span> = prompt tokens (new),
            {" "}<span style={{ color: "#7d8590" }}>gray</span> = cached prompt tokens,
            {" "}<span style={{ color: "#3fb950" }}>green</span> = completion tokens.
          </p>
          <p>
            <span className="text-text font-medium">Cumulative token spend</span> — running total of all tokens consumed across all API turns by the main agent.
          </p>
        </div>
      </div>
    </>
  );
}
