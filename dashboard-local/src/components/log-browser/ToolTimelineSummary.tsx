import { useMemo } from "react";
import { getToolCategory } from "./tool-timeline-categories";
import type { ToolCallEntry } from "./tool-timeline-types";
import { CAT_HEX } from "./tool-timeline-shared";

export function ToolTimelineSummary({
  timeline,
  totalDuration,
}: {
  timeline: ToolCallEntry[];
  totalDuration: number;
}) {
  return (
    <>
      <TimelineHeader timeline={timeline} totalDuration={totalDuration} />
      <div className="flex gap-4 flex-wrap">
        <CategoryLegend timeline={timeline} />
        <SkillInventory timeline={timeline} />
      </div>
    </>
  );
}

function TimelineHeader({ timeline, totalDuration }: { timeline: ToolCallEntry[]; totalDuration: number }) {
  const startTime = new Date(timeline[0].ts).toLocaleTimeString("en-GB", { hour12: false });
  const endTime = new Date(timeline[timeline.length - 1].ts).toLocaleTimeString("en-GB", { hour12: false });
  const durationMin = Math.floor(totalDuration / 60000);
  const durationSec = Math.floor((totalDuration % 60000) / 1000);
  const skillCount = timeline.filter((entry) => entry.isSkill).length;

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

function CategoryLegend({ timeline }: { timeline: ToolCallEntry[] }) {
  const categories = useMemo(() => {
    const counts = new Map<ReturnType<typeof getToolCategory>, number>();
    for (const entry of timeline) {
      const category = getToolCategory(entry.tool);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [timeline]);

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {categories.map(([category, count]) => (
        <span
          key={category}
          className="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={{ backgroundColor: `${CAT_HEX[category]}22`, color: CAT_HEX[category] }}
        >
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: CAT_HEX[category] }} />
          {category} ({count})
        </span>
      ))}
    </div>
  );
}

function SkillInventory({ timeline }: { timeline: ToolCallEntry[] }) {
  const skills = useMemo(() => {
    return timeline.filter((entry) => entry.isSkill).map((entry) => entry.skillName ?? "unknown");
  }, [timeline]);

  const subagents = useMemo(() => {
    return timeline.filter((entry) => entry.isSubagent).map((entry) => entry.subagentName ?? "unknown");
  }, [timeline]);

  const uniqueSkills = [...new Set(skills)];
  const uniqueSubagents = [...new Set(subagents)];

  if (uniqueSkills.length === 0 && uniqueSubagents.length === 0) return null;

  return (
    <div className="flex gap-4 flex-wrap items-center">
      {uniqueSubagents.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-[10px] text-dim uppercase tracking-wider font-semibold">Subagents:</span>
          {uniqueSubagents.map((name) => (
            <span
              key={name}
              className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ backgroundColor: "#7d859022", color: "#7d8590" }}
            >
              {name}
            </span>
          ))}
        </div>
      )}
      {uniqueSkills.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center">
          <span className="text-[10px] text-dim uppercase tracking-wider font-semibold">Skills:</span>
          {uniqueSkills.map((name) => (
            <span
              key={name}
              className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ backgroundColor: "#a855f722", color: "#a855f7" }}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}