---
name: local-dashboard
description: Guide for working with the Ralph Orchestrator local development dashboard — a React + Vite + Tailwind CSS v4 app in dashboard-local/ that provides live monitoring and historical log browsing. Use this skill when the user asks to add features, fix bugs, style components, or modify anything in the local dashboard. Also use when the user mentions dashboard components, log browsing, the tool timeline, the Vite API plugin, the WebSocket live view, or any dashboard-local/ file.
---

# Local Dashboard Development Guide

The local dashboard (`dashboard-local/`) is a standalone React SPA for monitoring Ralph Orchestrator in real time and browsing historical task logs. It runs on port 3101 and connects to the orchestrator's WebSocket on port 3100.

## Commands

```bash
cd dashboard-local
npm run dev       # Vite dev server — port 3101, auto-opens browser
npm run build     # Production build → dist/
npm run lint      # tsc --noEmit (type-check only)
```

The orchestrator must be running (`npm run dev` from the repo root) for the Live tab to connect. The Logs tab works standalone — it reads files from `output/logs/` via a Vite middleware plugin.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 (functional components + hooks) |
| Build | Vite 7.3.1 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin, `@theme` directive) |
| Charts | Recharts 3.7 (available but not always used) |
| State | React hooks only — no Redux/Zustand |
| Module | ESM (`"type": "module"`) |

## Architecture

```
Vite dev server (port 3101)
├── React SPA
│   ├── Live tab ── WebSocket (ws://localhost:3100) ── orchestrator
│   └── Logs tab ── fetch /api/logs/* ── Vite middleware ── output/logs/
└── logApiPlugin (custom Vite plugin — serves log files as REST API)
```

### Two-Tab Design

**Live tab** — Real-time orchestrator monitoring via WebSocket:
- StatusBar: current task, profile, elapsed time, queue/done counts
- LogPanel (container output) + ToolOutputPanel (streaming tool output)
- LogPanel (orchestrator log) + QueuePanel + HistoryPanel

**Logs tab** — Historical log browser (no WebSocket needed):
- Issue groups (collapsible by issue key, shows all executions)
- Execution rows with file buttons (Log, Summary, Audit, Transcript, Tool Output, Timeline)
- FileViewer for raw file content
- ToolTimeline for visual tool call sequence

## File Map

```
dashboard-local/
├── vite.config.ts              # Vite config: react + tailwindcss + logApiPlugin
├── package.json                # Dependencies: react 19, tailwind 4, recharts 3.7
├── tsconfig.json               # Strict, JSX react-jsx, bundler resolution
├── index.html                  # SPA entry (loads src/main.tsx)
└── src/
    ├── main.tsx                # React root mount
    ├── App.tsx                 # Root component: header, tabs (live/logs), zoom
    ├── types.ts                # OrchestratorState, LogEntry, CompletedTask, DashboardMessage, TaskLogGroup
    ├── styles.css              # Tailwind @theme tokens (dark palette)
    ├── useDashboard.ts         # WebSocket hook (ws://localhost:3100, auto-reconnect)
    ├── useZoom.ts              # Zoom context + cookie persistence
    ├── logApiPlugin.ts         # Vite middleware: /api/logs, /api/logs/:file, /api/history
    ├── components/
    │   ├── Button.tsx          # Ghost/Subtle/Pill variants, XS/SM sizes
    │   ├── StatusBar.tsx       # Live task status dot + metadata
    │   ├── LogPanel.tsx        # Scrollable log viewer (auto-scroll-to-bottom)
    │   ├── ToolOutputPanel.tsx # Streaming tool output (last 500 lines)
    │   ├── QueuePanel.tsx      # Pending tasks list
    │   ├── HistoryPanel.tsx    # Completed today (status emoji, PR link)
    │   ├── ZoomControls.tsx    # Zoom in/out/reset (cookie-persisted)
    │   ├── LogBrowser.tsx      # Logs tab root: issue groups → file viewer / timeline
    │   └── log-browser/
    │       ├── utils.ts            # Date/duration formatters, status badge colors, file labels
    │       ├── IssueGroupSection.tsx # Collapsible issue key → execution list
    │       ├── ExecutionRow.tsx      # Single execution: file buttons + timeline trigger
    │       ├── DailyLogsSection.tsx  # Activity/container daily logs
    │       ├── FileViewer.tsx        # Raw file content display
    │       ├── timeline-parser.ts   # Parse pre-tool.log + tool-output.log → ToolCallEntry[]
    │       └── ToolTimeline.tsx      # Visual tool call table with duration bars
```

## Theme & Styling

Tailwind CSS v4 with custom tokens defined in `styles.css` via the `@theme` directive:

```css
@theme {
  --color-bg: #0d1117;          /* App background */
  --color-bg-panel: #161b22;    /* Panel/card background */
  --color-bg-header: #1c2128;   /* Header/toolbar background */
  --color-border: #30363d;      /* All borders */
  --color-text: #e6edf3;        /* Primary text */
  --color-dim: #7d8590;         /* Secondary/muted text */
  --color-info: #58a6ff;        /* Info/links — blue */
  --color-success: #3fb950;     /* Success — green */
  --color-warn: #d29922;        /* Warning — amber */
  --color-error: #f85149;       /* Error — red */
  --font-mono: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
}
```

Use these tokens as Tailwind utilities: `bg-bg`, `bg-bg-panel`, `text-dim`, `text-info`, `border-border`, `font-mono`, etc. The palette is GitHub-inspired dark theme. Never introduce colors outside this palette unless extending the token set.

### Styling conventions

- **Font sizes**: Use arbitrary values — `text-[10px]`, `text-[11px]`, `text-[13px]`. The dashboard is information-dense and compact.
- **Spacing**: `gap-2`, `px-2 py-1` for table rows; `gap-4`, `p-3` for sections.
- **Borders**: `border border-border rounded` for cards/panels. `border-b border-border` for row separators.
- **Status colors**: Map status strings to semantic tokens (`text-success`, `bg-error/15 text-error`).
- **Opacity modifiers**: `bg-success/15` for subtle tinted backgrounds on status badges.
- **Layout**: Flex-based with `min-h-0` on flex children that need to scroll.

### Scroll pattern

Scrollable containers need both `overflow-y-auto` and `min-h-0` on any flex parent. The app root is `overflow: hidden` at full viewport height, so every scrollable area must be explicitly constrained:

```tsx
{/* Parent constrains height */}
<div className="flex flex-col flex-1 min-h-0">
  {/* Fixed header */}
  <div className="shrink-0">...</div>
  {/* Scrollable content */}
  <div className="flex-1 min-h-0 overflow-y-auto">...</div>
</div>
```

## API Layer — logApiPlugin

The `logApiPlugin.ts` file is a custom Vite plugin that serves log data as REST endpoints during development. It reads directly from `output/logs/` in the repo root.

### Routes

| Route | Returns |
|---|---|
| `GET /api/logs` | All task log groups + daily logs (JSON array) |
| `GET /api/logs/:filename` | Single file content (text, with path traversal protection) |
| `GET /api/history` | List of operation ledger files |
| `GET /api/history/:issueKey` | Single issue ledger JSON |

### File Discovery

Task logs live in timestamped directories: `output/logs/<ISSUE_KEY>-<TIMESTAMP>/`. The plugin discovers files by suffix pattern matching:

| Suffix | Field | Extension |
|---|---|---|
| `summary` | `files.summary` | `.json` |
| `audit` | `files.audit` | `.jsonl` |
| `transcript` | `files.transcript` | `.md` |
| `tool-output` | `files.toolOutput` | `.log` |
| `pre-tool` | `files.preTool` | `.log` |
| _(base name)_ | `files.log` | `.log` |

Daily logs (`activity-YYYY-MM-DD.log`, `container-YYYY-MM-DD.log`) are discovered at the root `output/logs/` level.

When adding new file types, add the suffix/extension mapping to `logApiPlugin.ts` and the corresponding field to the `TaskLogGroup.files` interface in `types.ts`.

## WebSocket — Live Data

`useDashboard.ts` connects to `ws://localhost:3100` (the orchestrator's `DashboardServer`). Auto-reconnects every 2s on disconnect.

Message types:
- `{ type: "state", data: OrchestratorState }` — full state snapshot
- `{ type: "toolOutput", data: string }` — streaming tool output line
- `{ type: "log", data: LogEntry }` — individual log entry

Tool output is buffered in React state (last 500 lines). State snapshots replace previous state entirely.

## Key Data Types

```ts
// Live state from orchestrator
interface OrchestratorState {
  status: "idle" | "polling" | "working" | "stopping";
  currentIssue: { key: string; summary: string } | null;
  currentProfile: string | null;
  startedAt: number | null;
  completedToday: CompletedTask[];
  queueSize: number;
  queueItems: { key: string; summary: string }[];
  logs: LogEntry[];
  orchestratorLogs: LogEntry[];
  containerLogs: LogEntry[];
  profileIds: string[];
}

// Historical log group
interface TaskLogGroup {
  id: string;
  issueKey: string;
  timestamp?: number;
  files: {
    log?: string;
    summary?: string;
    audit?: string;
    transcript?: string;
    toolOutput?: string;
    preTool?: string;
  };
  summary?: { status?: string; durationMs?: number; prUrl?: string; /* ... */ };
}
```

## Component Patterns

### Button variants

```tsx
import { Button, ButtonVariant, ButtonSize } from "./components/Button";

<Button onClick={fn} variant={ButtonVariant.Ghost}>Transparent</Button>
<Button onClick={fn} variant={ButtonVariant.Subtle}>Bordered</Button>
<Button onClick={fn} variant={ButtonVariant.Pill} size={ButtonSize.XS}>Small pill</Button>
```

### Color-mapped status badges

Components use `Record<string, string>` dictionaries for consistent color mapping:

```tsx
const statusColors: Record<string, string> = {
  completed: "bg-success/15 text-success",
  error: "bg-error/15 text-error",
  partial: "bg-warn/15 text-warn",
};
// Usage: <span className={statusColors[status]}>{status}</span>
```

### Data fetching

Components fetch from the Vite plugin API using native `fetch`:

```tsx
useEffect(() => {
  fetch("/api/logs").then(r => r.json()).then(setData);
}, []);
```

No external data-fetching library. Keep it simple.

### Conditional view switching

The LogBrowser uses state to switch between views:

```tsx
timelineFiles ? <ToolTimeline ... />
  : selectedFile ? <FileViewer ... />
  : <IssueGroupList ... />
```

New views follow the same pattern — add state for the view's data, render conditionally.

## Tool Timeline

The ToolTimeline component visualizes all tool calls from a task execution. It parses two log files:

- **pre-tool.log** (JSONL): `{"event":"pre_tool","ts":<ms>,"session":"...","tool":"...","args":"..."}`
- **tool-output.log** (text blocks): Delimited by `── HH:MM:SS tool_name (status) ──` headers

`timeline-parser.ts` merges these by matching the nth occurrence of each tool name across both files, computing durations from timestamp gaps.

Tool categories are inferred from the tool name:
- **skill**: starts with `skill_`
- **mcp**: contains `-` (MCP tool convention)
- **edit**: contains `edit`, `replace`, `create_file`, `write`
- **shell**: contains `terminal`, `shell`, `bash`, `run_command`
- **nav**: contains `read`, `search`, `find`, `list`, `grep`
- **other**: everything else

Each category has a hex color from `CAT_HEX` in `ToolTimeline.tsx`.

## Adding a New Feature — Checklist

1. **New component**: Create in `components/` (or `components/log-browser/` for log-related). Follow existing patterns — functional component, hooks for state, Tailwind for styling.
2. **New data type**: Add to `types.ts`. If it comes from the orchestrator WebSocket, also update `src/orchestrator-types.ts` upstream.
3. **New log file type**: Add suffix mapping in `logApiPlugin.ts`, field in `TaskLogGroup.files`, label in `log-browser/utils.ts` (`fileLabels`).
4. **New API route**: Add to `logApiPlugin.ts` in the `configureServer` middleware chain.
5. **Styling**: Use existing theme tokens. Extend `@theme` in `styles.css` only if the palette genuinely needs a new semantic color.
6. **Validation**: Run `npm run lint` (TypeScript check) and `npm run build` (Vite build) from `dashboard-local/`.
