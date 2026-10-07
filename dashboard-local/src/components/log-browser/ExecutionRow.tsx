import type { TaskLogFileKey, TaskLogGroup } from "../../types";
import { formatMs } from "./tool-timeline-shared";
import { formatDate, statusBadge, fileLabels } from "./utils";
import { Button, ButtonVariant, ButtonSize } from "../Button";
import { SessionFileList } from "./SessionFileList";
import type { TimelineFiles } from "./tool-timeline-types";

export function ExecutionRow({
  group,
  onSelectFile,
  onOpenTimeline,
}: {
  group: TaskLogGroup;
  onSelectFile: (filename: string) => void;
  onOpenTimeline?: (files: TimelineFiles) => void;
}) {
  const status = group.summary?.status ?? "unknown";
  const badge = statusBadge[status] ?? "bg-border text-dim";

  return (
    <div className="py-1.5 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-dim text-[10px]">{formatDate(group.timestamp)}</span>
        <span className={`text-[9px] px-1 py-px rounded-full font-medium ${badge}`}>{status}</span>
        {group.summary?.durationMs != null && (
          <span className="text-dim text-[10px]">{formatMs(group.summary.durationMs)}</span>
        )}
        {group.summary?.prUrl && (
          <a
            href={group.summary.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-info text-[10px] font-semibold no-underline hover:underline ml-auto"
          >
            PR ↗
          </a>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {(Object.keys(fileLabels) as TaskLogFileKey[]).map((key) => {
          const filename = group.files[key];
          const fileLabel = fileLabels[key];
          if (!filename || !fileLabel) return null;
          const { label, icon } = fileLabel;
          return (
            <Button
              key={key}
              onClick={() => onSelectFile(filename)}
              variant={ButtonVariant.Subtle}
              size={ButtonSize.XS}
              className="flex items-center gap-1"
            >
              <span>{icon}</span>
              {label}
            </Button>
          );
        })}
        {(group.files.preTool || group.files.claudeRunTelemetry) && onOpenTimeline && (
          <Button
            onClick={() =>
              onOpenTimeline({
                preTool: group.files.preTool,
                toolOutput: group.files.toolOutput,
                cliDebug: group.files.cliDebug,
                runTelemetry: group.files.claudeRunTelemetry,
              })
            }
            variant={ButtonVariant.Subtle}
            size={ButtonSize.XS}
            className="flex items-center gap-1 !bg-purple-500/20 !text-purple-400 hover:!bg-purple-500/30"
          >
            <span>⏱</span>
            Timeline
          </Button>
        )}
      </div>

      {group.files.claudeSessions && (
        <SessionFileList folder={group.files.claudeSessions} onSelectFile={onSelectFile} />
      )}
    </div>
  );
}
