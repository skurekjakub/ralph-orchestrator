# Phase 2: Server-Side Extraction API

**Version**: v1  
**Goal**: A Vite plugin endpoint that reads a raw debug log from disk, runs the tree parser server-side, and returns condensed JSON to the browser.  
**Dependencies**: Phase 1 (tree parser, types)  
**Outputs consumed by**: Phase 3 (explorer tab shell)

---

## Context

Real fractal agent logs are ~150MB / ~1M lines. Sending the full file to the browser is not viable. The server-side extraction endpoint runs the tree parser and context window parsers on the server, returning only the structured `ParsedTree` + `RunSummary` as JSON (~10-50KB).

The existing `logApiPlugin.ts` pattern is the model — a Vite plugin that creates middleware. The new plugin follows the same pattern but serves a different endpoint with different semantics (arbitrary file path instead of relative filename within `output/logs/`).

---

## Tasks

### 2.1 — Create `fractalLogPlugin.ts` Vite plugin

**New file**: `dashboard-local/src/fractalLogPlugin.ts`

A Vite plugin that handles `GET /api/fractal-log?path=<absolute-path>`.

**Changes**:

1. **Plugin structure** (same pattern as `logApiPlugin.ts`):

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { parseCliDebugTree } from "./components/log-browser/cli-debug-subagent-parser";
import { parseContextWindowEntries, parseAssistantUsageEntries } from "./components/log-browser/context-window-parser";
import { attributeEntriesToTree } from "./components/log-browser/cli-debug-subagent-parser";
import type { RunSummary } from "./components/log-browser/tool-timeline-types";

export function fractalLogPlugin(): Plugin {
  return {
    name: "ralph-fractal-log-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/fractal-log") return next();

        const filePath = url.searchParams.get("path");
        if (!filePath) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing 'path' query parameter" }));
          return;
        }

        // Security: basic path validation
        const resolved = resolve(filePath);
        if (resolved !== filePath) {
          // Path wasn't already absolute/canonical — reject
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Path must be absolute and canonical" }));
          return;
        }
        if (!resolved.endsWith(".log")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Only .log files are supported" }));
          return;
        }

        try {
          const content = readFileSync(resolved, "utf-8");
          const { root, allNodes } = parseCliDebugTree(content);
          const contextEntries = parseContextWindowEntries(content);
          const usageEntries = parseAssistantUsageEntries(content);
          attributeEntriesToTree(root, contextEntries, usageEntries);

          const summary = buildRunSummary(root, allNodes, contextEntries);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ tree: root, summary }));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}
```

2. **`buildRunSummary()` helper** (in same file):

```typescript
function buildRunSummary(
  root: SubagentTreeNode,
  allNodes: SubagentTreeNode[],
  contextEntries: ContextWindowEntry[],
): RunSummary {
  const subagentNodes = allNodes.filter(n => n.depth > 0);
  const maxDepth = Math.max(0, ...allNodes.map(n => n.depth));

  let totalPrompt = 0, totalCompletion = 0, totalCached = 0, totalTotal = 0;
  for (const node of allNodes) {
    for (const u of node.assistantUsageEntries) {
      totalPrompt += u.promptTokens;
      totalCompletion += u.completionTokens;
      totalCached += u.cachedTokens;
      totalTotal += u.totalTokens;
    }
  }

  const nameMap = new Map<string, { count: number; durations: number[]; tokens: number }>();
  for (const node of subagentNodes) {
    const entry = nameMap.get(node.name) ?? { count: 0, durations: [], tokens: 0 };
    entry.count++;
    if (node.durationMs != null) entry.durations.push(node.durationMs);
    for (const u of node.assistantUsageEntries) entry.tokens += u.totalTokens;
    nameMap.set(node.name, entry);
  }

  return {
    totalDurationMs: (root.endMs ?? root.startMs) - root.startMs,
    totalInvocations: subagentNodes.length,
    maxDepth,
    tokens: { prompt: totalPrompt, completion: totalCompletion, cached: totalCached, total: totalTotal },
    agentBreakdown: [...nameMap.entries()].map(([name, data]) => ({
      name,
      count: data.count,
      avgDurationMs: data.durations.length > 0
        ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length)
        : 0,
      totalTokens: data.tokens,
    })),
    compactionEventCount: contextEntries.length,
  };
}
```

**Artifacts**:
- Creates: `dashboard-local/src/fractalLogPlugin.ts`
- Reads: `cli-debug-subagent-parser.ts`, `context-window-parser.ts`, `tool-timeline-types.ts` (from Phase 1)

**Acceptance Criteria**:
- [ ] `GET /api/fractal-log?path=/absolute/path.log` returns JSON `{ tree, summary }`
- [ ] Missing `path` param returns 400
- [ ] Non-absolute path (e.g. `../etc/passwd`) returns 400
- [ ] Non-`.log` extension returns 400
- [ ] File not found returns 500 with error message
- [ ] `summary` contains correct `totalInvocations`, `maxDepth`, token aggregates

---

### 2.2 — Register plugin in vite.config.ts

**File**: `dashboard-local/vite.config.ts`

**Changes**:

1. **Add import**: `import { fractalLogPlugin } from "./src/fractalLogPlugin";`
2. **Add to plugins array**: `fractalLogPlugin()` alongside existing plugins

```typescript
export default defineConfig({
  plugins: [react(), tailwindcss(), logApiPlugin(), agentGraphPlugin(), fractalGraphPlugin(), fractalLogPlugin()],
  // ...
});
```

**Acceptance Criteria**:
- [ ] `fractalLogPlugin()` registered in Vite config
- [ ] Dev server starts without errors
- [ ] Endpoint responds at `http://localhost:3101/api/fractal-log?path=...`

---

### 2.3 — Add `buildRunSummary` export for testing

**File**: `dashboard-local/src/fractalLogPlugin.ts`

Export `buildRunSummary` as a named export so it can be unit-tested independently of the HTTP middleware.

```typescript
export function buildRunSummary(...) { ... }
```

**Acceptance Criteria**:
- [ ] `buildRunSummary` is a named export
- [ ] Can be imported in tests without starting a Vite server
