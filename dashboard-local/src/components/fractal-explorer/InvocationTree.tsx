import { useCallback, useMemo, useState } from "react";
import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";
import { InvocationTreeNode } from "./InvocationTreeNode";

interface InvocationTreeProps {
  root: SubagentTreeNode;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

/** Collect IDs of root + depth-1 children for initial expansion. */
function defaultExpanded(root: SubagentTreeNode): Set<string> {
  const ids = new Set<string>([root.id]);
  for (const child of root.children) {
    ids.add(child.id);
  }
  return ids;
}

export function InvocationTree({ root, selectedNodeId, onSelectNode }: InvocationTreeProps) {
  const [expandedIds, setExpandedIds] = useState(() => defaultExpanded(root));

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectNode(id === selectedNodeId ? null : id);
    },
    [onSelectNode, selectedNodeId],
  );

  return (
    <div className="py-1">
      <InvocationTreeNode
        node={root}
        selectedNodeId={selectedNodeId}
        expandedIds={expandedIds}
        onToggle={handleToggle}
        onSelect={handleSelect}
      />
    </div>
  );
}
