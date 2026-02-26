import { useState, useEffect, useMemo, useCallback } from "react";
import {
  buildTimeline,
  getToolCategory,
  categoryColors,
  type ToolCallEntry,
} from "./timeline-parser";

/**
 * Visual timeline of all tool calls in a task execution.
 *
 * Shows a proportional bar chart of tool call durations, a legend by category,
 * a skill inventory, and an expandable list of all calls with args/return values.
 */
export function ToolTimeline({
  preToolFile,
  toolOutputFile,
}: {
  preToolFile: string;
  toolOutputFile?: string;
}) {
  const [preToolContent, setPreToolContent] = useState<string | null>(null);
  const [toolOutputContent, setToolOutputContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetches = [
      fetch(`/api/logs/${encodeURIComponent(preToolFile)}`).then((r) => r.text()),
      toolOutputFile
        ? fetch(`/api/logs/${encodeURIComponent(toolOutputFile)}`).then((r) => r.text())
        : Promise.resolve(null),
    ] as const;

    Promise.all(fetches).then(([pre, output]) => {
      if (cancelled) return;
      setPreToolContent(pre);
      setToolOutputContent(output);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [preToolFile, toolOutputFile]);

  const timeline = useMemo(() => {
    if (!preToolContent) return [];
    return buildTimeline(preToolContent, toolOutputContent);
  }, [preToolContent, toolOutputContent]);

  const toggleExpand = useCallback((index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  if (loading) {
    return <div className="text-dim text-sm p-4">Loading timeline...</div>;
  }
  if (timeline.length === 0) {
    return <div className="text-dim text-sm p-4">No tool calls found</div>;
  }

  const totalDuration = timeline[timeline.length - 1].ts - timeline[0].ts;

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
      <TimelineHeader timeline={timeline} totalDuration={totalDuration} />
      <TimelineBar timeline={timeline} totalDuration={totalDuration} onSelect={toggleExpand} />
      <div className="flex gap-4 flex-wrap">
        <CategoryLegend timeline={timeline} />
        <SkillInventory timeline={timeline} />
      </div>
      <CallList timeline={timeline} expandedIndex={expandedIndex} onToggle={toggleExpand} />
    </div>
  );
}

function TimelineHeader({ timeline, totalDuration }: { timeline: ToolCallEntry[]; totalDuration: number }) {
  const startTime = new Date(timeline[0].ts).toLocaleTimeString("en-GB", { hour12: false });
  const endTime = new Date(timeline[timeline.length - 1].ts).toLocaleTimeString("en-GB", { hour12: false });
  const durationMin = Math.floor(totalDuration / 60000);
  const durationSec = Math.floor((totalDuration % 60000) / 1000);
  const skillCount = timeline.filter((e) => e.isSkill).length;

  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <span className="font-semibold text-[12px] uppercase tracking-wider text-dim">
        Tool Timeline
      </span>
      <span className="text-[11px] text-dim">
        {startTime} → {endTime}
      </span>
      <span className="text-[11px] text-dim">
        {durationMin}m {durationSec}s
      </span>
      <span className="text-[11px] text-text">
        {timeline.length} calls
      </span>
      {skillCount > 0 && (
        <span className="text-[11px] text-purple-400 font-medium">
          {skillCount} skill{skillCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

/**
 * Proportional horizontal bar showing all tool calls as colored segments.
 * Each segment width is proportional to the call's duration relative to total.
 */
function TimelineBar({
  timeline,
  totalDuration,
  onSelect,
}: {
  timeline: ToolCallEntry[];
  totalDuration: number;
  onSelect: (index: number) => void;
}) {
  if (totalDuration === 0) return null;

  return (
    <div className="flex w-full h-6 rounded overflow-hidden bg-bg-panel border border-border">
      {timeline.map((entry) => {
        const pct = ((entry.durationMs ?? 0) / totalDuration) * 100;
        // Skip tiny slivers below 0.3% for visual clarity
        if (pct < 0.3) return null;
        const cat = getToolCategory(entry.tool);
        const colors = categoryColors[cat];

        return (
          <div
            key={entry.index}
            className={`${colors.bar} opacity-70 hover:opacity-100 cursor-pointer transition-opacity relative group`}
            style={{ width: `${pct}%`, minWidth: pct > 0.5 ? "2px" : "1px" }}
            onClick={() => onSelect(entry.index)}
            title={`${entry.tool} (${formatMs(entry.durationMs ?? 0)})`}
          >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 rounded bg-bg-header border border-border text-[9px] text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
              {entry.tool}
              <span className="text-dim ml-1">{formatMs(entry.durationMs ?? 0)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryLegend({ timeline }: { timeline: ToolCallEntry[] }) {
  const categories = useMemo(() => {
    const counts = new Map<ReturnType<typeof getToolCategory>, number>();
    for (const entry of timeline) {
      const cat = getToolCategory(entry.tool);
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [timeline]);

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {categories.map(([cat, count]) => {
        const colors = categoryColors[cat];
        return (
          <span key={cat} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
            <span className={`w-2 h-2 rounded-sm ${colors.bar}`} /> {cat} ({count})
          </span>
        );
      })}
    </div>
  );
}

function SkillInventory({ timeline }: { timeline: ToolCallEntry[] }) {
  const skills = useMemo(() => {
    return timeline.filter((e) => e.isSkill).map((e) => e.skillName ?? "unknown");
  }, [timeline]);

  if (skills.length === 0) return null;

  // Deduplicate for display while preserving order
  const uniqueSkills = [...new Set(skills)];

  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      <span className="text-[10px] text-dim uppercase tracking-wider font-semibold">Skills:</span>
      {uniqueSkills.map((name) => (
        <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-mono">
          {name}
        </span>
      ))}
    </div>
  );
}

function CallList({
  timeline,
  expandedIndex,
  onToggle,
}: {
  timeline: ToolCallEntry[];
  expandedIndex: number | null;
  onToggle: (index: number) => void;
}) {
  const startTs = timeline[0].ts;

  return (
    <div className="flex flex-col border border-border rounded overflow-hidden">
      {/* Table header */}
      <div className="flex items-center gap-2 px-2 py-1 bg-bg-header text-[10px] text-dim uppercase tracking-wider font-semibold border-b border-border">
        <span className="w-6 text-center">#</span>
        <span className="w-16">Offset</span>
        <span className="w-16">Duration</span>
        <span className="flex-1">Tool</span>
        <span className="w-16 text-center">Status</span>
      </div>

      {timeline.map((entry) => {
        const cat = getToolCategory(entry.tool);
        const colors = categoryColors[cat];
        const isExpanded = expandedIndex === entry.index;
        const offset = entry.ts - startTs;
        const displayName = entry.isSkill
          ? `skill → ${entry.skillName ?? "?"}`
          : entry.tool;

        return (
          <div key={entry.index} className="border-b border-border/30 last:border-b-0">
            <div
              className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/[0.03] transition-colors"
              onClick={() => onToggle(entry.index)}
            >
              <span className="w-6 text-center text-[10px] text-dim">{entry.index + 1}</span>
              <span className="w-16 text-[10px] font-mono text-dim">+{formatMs(offset)}</span>
              <span className="w-16 text-[10px] font-mono text-dim">{formatMs(entry.durationMs ?? 0)}</span>
              <span className={`flex-1 text-[11px] font-mono ${colors.text} flex items-center gap-1.5`}>
                <span className={`w-2 h-2 rounded-sm shrink-0 ${colors.bar}`} />
                {displayName}
              </span>
              <span className="w-16 text-center">
                {entry.status && (
                  <span className={`text-[9px] px-1 py-px rounded ${entry.status === "success" ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}>
                    {entry.status}
                  </span>
                )}
              </span>
              <span className="text-dim text-[10px] w-4 text-center">{isExpanded ? "▾" : "▸"}</span>
            </div>

            {isExpanded && (
              <ExpandedDetail entry={entry} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ExpandedDetail({ entry }: { entry: ToolCallEntry }) {
  const hasArgs = Object.keys(entry.args).length > 0;
  const hasReturn = entry.returnValue && entry.returnValue.trim().length > 0;

  return (
    <div className="px-4 py-2 bg-bg-panel/50 border-t border-border/20 space-y-2">
      <div className="flex gap-2 flex-wrap text-[10px] text-dim">
        <span>
          Time: <span className="text-text font-mono">{new Date(entry.ts).toLocaleTimeString("en-GB", { hour12: false })}</span>
        </span>
        {entry.durationMs != null && entry.durationMs > 0 && (
          <span>
            Duration: <span className="text-text font-mono">{formatMs(entry.durationMs)}</span>
          </span>
        )}
      </div>

      {hasArgs && (
        <div>
          <div className="text-[10px] text-dim uppercase tracking-wider font-semibold mb-0.5">Args</div>
          <pre className="text-[10px] font-mono text-text bg-bg/50 rounded p-1.5 m-0 overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
            {JSON.stringify(entry.args, null, 2)}
          </pre>
        </div>
      )}

      {hasReturn && (
        <div>
          <div className="text-[10px] text-dim uppercase tracking-wider font-semibold mb-0.5">Return Value</div>
          <pre className="text-[10px] font-mono text-text bg-bg/50 rounded p-1.5 m-0 overflow-x-auto whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
            {entry.returnValue}
          </pre>
        </div>
      )}

      {!hasArgs && !hasReturn && (
        <div className="text-[10px] text-dim italic">No details available</div>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}
