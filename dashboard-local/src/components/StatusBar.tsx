import type { OrchestratorState } from "../types";

function formatElapsed(startedAt: number): string {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  return `${min}m ${sec}s`;
}

const dotColor: Record<string, string> = {
  idle: "bg-dim",
  polling: "bg-info",
  working: "bg-success",
  stopping: "bg-warn",
};

export function StatusBar({ state }: { state: OrchestratorState }) {
  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-bg-panel border-b border-border flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${dotColor[state.status]}`} />
        <span className="font-semibold text-xs tracking-widest">{state.status.toUpperCase()}</span>
      </div>

      {state.currentIssue && (
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-info font-mono text-xs">{state.currentIssue.key}</span>
          <span className="text-xs max-w-[400px] truncate">{state.currentIssue.summary}</span>
        </div>
      )}

      {state.currentProfile && <span className="text-dim text-xs">Profile: {state.currentProfile}</span>}

      {state.startedAt && <span className="text-dim text-xs">Elapsed: {formatElapsed(state.startedAt)}</span>}

      <span className="text-dim text-xs">
        Queue: {state.queueSize} &middot; Done: {state.completedToday.length}
      </span>
    </div>
  );
}
