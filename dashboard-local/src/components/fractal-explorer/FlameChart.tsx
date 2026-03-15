import { useState, type MouseEvent } from "react";
import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";

interface FlameChartProps {
  root: SubagentTreeNode;
  allNodes: SubagentTreeNode[];
  onSelectNode: (id: string) => void;
}

const AGENT_COLORS: Record<string, string> = {
  coordinator: "#6366f1",
  orchestrator: "#6366f1",
  writer: "#22c55e",
  reviewer: "#f59e0b",
  analyzer: "#3b82f6",
  scout: "#8b5cf6",
  planner: "#ec4899",
  coder: "#14b8a6",
  scribe: "#f97316",
};

function agentColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (lower.includes(key)) return color;
  }
  // Hash-based fallback
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

const ROW_HEIGHT = 22;
const ROW_GAP = 2;
const MARGIN = { top: 24, right: 8, bottom: 8, left: 8 };

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function FlameChart({ root, allNodes, onSelectNode }: FlameChartProps) {
  const nodes = allNodes.filter((n) => n.depth > 0 && n.startMs > 0);
  if (nodes.length === 0) return <div className="text-dim text-xs">No invocation data</div>;

  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  const minTs = root.startMs;
  const maxTs = root.endMs ?? root.startMs;
  const spanMs = Math.max(maxTs - minTs, 1);

  const width = 900;
  const innerW = width - MARGIN.left - MARGIN.right;
  const totalHeight = MARGIN.top + MARGIN.bottom + (maxDepth + 1) * (ROW_HEIGHT + ROW_GAP);

  const scaleX = (tsMs: number) => ((tsMs - minTs) / spanMs) * innerW;

  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: SubagentTreeNode } | null>(null);

  const handleMouseEnter = (node: SubagentTreeNode, e: MouseEvent) => {
    setTooltip({ x: e.clientX, y: e.clientY, node });
  };

  // Time axis ticks
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const tsMs = minTs + (i / (tickCount - 1)) * spanMs;
    return { tsMs, x: scaleX(tsMs), label: formatTime(tsMs) };
  });

  return (
    <div className="relative">
      <svg width={width} height={totalHeight}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Time axis */}
          {ticks.map((t, i) => (
            <text key={i} x={t.x} y={-8} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.4">
              {t.label}
            </text>
          ))}

          {/* Depth labels */}
          {Array.from({ length: maxDepth }, (_, i) => (
            <text
              key={i}
              x={-4}
              y={(i + 1) * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2 + 3}
              textAnchor="end"
              fontSize="8"
              fill="currentColor"
              opacity="0.3"
            >
              d{i + 1}
            </text>
          ))}

          {/* Blocks */}
          {nodes.map((node) => {
            const x = scaleX(node.startMs);
            const w = Math.max(2, scaleX(node.endMs ?? node.startMs) - x);
            const y = (node.depth - 1) * (ROW_HEIGHT + ROW_GAP);
            const color = agentColor(node.name);

            return (
              <g
                key={node.id}
                onClick={() => onSelectNode(node.id)}
                onMouseEnter={(e) => handleMouseEnter(node, e)}
                onMouseLeave={() => setTooltip(null)}
                className="cursor-pointer"
              >
                <rect x={x} y={y} width={w} height={ROW_HEIGHT} rx={3} fill={color} opacity="0.8" />
                {w > 40 && (
                  <text
                    x={x + 4}
                    y={y + ROW_HEIGHT / 2 + 3}
                    fontSize="9"
                    fill="white"
                    className="pointer-events-none"
                  >
                    {node.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1.5 rounded bg-[#1e293b] border border-[#334155] text-xs text-white pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
        >
          <div className="font-medium">{tooltip.node.name} #{tooltip.node.invocationIndex}</div>
          <div className="text-[#94a3b8]">
            Depth {tooltip.node.depth} · {formatDuration(tooltip.node.durationMs)} · {tooltip.node.toolCallCount} tools
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")}`;
}
