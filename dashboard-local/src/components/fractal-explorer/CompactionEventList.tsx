import type { ContextWindowEntry } from "../log-browser/tool-timeline-types";

interface CompactionEventListProps {
  entries: ContextWindowEntry[];
}

interface CompactionEvent {
  tsMs: number;
  beforeUtilization: number;
  afterUtilization: number;
  beforeTokens: number;
  afterTokens: number;
}

function detectCompactions(entries: ContextWindowEntry[]): CompactionEvent[] {
  const events: CompactionEvent[] = [];
  for (let i = 1; i < entries.length; i++) {
    const drop = entries[i - 1].utilization - entries[i].utilization;
    if (drop > 10) {
      events.push({
        tsMs: entries[i].tsMs,
        beforeUtilization: entries[i - 1].utilization,
        afterUtilization: entries[i].utilization,
        beforeTokens: entries[i - 1].usedTokens,
        afterTokens: entries[i].usedTokens,
      });
    }
  }
  return events;
}

function formatTime(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")}`;
}

export function CompactionEventList({ entries }: CompactionEventListProps) {
  const compactions = detectCompactions(entries);

  if (compactions.length === 0) {
    return <div className="text-dim text-xs">No compaction events detected</div>;
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-dim mb-1">Compaction Events ({compactions.length})</h4>
      {compactions.map((c, i) => (
        <div key={i} className="flex items-center gap-3 text-xs px-2 py-1 rounded bg-bg-hover">
          <span className="text-dim tabular-nums">{formatTime(c.tsMs)}</span>
          <span className="text-warn font-medium">
            {c.beforeUtilization.toFixed(1)}% → {c.afterUtilization.toFixed(1)}%
          </span>
          <span className="text-dim">
            {c.beforeTokens.toLocaleString()} → {c.afterTokens.toLocaleString()} tokens
          </span>
          <span className="text-dim">
            (−{(c.beforeTokens - c.afterTokens).toLocaleString()})
          </span>
        </div>
      ))}
    </div>
  );
}
