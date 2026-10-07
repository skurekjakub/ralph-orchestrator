import { useCallback, useState } from "react";
import { ContextWindowChart } from "./ContextWindowChart";
import { RunTelemetrySummary } from "./RunTelemetrySummary";
import { ToolTimelineCallList } from "./ToolTimelineCallList";
import { SubagentOverview } from "./ToolTimelineSubagents";
import { ToolTimelineSummary } from "./ToolTimelineSummary";
import { UnavailableNotice } from "./UnavailableNotice";
import { NO_TOKEN_USAGE_MESSAGE } from "./tool-timeline-shared";
import type { TimelineFiles } from "./tool-timeline-types";
import { useToolTimelineData } from "./useToolTimelineData";

/**
 * Visual timeline of all tool calls in a task execution.
 *
 * Sequential event table with inline duration bars, category legend,
 * skill inventory, and expandable detail views for args/return values.
 * A Claude Code run adds its run telemetry counts and shows an explicit
 * "not available" state in place of the token and context-window charts.
 */
export function ToolTimeline({ files }: { files: TimelineFiles }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const {
    loading,
    timeline,
    subagentSpans,
    subagentByName,
    subagentByToolUseId,
    copilotSubagentSpans,
    contextWindowEntries,
    assistantUsageEntries,
    telemetry,
    telemetryUnreadable,
  } = useToolTimelineData(files);

  const toggleExpand = useCallback((index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  if (loading) {
    return <div className="text-dim text-sm p-4">Loading timeline...</div>;
  }

  const hasCalls = timeline.length > 0;
  const totalDuration = hasCalls ? timeline[timeline.length - 1].ts - timeline[0].ts : 0;
  const maxDuration = Math.max(0, ...timeline.map((e) => e.durationMs ?? 0));

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-col gap-2 p-3 pb-2 shrink-0">
        {hasCalls ? (
          <ToolTimelineSummary timeline={timeline} totalDuration={totalDuration} />
        ) : (
          <div className="text-dim text-sm">No tool calls found</div>
        )}
        {telemetry && <RunTelemetrySummary telemetry={telemetry} />}
        {telemetryUnreadable && (
          <UnavailableNotice
            title="Run telemetry"
            message="The run telemetry file could not be read as schema version 1 telemetry."
          />
        )}
        {subagentSpans.length > 0 && <SubagentOverview spans={subagentSpans} />}
        <ContextWindowChart
          entries={contextWindowEntries}
          usageEntries={assistantUsageEntries}
          subagentSpans={copilotSubagentSpans}
        />
        {telemetry && <UnavailableNotice title="Context window and token usage" message={NO_TOKEN_USAGE_MESSAGE} />}
      </div>
      {hasCalls && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          <ToolTimelineCallList
            timeline={timeline}
            expandedIndex={expandedIndex}
            onToggle={toggleExpand}
            maxDuration={maxDuration}
            subagentByName={subagentByName}
            subagentByToolUseId={subagentByToolUseId}
          />
        </div>
      )}
    </div>
  );
}
