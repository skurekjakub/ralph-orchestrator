# Dashboard-Local Agent Instructions

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

- **No external charting libraries** — use raw SVG for all visualizations.
- **Tailwind classes** for layout and text styling; inline `style` only for dynamic values (positions, colors).
- **Collapsible sections** use the ▾/▸ toggle pattern from `ToolTimelineSubagents.tsx`.
- **Color constants** are named and centralized (`COLOR_GREEN`, `COLOR_PROMPT`, etc.), never hardcoded inline in multiple files.
- **`formatTokens()`** for all token count display (1K/1.2M format).
- **`formatMs()`** from `tool-timeline-shared.ts` for all duration display.
- **Types** live in `tool-timeline-types.ts` — add new interfaces there, not in component files.
- **Parsers** live in dedicated `*-parser.ts` files with matching `*-parser.test.ts` test files.
- **Hooks** that fetch and parse data live in `use*.ts` files.

## Testing

- Use `vitest` + `@testing-library/react` for component tests.
- Parser tests are pure unit tests (no DOM needed).
- Each new component should have a corresponding `.test.tsx` file.
- Run `npm test` (lint + build + vitest) to validate changes.
- Run `npm run test:watch` for fast iteration.

## Data Flow

```
cli-debug.log (raw text)
  → useToolTimelineData hook (fetches + parses)
    → context-window-parser.ts (parseContextWindowEntries, parseAssistantUsageEntries)
    → cli-debug-subagent-parser.ts (parseCliDebugSubagents)
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
6. Run `npm test` to verify.
