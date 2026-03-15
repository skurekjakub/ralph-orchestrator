# Context Window Explorer — Feature Overview

**Feature**: Deep visualization platform for fractal agent context window telemetry  
**Surface**: New "Explorer" tab in `dashboard-local/`  
**Status**: Planning

## Problem

The existing Logs tab shows context window data only for flat (depth-1) subagent runs. Fractal agent runs — like the docwriter family — produce logs with 160+ invocations nested 9 levels deep. The current parser (`parseCliDebugSubagents`) uses a single `currentSpan` variable, so nested `subagent_started` events silently overwrite the parent span. Context window entries are attributed to subagents via a flat linear scan that can't handle overlapping time windows at different depths.

## Solution

A new Explorer tab that:

1. **Server-side extraction** — A Vite plugin reads the raw log file (~1M lines / ~150MB) from disk, extracts only telemetry events (subagent lifecycle, CompactionProcessor, assistant_usage), and returns condensed JSON (~KB) to the browser.

2. **Tree-aware parser** — Rewritten `parseCliDebugTree()` uses a stack to track nesting depth. Returns a `SubagentTreeNode` tree with context window and usage entries attributed to the deepest matching node by timestamp.

3. **Collapsible tree sidebar** — Renders the full invocation hierarchy. Each node shows agent short name, sequential invocation number (e.g. "content-writer #3"), duration, and peak utilization color badge. Clicking a node opens its detail view.

4. **Per-node context window charts** — Zoomable utilization chart (SVG viewBox manipulation for crisp zoom), compaction event markers, per-turn token cost breakdown.

5. **Aggregate views** — Run-level summary, flame chart (hand-coded SVG), token flow sankey (`d3-sankey`).

## User Decisions

| # | Question | Answer |
|---|---|---|
| Q1 | File input | Text path field, server reads from disk |
| Q2 | Log size handling | Server-side extraction — only telemetry events to browser |
| Q3 | Per-node charts | Utilization + compaction events, zoomable, large charts OK, labeled with agent/depth/parent |
| Q4 | Tree navigation | Collapsible tree (not @xyflow), fullscreen on click, sequential invocation numbering |
| Q5 | Aggregates | All three: run summary, flame chart, token sankey |
| Q6 | Parser strategy | Rewrite with depth tracking, `flattenTree()` for backward compat |

## Technical Decisions

| Decision | Rationale |
|---|---|
| `d3-sankey` over Recharts Sankey | Recharts Sankey is basic and poorly documented. `d3-sankey` gives full control over layout, link styling, and node positioning. |
| SVG `viewBox` for zoom | CSS `transform: scale()` loses resolution. ViewBox manipulation keeps SVG paths crisp at any zoom level. |
| Hand-coded SVG for flame chart | Most controllable for custom time-block rendering with depth-based stacking. Recharts doesn't have a flame chart. |
| Path traversal prevention on API | Basic security: reject relative paths, validate `.log` extension, resolve and check prefix. No allowlist needed for local dev tool. |
| Server-side parsing | 1M line logs can't be sent to the browser. Server extracts ~few KB of telemetry events. |

## Phases

| Phase | Name | Tasks | Depends On |
|---|---|---|---|
| 1 | Tree Parser Foundation | 5 | — |
| 2 | Server-Side Extraction API | 3 | Phase 1 |
| 3 | Explorer Tab Shell | 3 | Phase 2 |
| 4 | Invocation Tree Sidebar | 2 | Phase 3 |
| 5 | Per-Node Context Charts | 4 | Phase 4 |
| 6 | Aggregate Visualizations | 4 | Phase 5 |
| 7 | Tests & Integration | 3 | Phase 1 (partial), Phase 6 |

**Total**: 24 tasks across 7 phases
