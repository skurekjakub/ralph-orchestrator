# Dashboard-Local Agent Instructions

Local Vite + React 19 + Tailwind UI for inspecting orchestrator runs.

- Live status comes from the orchestrator's WebSocket server at `ws://localhost:3100` (`src/useDashboard.ts`).
- Logs, agent graphs and fractal graphs come from Vite middleware plugins (`src/*Plugin.ts`) that read the parent repo. For example, `logApiPlugin.ts` serves `../output/logs/`, and `agentGraphPlugin.ts` reads `profiles/`, `shared/agent-includes/` and `shared/skills/`.

This is a separate npm project. The root `npm run lint` / `npm test` do not cover it; `.github/workflows/pr-validation.yml` does.

## Commands

Run these from `dashboard-local/` after `npm ci`:

```bash
npm run dev          # Vite dev server on :3101 (same as `npm run dashboard` from the repo root)
npm run lint         # tsc --noEmit
npm test             # vitest run (jsdom, setup in src/test/setup.ts) — no lint or build
npm run test:watch   # vitest watch
npm run build        # rm -rf dist && vite build
```

Before finishing a change, run `npm run lint`, `npm test` and `npm run build`. CI runs all three.

## Code Organization

**Keep files lean and focused.** Each component file should have a single responsibility. When a file grows beyond ~150 lines or contains multiple distinct visual sections, split it:

1. **Orchestrator pattern**: A parent component composes child components and manages shared state (expand/collapse, hover). It should contain minimal rendering logic itself.
2. **One component per file**: Each chart, overlay, or tracker gets its own `.tsx` file.
3. **Shared constants and utilities**: Extract colors, padding, formatters, and helper functions into a `-shared.ts` file co-located with the components that use them. Avoid duplicating magic numbers across files.

### Example structure

```
ContextWindowChart.tsx          ← orchestrator (header, expand/collapse, composition)
UtilizationChart.tsx            ← SVG area chart for context window utilization
TokenCostOverlay.tsx            ← per-turn token cost bar chart
CumulativeTokenTracker.tsx      ← cumulative spend line chart
context-window-chart-shared.ts  ← shared constants, colors, formatTokens(), buildLinePath()
```

## Conventions

- **Log-browser charts are raw SVG** (`src/components/log-browser/`). Keep new timeline and context-window visualizations in raw SVG.
  - The graph views use `@xyflow/react` (`AgentGraph.tsx`, `FractalGraph.tsx`, the `*NodeCard.tsx` files).
  - The token Sankey uses `d3-sankey` (`fractal-explorer/TokenSankey.tsx`).
  - `recharts` is declared in `package.json` but nothing in `src/` imports it. Don't add a new charting dependency without asking.
- **Tailwind classes** for layout and text styling; inline `style` only for dynamic values (positions, colors).
- **Collapsible sections** use the ▾/▸ toggle pattern from `ToolTimelineSubagents.tsx`.
- **Color constants** are named and centralized (`COLOR_GREEN`, `COLOR_PROMPT`, etc.), never hardcoded inline in multiple files.
- **`formatTokens()`** for all token count display (1K/1.2M format).
- **`formatMs()`** from `tool-timeline-shared.ts` for all duration display.
- **Types** live in `src/components/log-browser/tool-timeline-types.ts` — add new interfaces there, not in component files.
- **Parsers** live in dedicated `*-parser.ts` files with matching `*-parser.test.ts` test files.
- **Hooks** that fetch and parse data live in `use*.ts` files.

## Testing

- Use `vitest` + `@testing-library/react` for component tests. Shared test data lives in `src/test/factories.ts` and `src/test/fakes.ts`.
- Parser tests are pure unit tests (no DOM needed).
- Each new component should have a corresponding `.test.tsx` file.
- `npm test` runs only vitest. Run `npm run lint` and `npm run build` as well to validate changes.
- Run `npm run test:watch` for fast iteration.

## Data Flow

```
cli-debug.log (raw text)
  → useToolTimelineData hook (fetches + parses)
    → context-window-parser.ts (parseContextWindowEntries, parseAssistantUsageEntries)
    → cli-debug-subagent-parser.ts (parseCliDebugTree → flattenTree)
    → tool-log-timeline-parser.ts (buildTimeline)
  → ToolTimeline.tsx (orchestrates all timeline sections)
    → ToolTimelineSummary
    → SubagentOverview
    → ContextWindowChart → UtilizationChart, TokenCostOverlay, CumulativeTokenTracker
    → ToolTimelineCallList
```

## Adding New Visualizations

1. Add any new data types to `tool-timeline-types.ts`.
2. Write a parser in a new `*-parser.ts` with tests.
3. Wire the parser into `useToolTimelineData.ts`.
4. Create a focused component file for the visualization.
5. Integrate it into `ToolTimeline.tsx` at the appropriate position.
6. Run `npm run lint`, `npm test` and `npm run build` to verify.
