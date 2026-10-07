import { useState } from "react";
import type { RunSummary } from "../log-browser/tool-timeline-types";
import { formatMs, NO_TOKEN_USAGE_MESSAGE } from "../log-browser/tool-timeline-shared";
import { UnavailableNotice } from "../log-browser/UnavailableNotice";

interface RunSummaryPanelProps {
  summary: RunSummary;
}

type SortKey = "name" | "count" | "totalDurationMs" | "totalTokens" | "compactionCount" | "maxDepth";

/** Shown in place of a token figure the run's logs do not record. */
const NOT_RECORDED = "n/a";

function formatTokenCount(count: number | null): string {
  return count === null ? NOT_RECORDED : count.toLocaleString();
}

export function RunSummaryPanel({ summary }: RunSummaryPanelProps) {
  const tokensRecorded = summary.totalPromptTokens !== null;
  const [sortKey, setSortKey] = useState<SortKey>(tokensRecorded ? "totalTokens" : "totalDurationMs");
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
    return mul * ((a[sortKey] ?? -1) - (b[sortKey] ?? -1));
  });

  const totalTokens =
    summary.totalPromptTokens === null || summary.totalCompletionTokens === null
      ? null
      : summary.totalPromptTokens + summary.totalCompletionTokens;

  const stats = [
    { label: "Duration", value: formatMs(summary.totalDurationMs) },
    { label: "Invocations", value: summary.totalInvocations.toLocaleString() },
    { label: "Max Depth", value: summary.maxDepth },
    { label: "Total Tokens", value: formatTokenCount(totalTokens) },
    { label: "Prompt", value: formatTokenCount(summary.totalPromptTokens) },
    { label: "Completion", value: formatTokenCount(summary.totalCompletionTokens) },
    { label: "Cached", value: formatTokenCount(summary.totalCachedTokens) },
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

      {!tokensRecorded && <UnavailableNotice title="Token usage" message={NO_TOKEN_USAGE_MESSAGE} />}

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
                <td className="py-1 px-2 tabular-nums">{formatTokenCount(row.totalTokens)}</td>
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
