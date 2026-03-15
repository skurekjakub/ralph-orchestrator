import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";

interface InvocationTreeNodeProps {
  node: SubagentTreeNode;
  selectedNodeId: string | null;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

function peakUtilization(node: SubagentTreeNode): number {
  if (node.contextWindowEntries.length === 0) return 0;
  return Math.max(...node.contextWindowEntries.map((e) => e.utilization));
}

function utilizationDot(peak: number): string {
  if (peak > 80) return "bg-error";
  if (peak > 60) return "bg-warn";
  return "bg-success";
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function InvocationTreeNode({ node, selectedNodeId, expandedIds, onToggle, onSelect }: InvocationTreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedNodeId;
  const isRoot = node.depth === 0;
  const peak = peakUtilization(node);

  return (
    <div>
      <div
        onClick={() => onSelect(node.id)}
        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-bg-hover ${
          isSelected ? "bg-info/10 text-info" : "text-fg-primary"
        }`}
        style={{ paddingLeft: `${8 + node.depth * 16}px` }}
      >
        {/* Expand arrow */}
        <span
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(node.id); }}
          className={`w-3 text-center shrink-0 ${hasChildren ? "cursor-pointer text-dim hover:text-fg-primary" : "text-transparent"}`}
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : "·"}
        </span>

        {/* Agent name + invocation badge */}
        <span className="truncate font-medium">
          {isRoot ? "orchestrator" : node.name}
        </span>
        {!isRoot && node.invocationIndex > 0 && (
          <span className="text-dim text-[10px] shrink-0">#{node.invocationIndex}</span>
        )}

        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {/* Peak utilization dot */}
          {node.contextWindowEntries.length > 0 && (
            <span className={`w-1.5 h-1.5 rounded-full ${utilizationDot(peak)}`} title={`Peak: ${peak.toFixed(0)}%`} />
          )}
          {/* Duration */}
          <span className="text-dim text-[10px] tabular-nums">{formatDuration(node.durationMs)}</span>
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <InvocationTreeNode
              key={child.id}
              node={child}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
