import type { AssistantUsageEntry } from "../log-browser/tool-timeline-types";

interface NodeTokenCostChartProps {
  entries: AssistantUsageEntry[];
  width?: number;
  height?: number;
}

export function NodeTokenCostChart({ entries, width = 700, height = 180 }: NodeTokenCostChartProps) {
  if (entries.length === 0) {
    return <div className="text-dim text-xs">No token usage data</div>;
  }

  const MARGIN = { top: 12, right: 16, bottom: 4, left: 50 };
  const barH = 16;
  const gap = 3;
  const innerW = width - MARGIN.left - MARGIN.right;
  const totalH = Math.max(height, MARGIN.top + MARGIN.bottom + entries.length * (barH + gap));
  const maxTokens = Math.max(...entries.map((e) => e.totalTokens), 1);

  return (
    <svg width={width} height={totalH}>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {entries.map((entry, i) => {
          const y = i * (barH + gap);
          const cachedW = (entry.cachedTokens / maxTokens) * innerW;
          const promptW = ((entry.promptTokens - entry.cachedTokens) / maxTokens) * innerW;
          const completionW = (entry.completionTokens / maxTokens) * innerW;

          return (
            <g key={i} transform={`translate(0,${y})`}>
              {/* Turn label */}
              <text x={-6} y={barH / 2 + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.5">
                T{i + 1}
              </text>
              {/* Cached (blue) */}
              <rect x={0} y={0} width={Math.max(0, cachedW)} height={barH} rx={2} fill="#3b82f6" opacity="0.7">
                <title>Cached: {entry.cachedTokens.toLocaleString()}</title>
              </rect>
              {/* Prompt (gray) */}
              <rect x={cachedW} y={0} width={Math.max(0, promptW)} height={barH} rx={2} fill="#6b7280" opacity="0.6">
                <title>Prompt: {(entry.promptTokens - entry.cachedTokens).toLocaleString()}</title>
              </rect>
              {/* Completion (green) */}
              <rect x={cachedW + promptW} y={0} width={Math.max(0, completionW)} height={barH} rx={2} fill="#22c55e" opacity="0.7">
                <title>Completion: {entry.completionTokens.toLocaleString()}</title>
              </rect>
              {/* Total label */}
              <text
                x={Math.min(cachedW + promptW + completionW + 4, innerW - 30)}
                y={barH / 2 + 3}
                fontSize="9"
                fill="currentColor"
                opacity="0.6"
              >
                {entry.totalTokens.toLocaleString()}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
