import { useCallback, useState } from "react";
import { ContextWindowChart } from "./ContextWindowChart";
import { ToolTimelineCallList } from "./ToolTimelineCallList";
import { SubagentOverview } from "./ToolTimelineSubagents";
import { ToolTimelineSummary } from "./ToolTimelineSummary";
import { useToolTimelineData } from "./useToolTimelineData";

/**
 * Visual timeline of all tool calls in a task execution.
 *
 * Sequential event table with inline duration bars, category legend,
 * skill inventory, and expandable detail views for args/return values.
 */
export function ToolTimeline({
  preToolFile,
  toolOutputFile,
  cliDebugFile,
}: {
  preToolFile: string;
  toolOutputFile?: string;
  cliDebugFile?: string;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const { loading, timeline, subagentSpans, subagentByName, contextWindowEntries, assistantUsageEntries } =
    useToolTimelineData({
      preToolFile,
      toolOutputFile,
      cliDebugFile,
    });

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
  const maxDuration = Math.max(...timeline.map((e) => e.durationMs ?? 0));

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-col gap-2 p-3 pb-2 shrink-0">
        <ToolTimelineSummary timeline={timeline} totalDuration={totalDuration} />
        {subagentSpans.length > 0 && <SubagentOverview spans={subagentSpans} />}
        <ContextWindowChart
          entries={contextWindowEntries}
          usageEntries={assistantUsageEntries}
          subagentSpans={subagentSpans}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        <ToolTimelineCallList
          timeline={timeline}
          expandedIndex={expandedIndex}
          onToggle={toggleExpand}
          maxDuration={maxDuration}
          subagentByName={subagentByName}
        />
      </div>
    </div>
  );
}
