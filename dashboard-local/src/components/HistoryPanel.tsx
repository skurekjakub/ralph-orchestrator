import type { CompletedTask } from "../types";

function formatDuration(ms: number): string {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

const statusEmoji: Record<string, string> = {
  completed: "\u2705",
  partial: "\u26A0\uFE0F",
  blocked: "\u26D4",
  error: "\u274C",
};

const keyColor: Record<string, string> = {
  completed: "text-success",
  error: "text-error",
  partial: "text-warn",
  blocked: "text-dim",
};

interface Props {
  tasks: CompletedTask[];
}

export function HistoryPanel({ tasks }: Props) {
  return (
    <div className="flex flex-col border-b border-border flex-1 min-h-[100px]">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-header font-semibold text-[11px] uppercase tracking-wider text-dim border-b border-border shrink-0">
        History
        <span className="bg-border text-dim px-1.5 rounded-lg text-[10px] font-semibold">{tasks.length}</span>
      </div>
      <div className="px-3 py-2 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="text-dim text-[11px] italic">No completed tasks this session</div>
        ) : (
          <ul className="list-none">
            {[...tasks].reverse().map((task, i) => (
              <li key={i} className="flex items-center gap-1.5 py-0.5 text-xs">
                <span className="text-[13px]">{statusEmoji[task.status] ?? ""}</span>
                <span className={`font-semibold font-mono text-[11px] ${keyColor[task.status] ?? ""}`}>{task.key}</span>
                <span className="max-w-[200px] truncate text-[11px]">{task.summary}</span>
                <span className="text-dim text-[10px] ml-auto shrink-0">
                  {formatDuration(task.durationMs)} &middot; {formatTime(task.completedAt)}
                </span>
                {task.prUrl && (
                  <a
                    className="text-info no-underline text-[11px] font-semibold shrink-0 hover:underline"
                    href={task.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    PR
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
