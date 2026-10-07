import { useState } from "react";
import type { RunSummary } from "../log-browser/tool-timeline-types";
import { formatMs } from "../log-browser/tool-timeline-shared";

interface RunSummaryPanelProps {
  summary: RunSummary;
}

type SortKey = "name" | "count" | "totalDurationMs" | "totalTokens" | "compactionCount" | "maxDepth";

export function RunSummaryPanel({ summary }: RunSummaryPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>("totalTokens");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sorted = [...summary.agentBreakdown].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    if (sortKey === "name") return mul * a.name.localeCompare(b.name);
    return mul * ((a[sortKey] as number) - (b[sortKey] as number));
  });

  const totalTokens = summary.totalPromptTokens + summary.totalCompletionTokens;

  const stats = [
    { label: "Duration", value: formatMs(summary.totalDurationMs) },
    { label: "Invocations", value: summary.totalInvocations.toLocaleString() },
    { label: "Max Depth", value: summary.maxDepth },
    { label: "Total Tokens", value: totalTokens.toLocaleString() },
    { label: "Prompt", value: summary.totalPromptTokens.toLocaleString() },
    { label: "Completion", value: summary.totalCompletionTokens.toLocaleString() },
    { label: "Cached", value: summary.totalCachedTokens.toLocaleString() },
    { label: "Compactions", value: summary.compactionCount },
  ];

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortAsc ? " ▴" : " ▾") : "");

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="px-3 py-2 rounded bg-bg-sidebar border border-border">
            <div className="text-[10px] text-dim uppercase">{s.label}</div>
            <div className="text-sm font-semibold mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Agent breakdown table */}
      <div>
        <h3 className="text-xs font-medium text-dim mb-2">Agent Breakdown</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-dim border-b border-border">
              {(
                [
                  ["name", "Agent"],
                  ["count", "Count"],
                  ["totalDurationMs", "Duration"],
                  ["totalTokens", "Tokens"],
                  ["compactionCount", "Compactions"],
                  ["maxDepth", "Max Depth"],
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="text-left py-1 px-2 cursor-pointer hover:text-fg-primary select-none"
                >
                  {label}
                  {sortArrow(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.name} className="border-b border-border/50 hover:bg-bg-hover">
                <td className="py-1 px-2 font-medium">{row.name}</td>
                <td className="py-1 px-2 tabular-nums">{row.count}</td>
                <td className="py-1 px-2 tabular-nums">{formatMs(row.totalDurationMs)}</td>
                <td className="py-1 px-2 tabular-nums">{row.totalTokens.toLocaleString()}</td>
                <td className="py-1 px-2 tabular-nums">{row.compactionCount}</td>
                <td className="py-1 px-2 tabular-nums">{row.maxDepth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
