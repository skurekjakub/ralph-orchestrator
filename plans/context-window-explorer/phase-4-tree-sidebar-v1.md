# Phase 4: Invocation Tree Sidebar

**Version**: v1  
**Goal**: A collapsible tree sidebar that shows the full invocation hierarchy with agent names, invocation numbers, duration, and peak utilization badges.  
**Dependencies**: Phase 3 (explorer tab shell, `useFractalExplorer` hook)  
**Outputs consumed by**: Phase 5 (clicking a node opens its detail view)

---

## Context

The tree sidebar is the primary navigation for the Explorer tab. It renders the `SubagentTreeNode` tree as a collapsible list. The orchestrator appears once at the root (always expanded). Each subagent shows its short name with a sequential invocation number (e.g. "content-writer #3"). Duration and peak context utilization are displayed as badges.

User explicitly rejected `@xyflow` graph rendering ("those render poorly"). This is a standard DOM tree component.

---

## Tasks

### 4.1 — Create `InvocationTree.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/InvocationTree.tsx`

The tree container that renders the root node and manages expand/collapse state.

**Changes**:

```tsx
import { useState, useCallback } from "react";
import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";
import { InvocationTreeNode } from "./InvocationTreeNode";

interface InvocationTreeProps {
  root: SubagentTreeNode;
  selectedNodeId: number | null;
  onSelectNode: (id: number) => void;
}

export function InvocationTree({ root, selectedNodeId, onSelectNode }: InvocationTreeProps) {
  // Track expanded node IDs. Root + depth-1 nodes start expanded.
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const initial = new Set<number>([root.id]);
    for (const child of root.children) initial.add(child.id);
    return initial;
  });

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="py-2 text-xs font-mono">
      <InvocationTreeNode
        node={root}
        expanded={expanded}
        selectedId={selectedNodeId}
        onToggle={toggleExpand}
        onSelect={onSelectNode}
      />
    </div>
  );
}
```

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/InvocationTree.tsx`

**Acceptance Criteria**:
- [ ] Renders the tree starting from root
- [ ] Root and depth-1 children start expanded
- [ ] Toggle expand/collapse works
- [ ] Click selects a node (calls `onSelectNode`)

---

### 4.2 — Create `InvocationTreeNode.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/InvocationTreeNode.tsx`

A single row in the tree — renders itself recursively for children.

**Changes**:

```tsx
import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";

interface InvocationTreeNodeProps {
  node: SubagentTreeNode;
  expanded: Set<number>;
  selectedId: number | null;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
}

export function InvocationTreeNode({
  node,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: InvocationTreeNodeProps) {
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const peakUtil = peakUtilization(node);

  const label =
    node.depth === 0
      ? "orchestrator"
      : `${node.name} #${node.invocationIndex}`;

  const duration = node.durationMs != null
    ? node.durationMs < 1000
      ? `${node.durationMs}ms`
      : `${(node.durationMs / 1000).toFixed(1)}s`
    : "";

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 cursor-pointer hover:bg-bg-hover rounded ${
          isSelected ? "bg-info/10 text-info" : ""
        }`}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand/collapse arrow */}
        <span
          className={`w-3 text-center ${hasChildren ? "cursor-pointer" : "invisible"}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </span>

        {/* Agent name + invocation number */}
        <span className="truncate">{label}</span>

        {/* Badges */}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {duration && (
            <span className="text-muted text-[10px]">{duration}</span>
          )}
          {peakUtil != null && (
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: utilizationColor(peakUtil) }}
              title={`Peak: ${peakUtil.toFixed(0)}%`}
            />
          )}
        </span>
      </div>

      {/* Children */}
      {isExpanded &&
        node.children.map((child) => (
          <InvocationTreeNode
            key={child.id}
            node={child}
            expanded={expanded}
            selectedId={selectedId}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function peakUtilization(node: SubagentTreeNode): number | null {
  if (node.contextWindowEntries.length === 0) return null;
  return Math.max(...node.contextWindowEntries.map((e) => e.utilization));
}

function utilizationColor(util: number): string {
  if (util >= 80) return "#ef4444"; // red
  if (util >= 60) return "#f59e0b"; // amber
  return "#22c55e"; // green
}
```

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/InvocationTreeNode.tsx`

**Acceptance Criteria**:
- [ ] Renders agent name with invocation number (e.g. "content-writer #3")
- [ ] Root shows "orchestrator" without invocation number
- [ ] Indentation scales with depth (16px per level)
- [ ] Expand/collapse arrow toggles children visibility
- [ ] Selected node is highlighted
- [ ] Duration badge shows formatted time
- [ ] Peak utilization color dot: green (<60%), amber (60-80%), red (>80%)
- [ ] Recursive rendering for children
