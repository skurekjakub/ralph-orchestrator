import { useState } from "react";
import type { TaskLogGroup } from "../../types";
import { Button, ButtonVariant } from "../Button";

export function DailyLogsSection({
  logs,
  onSelectFile,
}: {
  logs: TaskLogGroup[];
  onSelectFile: (filename: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <Button
        onClick={() => setExpanded(!expanded)}
        variant={ButtonVariant.Ghost}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-white/[0.03] text-left"
      >
        <span
          className={`text-[10px] transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <span className="font-semibold text-[11px] text-dim uppercase tracking-wider">
          Daily Logs
        </span>
        <span className="bg-border text-dim px-1.5 rounded-lg text-[10px] font-semibold">
          {logs.length}
        </span>
      </Button>

      {expanded && (
        <div className="ml-5 border-l border-border/50 pl-3">
          {logs.map((group) => (
            <div
              key={group.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.03] cursor-pointer"
              onClick={() => group.files.log && onSelectFile(group.files.log)}
            >
              <span className="text-[13px]">📋</span>
              <span className="font-mono text-[11px] text-info">
                {group.id}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
