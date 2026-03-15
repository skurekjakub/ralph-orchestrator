# Phase 5: Per-Node Context Window Charts

**Version**: v1  
**Goal**: When a tree node is selected, show a fullscreen-able detail panel with zoomable utilization chart (SVG viewBox), compaction event markers, and per-turn token cost breakdown.  
**Dependencies**: Phase 4 (tree sidebar with node selection)  
**Outputs consumed by**: Phase 6 (aggregate views reuse chart components)

---

## Context

Each tree node has `contextWindowEntries[]` and `assistantUsageEntries[]` attributed during parsing. The detail panel shows these as interactive charts. The zoomable utilization chart uses SVG `viewBox` manipulation for crisp zoom at any level. Compaction events appear as vertical markers on the utilization chart.

The existing `UtilizationChart.tsx` and `SubagentContextChart.tsx` can be referenced for patterns but the new implementation needs viewBox zoom and is built fresh.

---

## Tasks

### 5.1 — Create `NodeDetailPanel.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/NodeDetailPanel.tsx`

Container panel showing all detail charts for the selected tree node.

**Changes**:

```tsx
import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";
import { ZoomableUtilizationChart } from "./ZoomableUtilizationChart";
import { NodeTokenCostChart } from "./NodeTokenCostChart";
import { CompactionEventList } from "./CompactionEventList";

interface NodeDetailPanelProps {
  node: SubagentTreeNode;
  /** Full dispatch chain from root to this node. */
  ancestorChain: SubagentTreeNode[];
}

export function NodeDetailPanel({ node, ancestorChain }: NodeDetailPanelProps) {
  const chainLabel = ancestorChain.map((n) =>
    n.depth === 0 ? "orchestrator" : `${n.name} #${n.invocationIndex}`
  ).join(" → ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">
          {node.depth === 0 ? "orchestrator" : `${node.name} #${node.invocationIndex}`}
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mt-1">
          <span>Depth: {node.depth}</span>
          <span>Model: {node.resolvedModel}</span>
          {node.durationMs != null && <span>Duration: {(node.durationMs / 1000).toFixed(1)}s</span>}
          <span>Tool calls: {node.toolCallCount}</span>
          <span>Model calls: {node.modelCallCount}</span>
        </div>
        <div className="text-[10px] text-muted mt-1 font-mono truncate" title={chainLabel}>
          {chainLabel}
        </div>
      </div>

      {/* Utilization chart */}
      {node.contextWindowEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Context Window Utilization</h3>
          <ZoomableUtilizationChart entries={node.contextWindowEntries} />
        </div>
      )}

      {/* Token cost chart */}
      {node.assistantUsageEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Token Cost per Turn</h3>
          <NodeTokenCostChart entries={node.assistantUsageEntries} />
        </div>
      )}

      {/* Compaction events */}
      {node.contextWindowEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Compaction Events</h3>
          <CompactionEventList entries={node.contextWindowEntries} />
        </div>
      )}
    </div>
  );
}
```

The `ancestorChain` is computed by the parent component by walking up `parentId` links from the selected node to the root.

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/NodeDetailPanel.tsx`

**Acceptance Criteria**:
- [ ] Shows agent name, invocation number, depth, model, duration, tool/model call counts
- [ ] Shows dispatch chain (root → ... → this node) as a breadcrumb
- [ ] Renders `ZoomableUtilizationChart` when entries exist
- [ ] Renders `NodeTokenCostChart` when usage entries exist
- [ ] Renders `CompactionEventList` when entries exist
- [ ] No compile errors

---

### 5.2 — Create `ZoomableUtilizationChart.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/ZoomableUtilizationChart.tsx`

SVG area chart with viewBox-based zoom and pan.

**Changes**:

1. **Chart structure**: SVG element with dynamically computed `viewBox`. The data domain is time (X) vs utilization % (Y).

2. **Zoom via viewBox**: 
   - `viewBox` state: `{ x, y, width, height }` starting at full data extent
   - Mouse wheel on chart → shrink/grow `width` (zoom X axis, Y stays at 0-100%)
   - Mouse drag → translate `x` (pan)
   - This keeps SVG paths crisp at any zoom level

3. **Compaction event markers**: Vertical dashed lines at timestamps where utilization drops significantly (>10% drop between consecutive entries).

4. **Chart content**:
   - Filled area path for utilization (green→amber→red gradient based on value)
   - X axis labels (time), Y axis labels (0%, 25%, 50%, 75%, 100%)
   - Hover tooltip showing exact timestamp, tokens used/max, utilization %

```tsx
interface ZoomableUtilizationChartProps {
  entries: ContextWindowEntry[];
}
```

5. **Dimensions**: Full parent width, 250px height. Responsive via `width="100%"` with internal coordinate system.

**Key implementation detail — viewBox zoom**:

```typescript
const [viewBox, setViewBox] = useState({ x: minTs, y: 0, width: maxTs - minTs, height: 100 });

const handleWheel = (e: React.WheelEvent) => {
  e.preventDefault();
  const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
  const svgRect = svgRef.current!.getBoundingClientRect();
  const mouseXRatio = (e.clientX - svgRect.left) / svgRect.width;
  const mouseXInViewBox = viewBox.x + mouseXRatio * viewBox.width;
  
  const newWidth = viewBox.width * zoomFactor;
  const newX = mouseXInViewBox - mouseXRatio * newWidth;
  
  setViewBox({ ...viewBox, x: newX, width: newWidth });
};
```

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/ZoomableUtilizationChart.tsx`

**Acceptance Criteria**:
- [ ] SVG area chart renders utilization over time
- [ ] Mouse wheel zooms X axis centered on cursor position
- [ ] Click-drag pans the X axis
- [ ] Compaction events shown as vertical dashed lines
- [ ] Area color reflects utilization level (green/amber/red)
- [ ] Hover tooltip shows timestamp, tokens, utilization
- [ ] Crisp rendering at all zoom levels (SVG viewBox, not CSS transform)

---

### 5.3 — Create `NodeTokenCostChart.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/NodeTokenCostChart.tsx`

Stacked bar chart showing per-turn token breakdown.

**Changes**:

```tsx
interface NodeTokenCostChartProps {
  entries: AssistantUsageEntry[];
}
```

1. **Chart type**: Stacked horizontal bars, one per turn. Three segments: cached tokens (blue), non-cached prompt tokens (gray), completion tokens (green).

2. **Implementation**: Hand-coded SVG bars (same pattern as existing charts — no recharts needed for simple stacked bars).

3. **Y axis**: Turn number (1, 2, 3...). X axis: token count. Hover shows exact numbers.

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/NodeTokenCostChart.tsx`

**Acceptance Criteria**:
- [ ] Stacked bar per assistant_usage turn
- [ ] Three segments: cached (blue), prompt (gray), completion (green)
- [ ] Hover tooltip with exact token counts
- [ ] Scales appropriately for varying turn counts

---

### 5.4 — Create `CompactionEventList.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/CompactionEventList.tsx`

A list of compaction events (drop-offs in utilization) within this node's window.

**Changes**:

```tsx
interface CompactionEventListProps {
  entries: ContextWindowEntry[];
}
```

1. **Detect compaction events**: Consecutive entries where utilization drops by >10 percentage points.

2. **Display**: Simple table/list with columns: timestamp, before tokens, after tokens, Δ tokens, before %, after %.

3. **Empty state**: "No compaction events detected" if no significant drops.

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/CompactionEventList.tsx`

**Acceptance Criteria**:
- [ ] Lists compaction events (utilization drops >10 points between consecutive entries)
- [ ] Shows before/after token counts and utilization
- [ ] Empty state when no compaction detected
