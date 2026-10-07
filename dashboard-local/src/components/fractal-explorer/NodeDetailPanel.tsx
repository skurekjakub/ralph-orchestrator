import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";
import { ZoomableUtilizationChart } from "./ZoomableUtilizationChart";
import { NodeTokenCostChart } from "./NodeTokenCostChart";
import { CompactionEventList } from "./CompactionEventList";
import { formatMs } from "../log-browser/tool-timeline-shared";

interface NodeDetailPanelProps {
  node: SubagentTreeNode;
  ancestorChain: string[];
}

export function NodeDetailPanel({ node, ancestorChain }: NodeDetailPanelProps) {
  const label = node.depth === 0 ? "orchestrator" : `${node.name} #${node.invocationIndex}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        {/* Breadcrumb */}
        {ancestorChain.length > 0 && <div className="text-[10px] text-dim mb-1">{ancestorChain.join(" → ")}</div>}
        <h2 className="text-base font-semibold">{label}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-dim">
          <span>Depth: {node.depth}</span>
          <span>
            Model: <span className="text-fg-primary">{node.resolvedModel}</span>
          </span>
          <span>
            Duration:{" "}
            <span className="text-fg-primary">{node.durationMs == null ? "—" : formatMs(node.durationMs)}</span>
          </span>
          <span>
            Tool calls: <span className="text-fg-primary">{node.toolCallCount}</span>
          </span>
          <span>
            Model calls: <span className="text-fg-primary">{node.modelCallCount}</span>
          </span>
          {node.children.length > 0 && (
            <span>
              Subagents: <span className="text-fg-primary">{node.children.length}</span>
            </span>
          )}
        </div>
      </div>

      {/* Utilization chart */}
      {node.contextWindowEntries.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-dim mb-2">Context Utilization</h3>
          <ZoomableUtilizationChart entries={node.contextWindowEntries} />
        </div>
      )}

      {/* Token cost chart */}
      {node.assistantUsageEntries.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-dim mb-2">Token Cost Per Turn</h3>
          <NodeTokenCostChart entries={node.assistantUsageEntries} />
        </div>
      )}

      {/* Compaction events */}
      {node.contextWindowEntries.length > 0 && <CompactionEventList entries={node.contextWindowEntries} />}
    </div>
  );
}
