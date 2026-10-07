import { useState } from "react";
import { formatMs } from "./tool-timeline-shared";
import { formatDate, statusBadge, type IssueGroup } from "./utils";
import { ExecutionRow } from "./ExecutionRow";
import { Button, ButtonVariant } from "../Button";

export function IssueGroupSection({
  group,
  onSelectFile,
  onOpenTimeline,
}: {
  group: IssueGroup;
  onSelectFile: (filename: string) => void;
  onOpenTimeline?: (preToolFile: string, toolOutputFile?: string, cliDebugFile?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const latest = group.executions[0];
  const status = group.latestStatus ?? "unknown";
  const badge = statusBadge[status] ?? "bg-border text-dim";

  return (
    <div className="mb-1">
      <Button
        onClick={() => setExpanded(!expanded)}
        variant={ButtonVariant.Ghost}
        className="flex items-center gap-2 w-full px-2 py-2 rounded hover:bg-white/[0.03] text-left"
      >
        <span className={`text-[10px] transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}>▶</span>
        <span className="font-semibold font-mono text-[13px] text-info">{group.taskId}</span>
        <span className={`text-[10px] px-1.5 py-px rounded-full font-medium ${badge}`}>{status}</span>
        <span className="text-dim text-[10px]">
          {group.executions.length} run{group.executions.length !== 1 ? "s" : ""}
        </span>
        {latest?.summary?.durationMs != null && (
          <span className="text-dim text-[10px]">{formatMs(latest.summary.durationMs)}</span>
        )}
        <span className="text-dim text-[10px] ml-auto">{formatDate(group.latestTimestamp)}</span>
        {latest?.summary?.prUrl && (
          <a
            href={latest.summary.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-info text-[10px] font-semibold no-underline hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            PR ↗
          </a>
        )}
      </Button>

      {expanded && (
        <div className="ml-5 border-l border-border/50 pl-3 mb-2">
          {group.executions.map((exec) => (
            <ExecutionRow key={exec.id} group={exec} onSelectFile={onSelectFile} onOpenTimeline={onOpenTimeline} />
          ))}
        </div>
      )}
    </div>
  );
}
