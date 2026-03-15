# Phase 3: Explorer Tab Shell

**Version**: v1  
**Goal**: A new "Explorer" tab in the dashboard with a path input field, data loading hook, and the overall layout skeleton (sidebar + main area).  
**Dependencies**: Phase 2 (fractal log API endpoint)  
**Outputs consumed by**: Phase 4 (tree sidebar), Phase 5 (per-node charts), Phase 6 (aggregates)

---

## Context

The dashboard currently has 4 tabs: `live`, `logs`, `agents`, `fractal`. The Explorer tab is a standalone feature that doesn't interact with the other tabs. It takes a file path as input, fetches the parsed tree from the server API, and provides the layout structure for the visualization components.

---

## Tasks

### 3.1 — Add "explorer" tab to App.tsx

**File**: `dashboard-local/src/App.tsx`

**Changes**:

1. **Extend Tab type**:

```typescript
type Tab = "live" | "logs" | "agents" | "fractal" | "explorer";
```

2. **Add nav button** (after the Fractal button):

```tsx
<Button
  onClick={() => setTab("explorer")}
  variant={tab === "explorer" ? ButtonVariant.Pill : ButtonVariant.Ghost}
  className={tab === "explorer" ? "bg-info/15 text-info" : ""}
>
  Explorer
</Button>
```

3. **Add import and render case**:

```tsx
import { FractalExplorer } from "./components/FractalExplorer";

// In the tab body:
{tab === "explorer" && <FractalExplorer />}
```

**Acceptance Criteria**:
- [ ] "Explorer" button visible in nav bar
- [ ] Clicking it switches to the Explorer tab
- [ ] No compile errors

---

### 3.2 — Create `FractalExplorer.tsx` shell component

**New file**: `dashboard-local/src/components/FractalExplorer.tsx`

The main container for the Explorer tab. Manages the overall layout and state delegation.

**Changes**:

1. **Layout structure**:

```
┌──────────────────────────────────────────────────┐
│  Path input bar + Load button                     │
├──────────────┬───────────────────────────────────┤
│              │                                    │
│  Tree        │  Main area                         │
│  sidebar     │  (detail panel / aggregates)       │
│  (300px)     │                                    │
│              │                                    │
├──────────────┴───────────────────────────────────┤
│  Status bar (optional)                            │
└──────────────────────────────────────────────────┘
```

2. **Component skeleton**:

```tsx
import { useState } from "react";
import { useFractalExplorer } from "../useFractalExplorer";

type ExplorerView = "detail" | "flame" | "summary" | "sankey";

export function FractalExplorer() {
  const [path, setPath] = useState("");
  const [submittedPath, setSubmittedPath] = useState<string | null>(null);
  const { tree, summary, loading, error, selectedNodeId, setSelectedNodeId } =
    useFractalExplorer(submittedPath);
  const [view, setView] = useState<ExplorerView>("detail");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Path input bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Absolute path to cli-debug.log..."
          className="flex-1 bg-bg-input border border-border rounded px-3 py-1.5 text-sm font-mono"
          onKeyDown={(e) => e.key === "Enter" && setSubmittedPath(path)}
        />
        <button
          onClick={() => setSubmittedPath(path)}
          className="px-4 py-1.5 bg-info/15 text-info rounded text-sm font-medium hover:bg-info/25"
        >
          Load
        </button>
      </div>

      {/* Main content */}
      {loading && <div className="flex-1 flex items-center justify-center text-muted">Loading...</div>}
      {error && <div className="flex-1 flex items-center justify-center text-error">{error}</div>}
      {!loading && !error && !tree && (
        <div className="flex-1 flex items-center justify-center text-muted">
          Enter a path to a cli-debug.log file above
        </div>
      )}
      {!loading && !error && tree && summary && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar placeholder — Phase 4 */}
          <div className="w-[300px] shrink-0 border-r border-border overflow-y-auto">
            {/* <InvocationTree> goes here */}
          </div>

          {/* Main area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sub-nav */}
            <nav className="flex gap-1 px-4 py-2 border-b border-border shrink-0">
              {(["detail", "flame", "summary", "sankey"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    view === v ? "bg-info/15 text-info" : "text-muted hover:text-fg"
                  }`}
                >
                  {v === "detail" ? "Node Detail" : v === "flame" ? "Flame Chart" : v === "summary" ? "Summary" : "Token Flow"}
                </button>
              ))}
            </nav>

            {/* View area placeholder — Phases 5 & 6 */}
            <div className="flex-1 overflow-auto p-4">
              {/* Components wired in later phases */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Artifacts**:
- Creates: `dashboard-local/src/components/FractalExplorer.tsx`

**Acceptance Criteria**:
- [ ] Component renders with path input and Load button
- [ ] Empty state shows placeholder text
- [ ] Loading state shows spinner/text
- [ ] Error state shows error message
- [ ] Loaded state shows sidebar + main area layout with sub-nav
- [ ] No compile errors

---

### 3.3 — Create `useFractalExplorer.ts` data hook

**New file**: `dashboard-local/src/useFractalExplorer.ts`

Data fetching hook that calls the server-side extraction API.

**Changes**:

```typescript
import { useEffect, useState } from "react";
import type { SubagentTreeNode, RunSummary } from "./components/log-browser/tool-timeline-types";

interface UseFractalExplorerResult {
  tree: SubagentTreeNode | null;
  summary: RunSummary | null;
  loading: boolean;
  error: string | null;
  selectedNodeId: number | null;
  setSelectedNodeId: (id: number | null) => void;
}

export function useFractalExplorer(path: string | null): UseFractalExplorerResult {
  const [tree, setTree] = useState<SubagentTreeNode | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  useEffect(() => {
    if (!path) {
      setTree(null);
      setSummary(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedNodeId(null);

    fetch(`/api/fractal-log?path=${encodeURIComponent(path)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: { tree: SubagentTreeNode; summary: RunSummary }) => {
        if (cancelled) return;
        setTree(data.tree);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setTree(null);
        setSummary(null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [path]);

  return { tree, summary, loading, error, selectedNodeId, setSelectedNodeId };
}
```

**Artifacts**:
- Creates: `dashboard-local/src/useFractalExplorer.ts`

**Acceptance Criteria**:
- [ ] Hook fetches from `/api/fractal-log` when path is non-null
- [ ] Returns `tree`, `summary`, `loading`, `error`, `selectedNodeId`, `setSelectedNodeId`
- [ ] Cancels in-flight request on path change or unmount
- [ ] Resets state when path becomes null
- [ ] No compile errors
