import { useMemo, useState } from "react";
import { getToolCategory } from "./tool-timeline-categories";
import type { SubagentSpan } from "./tool-timeline-types";
import { CAT_HEX, formatMs } from "./tool-timeline-shared";

export function SubagentOverview({ spans }: { spans: SubagentSpan[] }) {
  const [expanded, setExpanded] = useState(true);

  if (spans.length === 0) return null;

  const totalStart = spans[0].startMs;
  const totalEnd = spans[spans.length - 1].endMs ?? spans[spans.length - 1].startMs;
  const totalDuration = totalEnd - totalStart;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 self-start rounded px-1 py-0.5 hover:bg-white/[0.04] transition-colors"
      >
        <span className="text-[10px] text-dim">{expanded ? "▾" : "▸"}</span>
        <span className="text-[10px] text-dim uppercase tracking-wider font-semibold">
          Subagent Pipeline — {spans.length} agent{spans.length !== 1 ? "s" : ""}
          <span className="ml-2 normal-case text-text font-normal">{formatMs(totalDuration)}</span>
        </span>
      </button>

      {expanded && (
        <>
          <div className="flex flex-col gap-0.5">
            {spans.map((span) => {
              const offset = totalDuration > 0 ? ((span.startMs - totalStart) / totalDuration) * 100 : 0;
              const width = totalDuration > 0 ? Math.max(((span.durationMs ?? 0) / totalDuration) * 100, 2) : 100;

              return (
                <div key={span.name} className="flex items-center gap-2 h-5">
                  <span className="w-36 text-[10px] font-mono text-cyan-400 truncate shrink-0">
                    {span.name}
                  </span>
                  <div className="flex-1 h-3 rounded-sm bg-border/20 relative overflow-hidden">
                    <div
                      className="absolute top-0 h-full rounded-sm"
                      style={{
                        left: `${offset}%`,
                        width: `${width}%`,
                        backgroundColor: span.didFallback ? "#f59e0b" : "#22d3ee",
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span className="w-20 text-[10px] font-mono text-dim text-right shrink-0">
                    {formatMs(span.durationMs ?? 0)}
                  </span>
                  <span className="w-12 text-[10px] text-dim text-right shrink-0">
                    {span.toolCallCount} tc
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 flex-wrap mt-0.5">
            {spans.map((span) => (
              <span
                key={span.name}
                className="text-[10px] px-1.5 py-0.5 rounded font-mono inline-flex items-center gap-1"
                style={{
                  backgroundColor: span.didFallback ? "#f59e0b22" : "#22d3ee22",
                  color: span.didFallback ? "#f59e0b" : "#22d3ee",
                }}
              >
                {span.name}
                <span className="text-dim">→</span>
                {span.resolvedModel}
                {span.didFallback && (
                  <span className="text-[8px] px-1 py-px rounded bg-warn/20 text-warn ml-0.5">fallback</span>
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SubagentInnerTimeline({ span }: { span: SubagentSpan }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showCalls, setShowCalls] = useState(true);

  const toolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const toolCall of span.toolCalls) {
      counts.set(toolCall.tool, (counts.get(toolCall.tool) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [span.toolCalls]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold" style={{ color: "#22d3ee" }}>
          {span.name}
        </span>
        <span className="text-[10px] font-mono text-dim">
          {span.resolvedModel}
        </span>
        {span.didFallback && span.definitionModel && (
          <span className="text-[9px] px-1 py-px rounded bg-warn/20 text-warn">
            wanted {span.definitionModel}
          </span>
        )}
        <span className="text-[10px] text-dim">
          {formatMs(span.durationMs ?? 0)}
        </span>
        <span className="text-[10px] text-dim">
          {span.toolCallCount} tool calls · {span.modelCallCount} LLM turns
        </span>
      </div>

      <div className="flex gap-3 text-[10px] text-dim">
        <span>
          Start: <span className="text-text font-mono">{span.startTs ? new Date(span.startTs).toLocaleTimeString("en-GB", { hour12: false }) : "?"}</span>
        </span>
        <span>
          End: <span className="text-text font-mono">{span.endTs ? new Date(span.endTs).toLocaleTimeString("en-GB", { hour12: false }) : "?"}</span>
        </span>
      </div>

      {toolCounts.length > 0 && (
        <div>
          <button
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded hover:bg-white/[0.05] transition-colors flex items-center gap-1.5"
            style={{ color: "#7d8590" }}
            onClick={() => setShowBreakdown(!showBreakdown)}
          >
            <span>{showBreakdown ? "▾" : "▸"}</span>
            {showBreakdown ? "Hide" : "Show"} tool breakdown ({toolCounts.length})
          </button>

          {showBreakdown && (
            <div className="flex flex-col gap-0.5 mt-1">
              {toolCounts.map(([tool, count]) => {
                const category = getToolCategory(tool);
                const maxCount = toolCounts[0][1];
                const barPct = maxCount > 0 ? Math.max((count / maxCount) * 100, 3) : 0;
                return (
                  <div key={tool} className="flex items-center gap-2 h-4">
                    <span className="w-44 text-[10px] font-mono truncate shrink-0" style={{ color: CAT_HEX[category] }}>
                      <span className="w-2 h-2 rounded-sm inline-block mr-1" style={{ backgroundColor: CAT_HEX[category] }} />
                      {tool}
                    </span>
                    <div className="flex-1 h-2 rounded-sm bg-border/20 overflow-hidden">
                      <div
                        className="h-full rounded-sm"
                        style={{ width: `${barPct}%`, backgroundColor: CAT_HEX[category], opacity: 0.6 }}
                      />
                    </div>
                    <span className="w-8 text-[10px] text-dim text-right shrink-0">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {span.toolCalls.length > 0 && (
        <div>
          <button
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded hover:bg-white/[0.05] transition-colors flex items-center gap-1.5"
            style={{ color: "#22d3ee" }}
            onClick={() => setShowCalls(!showCalls)}
          >
            <span>{showCalls ? "▾" : "▸"}</span>
            {showCalls ? "Hide" : "Show"} {span.toolCalls.length} tool calls
          </button>

          {showCalls && (
            <SubagentCallTable toolCalls={span.toolCalls} spanStartMs={span.startMs} />
          )}
        </div>
      )}
    </div>
  );
}

function SubagentCallTable({ toolCalls, spanStartMs }: { toolCalls: SubagentSpan["toolCalls"]; spanStartMs: number }) {
  return (
    <div className="flex flex-col border border-border/50 rounded overflow-hidden mt-1 max-h-80 overflow-y-auto">
      <div className="flex items-center gap-2 px-2 py-1 bg-bg-header text-[10px] text-dim uppercase tracking-wider font-semibold border-b border-border/50 sticky top-0 z-10">
        <span className="w-6 text-center">#</span>
        <span className="w-16">Offset</span>
        <span className="w-14">Time</span>
        <span className="flex-1">Tool</span>
      </div>

      {toolCalls.map((toolCall, index) => {
        const category = getToolCategory(toolCall.tool);
        const offset = toolCall.tsMs > 0 ? toolCall.tsMs - spanStartMs : 0;

        return (
          <div
            key={index}
            className="flex items-center gap-2 px-2 py-0.5 border-b border-border/20 last:border-b-0 hover:bg-white/[0.02] transition-colors"
          >
            <span className="w-6 text-center text-[10px] text-dim">{index + 1}</span>
            <span className="w-16 text-[10px] font-mono text-dim">+{formatMs(offset)}</span>
            <span className="w-14 text-[10px] font-mono text-dim">
              {toolCall.ts ? new Date(toolCall.ts).toLocaleTimeString("en-GB", { hour12: false }) : "—"}
            </span>
            <span className="flex-1 text-[10px] font-mono flex items-center gap-1.5" style={{ color: CAT_HEX[category] }}>
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: CAT_HEX[category] }} />
              {toolCall.tool}
            </span>
          </div>
        );
      })}
    </div>
  );
}