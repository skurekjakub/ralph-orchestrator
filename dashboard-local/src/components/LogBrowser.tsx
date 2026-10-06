import { useMemo, useState, useCallback } from "react";
import { useLogBrowser } from "../useLogBrowser";
import type { IssueGroup } from "./log-browser/utils";
import { IssueGroupSection } from "./log-browser/IssueGroupSection";
import { DailyLogsSection } from "./log-browser/DailyLogsSection";
import { FileViewer } from "./log-browser/FileViewer";
import { ToolTimeline } from "./log-browser/ToolTimeline";
import { Button, ButtonVariant } from "./Button";

export function LogBrowser() {
  const { groups, loading, selectedFile, fileContent, fileLoading, selectFile, refresh } = useLogBrowser();

  const [timelineFiles, setTimelineFiles] = useState<{
    preTool: string;
    toolOutput?: string;
    cliDebug?: string;
  } | null>(null);

  const openTimeline = useCallback(
    (preToolFile: string, toolOutputFile?: string, cliDebugFile?: string) => {
      setTimelineFiles({ preTool: preToolFile, toolOutput: toolOutputFile, cliDebug: cliDebugFile });
      selectFile(null); // Clear file view when opening timeline
    },
    [selectFile],
  );

  const closeTimeline = useCallback(() => setTimelineFiles(null), []);

  const taskGroups = groups.filter((g) => g.timestamp);
  const dailyLogs = groups.filter((g) => !g.timestamp);

  const issueGroups = useMemo(() => {
    const map = new Map<string, IssueGroup>();
    for (const group of taskGroups) {
      if (!map.has(group.taskId)) {
        map.set(group.taskId, {
          taskId: group.taskId,
          executions: [],
        });
      }
      map.get(group.taskId)!.executions.push(group);
    }
    for (const ig of map.values()) {
      ig.executions.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      const latest = ig.executions[0];
      ig.latestStatus = latest?.summary?.status;
      ig.latestTimestamp = latest?.timestamp;
    }
    return [...map.values()].sort((a, b) => (b.latestTimestamp ?? 0) - (a.latestTimestamp ?? 0));
  }, [taskGroups]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-header border-b border-border shrink-0">
        <span className="font-semibold text-[11px] uppercase tracking-wider text-dim">Log Browser</span>
        <span className="bg-border text-dim px-1.5 rounded-lg text-[10px] font-semibold">{taskGroups.length} runs</span>
        <Button onClick={refresh} variant={ButtonVariant.Ghost} className="ml-auto text-info hover:underline">
          Refresh
        </Button>
        {(selectedFile || timelineFiles) && (
          <Button
            onClick={() => {
              selectFile(null);
              closeTimeline();
            }}
            variant={ButtonVariant.Ghost}
          >
            ← Back
          </Button>
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-h-0 ${timelineFiles ? "" : "overflow-y-auto"}`}>
        {loading ? (
          <div className="text-dim text-sm p-4">Loading logs...</div>
        ) : timelineFiles ? (
          <ToolTimeline
            preToolFile={timelineFiles.preTool}
            toolOutputFile={timelineFiles.toolOutput}
            cliDebugFile={timelineFiles.cliDebug}
          />
        ) : selectedFile ? (
          <FileViewer filename={selectedFile} content={fileContent} loading={fileLoading} />
        ) : (
          <div className="p-2">
            {issueGroups.map((ig) => (
              <IssueGroupSection key={ig.taskId} group={ig} onSelectFile={selectFile} onOpenTimeline={openTimeline} />
            ))}

            {dailyLogs.length > 0 && <DailyLogsSection logs={dailyLogs} onSelectFile={selectFile} />}

            {issueGroups.length === 0 && dailyLogs.length === 0 && (
              <div className="text-dim text-[11px] italic p-4">No log files found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
