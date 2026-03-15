# Planner State: DEEP-VIZ — Context Window Explorer

## Current Phase
Phase 2: Questions

### Reference file for this phase
`references/2-questions.md` from the `looper-planner` skill

## Working Directory
`.agents/changes/DEEP-VIZ-context-window-explorer/`

## Completed Phases
- Phase 1: Discovery (complete)

## Question Rounds
Round: 1
Unresolved: see below

## Key Decisions
(none yet)

## Discovery Summary

### Request
New tab in `dashboard-local/` that takes a CLI debug log file path (e.g. `.fractals/docwriter/run_history/DOC-3137/process-1773516642369-288915.log`) and generates deep context window visualizations for every subagent invocation at arbitrary nesting depth.

### Existing Infrastructure

**Dashboard-local tabs:** 4 tabs: Live, Logs, Agents, Fractal. Simple `Tab` union type in `App.tsx`.

**Current context window viz** (in the Logs tab → ToolTimeline):
- `ContextWindowChart.tsx` — orchestrates sub-vizs
- `UtilizationChart.tsx` — hand-coded SVG area chart (utilization % over time)
- `SubagentContextChart.tsx` — Recharts stacked bars per subagent
- `TokenCostOverlay.tsx` — per-turn token table
- `CumulativeTokenTracker.tsx` — summary stats

**Existing parsers:**
- `context-window-parser.ts` — parses CompactionProcessor lines + assistant_usage blocks
- `cli-debug-subagent-parser.ts` — parses subagent_started/completed into flat `SubagentSpan[]`
- `splitEntriesByAgent()` — attributes entries to subagents by timestamp overlap

**Critical gap:** The current subagent parser is **flat** — it tracks one `currentSpan` at a time. When a nested `subagent_started` arrives, it overwrites the current span. There is no depth/parent tracking.

### Real Log Analysis (DOC-3137)
- 1,051,097 lines in the debug log
- 161 subagent invocations, 159 completions (2 unclosed)
- **Max nesting depth: 9 levels**
- Hierarchy: root → docwriter-analysis-coordinator → docwriter-code-analyzer → docwriter-code-analyzer → ... (self-recursive)
- Agent names include: coordinators (analysis, execution, verification, synthesis, delivery), specialists (code-analyzer, content-writer, impact-mapper, etc.), reviewers (style, accuracy, persona)

### Data loading pattern
- Vite plugin `logApiPlugin.ts` serves files from `output/logs/` via `/api/logs/` endpoint
- The new tab needs a **different** data source — arbitrary file path from the filesystem (e.g. `.fractals/docwriter/run_history/...`)
- Current flow: log discovery → user clicks "Timeline" → 3 files fetched → parsed in `useMemo`

### Chart libraries
- `recharts@3.7.0` (partially used)
- Hand-coded SVG for utilization charts
- `@xyflow` for graph visualizations

## Notes
- 1M line log file — need streaming/chunked parsing, can't load all at once in browser
- 9-level nesting — need a tree data structure, not flat array
- Each depth level shares a single context window (CLI has one context window) — context data must be attributed to the correct depth level based on timestamp windows
