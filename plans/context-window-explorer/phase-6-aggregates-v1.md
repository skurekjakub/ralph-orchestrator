# Phase 6: Aggregate Visualizations

**Version**: v1  
**Goal**: Three run-level aggregate views — summary panel, flame chart, and token flow sankey — integrated into the Explorer sub-navigation.  
**Dependencies**: Phase 5 (per-node charts complete, chart patterns established)  
**Outputs consumed by**: Phase 7 (integration tests)

---

## Context

The Explorer sub-nav has four views: Node Detail, Flame Chart, Summary, Token Flow. Phase 5 built the Node Detail view. This phase builds the other three. These views use the `tree` and `summary` data from the `useFractalExplorer` hook.

For the sankey, we use `d3-sankey` (superior to Recharts Sankey for customization and layout control). This requires adding `d3-sankey` and `@types/d3-sankey` as dependencies.

---

## Tasks

### 6.1 — Create `RunSummaryPanel.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/RunSummaryPanel.tsx`

Overview dashboard for the full run.

**Changes**:

```tsx
import type { RunSummary } from "../log-browser/tool-timeline-types";

interface RunSummaryPanelProps {
  summary: RunSummary;
}
```

1. **Stats cards row** (top): Total duration, total invocations, max depth, total tokens (with prompt/completion/cached breakdown).

2. **Agent breakdown table**: Sortable table with columns: Agent Name, Count, Avg Duration, Total Tokens. Default sort by count descending.

3. **Compaction event count** displayed in the stats row.

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/RunSummaryPanel.tsx`

**Acceptance Criteria**:
- [ ] Displays total duration, invocations, max depth, token totals
- [ ] Agent breakdown table with all agent types
- [ ] Sortable by column (at least by count and tokens)
- [ ] Compaction event count visible

---

### 6.2 — Create `FlameChart.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/FlameChart.tsx`

Horizontal time-based flame chart showing all invocations stacked by depth.

**Changes**:

```tsx
import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";

interface FlameChartProps {
  root: SubagentTreeNode;
  selectedNodeId: number | null;
  onSelectNode: (id: number) => void;
}
```

1. **Layout**: Hand-coded SVG. X axis = wall-clock time (normalized to 0..total duration). Y axis = depth level (row 0 = orchestrator, row 1 = depth-1 agents, etc.).

2. **Each block**: A colored rectangle spanning `(startMs - rootStartMs)` to `(endMs - rootStartMs)` on X, and `depth * rowHeight` to `(depth + 1) * rowHeight` on Y. Width proportional to duration.

3. **Colors by agent category**:
   - Coordinators (name contains "coordinator"): blue (#3b82f6)
   - Writers (name contains "writer"): green (#22c55e)
   - Reviewers (name contains "reviewer"): orange (#f59e0b)
   - Analyzers/mappers: purple (#a855f7)
   - Other: gray (#6b7280)

4. **Interactions**:
   - Hover: tooltip with agent name, invocation #, duration, depth
   - Click: selects node in tree sidebar (calls `onSelectNode`)
   - Selected node: highlighted border

5. **Dimensions**: Full width, height = `(maxDepth + 1) * 28px` (28px per depth row). Horizontal scroll if needed.

6. **Time axis**: Labels at regular intervals showing relative time (e.g. "0s", "30s", "1m", "2m").

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/FlameChart.tsx`

**Acceptance Criteria**:
- [ ] All invocations rendered as colored blocks at correct depth/time positions
- [ ] Color coding by agent category
- [ ] Hover tooltip with agent details
- [ ] Click selects node in tree sidebar
- [ ] Time axis with human-readable labels
- [ ] Handles 160+ invocations across 9 depth levels

---

### 6.3 — Create `TokenSankey.tsx`

**New file**: `dashboard-local/src/components/fractal-explorer/TokenSankey.tsx`

Sankey diagram showing token flow from orchestrator through the hierarchy.

**Changes**:

1. **Install dependency**: Add `d3-sankey` and `@types/d3-sankey` to `dashboard-local/package.json` devDependencies.

```json
"d3-sankey": "^0.12.3",
"@types/d3-sankey": "^0.12.7"
```

2. **Component**:

```tsx
import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";

interface TokenSankeyProps {
  root: SubagentTreeNode;
}
```

3. **Data transformation**: Convert the tree into sankey nodes and links:
   - **Nodes**: One per unique agent name (not per invocation). Aggregated across all invocations of that agent.
   - **Links**: Parent → child relationships. Link value = total tokens flowing from parent to child agent type (sum of `assistantUsageEntries.totalTokens` for the child).
   - **Grouping**: Nodes grouped by depth column for left-to-right flow.

4. **Rendering**: SVG with `d3-sankey` layout:
   - Nodes as rectangles with agent name labels
   - Links as curved paths with width proportional to token volume
   - Node color by agent category (same scheme as flame chart)
   - Hover on links shows source → target and token count

5. **Dimensions**: Full width, 400px height. `d3-sankey` handles the layout.

**Artifacts**:
- Creates: `dashboard-local/src/components/fractal-explorer/TokenSankey.tsx`
- Modifies: `dashboard-local/package.json` (new dependency)

**Acceptance Criteria**:
- [ ] Sankey nodes represent unique agent names (aggregated)
- [ ] Links show token flow from parent to child agent types
- [ ] Link width proportional to token volume
- [ ] Node colors match flame chart scheme
- [ ] Hover shows source, target, token count
- [ ] Layout flows left to right (depth 0 → depth N)

---

### 6.4 — Wire aggregate views into `FractalExplorer.tsx`

**File**: `dashboard-local/src/components/FractalExplorer.tsx`

Connect the four sub-views to the actual components.

**Changes**:

1. **Import all view components**: `NodeDetailPanel`, `FlameChart`, `RunSummaryPanel`, `TokenSankey`

2. **Compute `ancestorChain` for selected node**: Walk `parentId` links from the node map.

3. **Build `nodeMap`** (`Map<number, SubagentTreeNode>`) via DFS of the tree — needed for `selectedNodeId` → node lookup and ancestor chain computation.

4. **Render views based on `view` state**:

```tsx
{view === "detail" && selectedNode && (
  <NodeDetailPanel node={selectedNode} ancestorChain={ancestorChain} />
)}
{view === "detail" && !selectedNode && (
  <div className="text-muted">Select a node from the tree</div>
)}
{view === "flame" && <FlameChart root={tree} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />}
{view === "summary" && <RunSummaryPanel summary={summary} />}
{view === "sankey" && <TokenSankey root={tree} />}
```

5. **Wire tree sidebar**: Replace sidebar placeholder with `<InvocationTree>` import and render.

**Artifacts**:
- Modifies: `dashboard-local/src/components/FractalExplorer.tsx`

**Acceptance Criteria**:
- [ ] All four sub-views render correctly
- [ ] Node Detail shows selected node's charts
- [ ] Flame Chart renders and clicking a block selects in tree
- [ ] Summary shows run stats
- [ ] Token Flow shows sankey diagram
- [ ] Tree sidebar is wired and functional
