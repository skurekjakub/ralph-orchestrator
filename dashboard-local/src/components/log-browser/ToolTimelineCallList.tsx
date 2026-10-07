import { getToolCategory } from "./tool-timeline-categories";
import type { SubagentSpan, ToolCallEntry } from "./tool-timeline-types";
import { SubagentInnerTimeline } from "./ToolTimelineSubagents";
import { CAT_HEX, formatMs } from "./tool-timeline-shared";

export function ToolTimelineCallList({
  timeline,
  expandedIndex,
  onToggle,
  maxDuration,
  subagentByName,
}: {
  timeline: ToolCallEntry[];
  expandedIndex: number | null;
  onToggle: (index: number) => void;
  maxDuration: number;
  subagentByName: Map<string, SubagentSpan>;
}) {
  const startTs = timeline[0].ts;

  return (
    <div className="flex flex-col border border-border rounded overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1 bg-bg-header text-[10px] text-dim uppercase tracking-wider font-semibold border-b border-border sticky top-0 z-10">
        <span className="w-6 text-center">#</span>
        <span className="w-16">Offset</span>
        <span className="w-16">Duration</span>
        <span className="w-24">Bar</span>
        <span className="flex-1">Tool</span>
        <span className="w-16 text-center">Status</span>
      </div>

      {timeline.map((entry) => {
        const category = getToolCategory(entry.tool, entry.toolKind);
        const isExpanded = expandedIndex === entry.index;
        const offset = entry.ts - startTs;
        const target = entry.isSkill ? entry.skillName : entry.subagentName;
        const displayName = entry.isSkill || entry.isSubagent ? `${entry.tool} → ${target ?? "?"}` : entry.tool;
        const barPct = maxDuration > 0 ? Math.max(((entry.durationMs ?? 0) / maxDuration) * 100, 1) : 0;

        return (
          <div key={entry.index} className="border-b border-border/30 last:border-b-0">
            <div
              className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/[0.03] transition-colors"
              onClick={() => onToggle(entry.index)}
            >
              <span className="w-6 text-center text-[10px] text-dim">{entry.index + 1}</span>
              <span className="w-16 text-[10px] font-mono text-dim">+{formatMs(offset)}</span>
              <span className="w-16 text-[10px] font-mono text-dim">{formatMs(entry.durationMs ?? 0)}</span>
              <span className="w-24">
                <div className="h-2.5 rounded-sm bg-border/30 overflow-hidden">
                  <div
                    className="h-full rounded-sm transition-all"
                    style={{ width: `${barPct}%`, backgroundColor: CAT_HEX[category], opacity: 0.75 }}
                  />
                </div>
              </span>
              <span
                className="flex-1 text-[11px] font-mono flex items-center gap-1.5"
                style={{ color: CAT_HEX[category] }}
              >
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: CAT_HEX[category] }} />
                {entry.agent && <span className="text-dim">{entry.agent} ›</span>}
                {displayName}
              </span>
              <span className="w-16 text-center">
                {entry.status && (
                  <span
                    className={`text-[9px] px-1 py-px rounded ${entry.status === "success" ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}
                  >
                    {entry.status}
                  </span>
                )}
              </span>
              <span className="text-dim text-[10px] w-4 text-center">{isExpanded ? "▾" : "▸"}</span>
            </div>

            {isExpanded && (
              <ExpandedDetail
                entry={entry}
                subagentSpan={entry.isSubagent ? subagentByName.get(entry.subagentName ?? "") : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ExpandedDetail({ entry, subagentSpan }: { entry: ToolCallEntry; subagentSpan?: SubagentSpan }) {
  const hasArgs = Object.keys(entry.args).length > 0;
  const hasReturn = entry.returnValue && entry.returnValue.trim().length > 0;

  return (
    <div className="px-4 py-2 bg-bg-panel/50 border-t border-border/20 space-y-2">
      <div className="flex gap-2 flex-wrap text-[10px] text-dim">
        <span>
          Time:{" "}
          <span className="text-text font-mono">
            {new Date(entry.ts).toLocaleTimeString("en-GB", { hour12: false })}
          </span>
        </span>
        {entry.durationMs != null && entry.durationMs > 0 && (
          <span>
            Duration: <span className="text-text font-mono">{formatMs(entry.durationMs)}</span>
          </span>
        )}
      </div>

      {subagentSpan && <SubagentInnerTimeline span={subagentSpan} />}

      {!subagentSpan && hasArgs && (
        <div>
          <div className="text-[10px] text-dim uppercase tracking-wider font-semibold mb-0.5">Args</div>
          <pre className="text-[10px] font-mono text-text bg-bg/50 rounded p-1.5 m-0 overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
            {JSON.stringify(entry.args, null, 2)}
          </pre>
        </div>
      )}

      {!subagentSpan && hasReturn && (
        <div>
          <div className="text-[10px] text-dim uppercase tracking-wider font-semibold mb-0.5">Return Value</div>
          <pre className="text-[10px] font-mono text-text bg-bg/50 rounded p-1.5 m-0 overflow-x-auto whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
            {entry.returnValue}
          </pre>
        </div>
      )}

      {!subagentSpan && !hasArgs && !hasReturn && (
        <div className="text-[10px] text-dim italic">No details available</div>
      )}
    </div>
  );
}
