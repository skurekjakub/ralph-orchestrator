# Phase 1: Tree Parser Foundation

**Version**: v1  
**Goal**: Replace the flat subagent parser with a tree-aware parser that tracks nesting depth, builds a tree data model, and attributes context window entries to the correct depth level.  
**Dependencies**: None  
**Outputs consumed by**: Phase 2 (server-side extraction), Phase 7 (tests)

---

## Context

The current `parseCliDebugSubagents()` in `cli-debug-subagent-parser.ts` uses a single `currentSpan` variable. When a nested `subagent_started` event arrives, it overwrites the parent span — losing the parent entirely. For fractal agent runs with 9 levels of nesting, this produces garbage output.

The fix is a stack-based parser that pushes on `subagent_started` and pops on `subagent_completed`, building a tree of `SubagentTreeNode` objects. A `flattenTree()` adapter preserves backward compatibility for the existing Logs tab (which consumes `SubagentSpan[]`).

Context window entries (`CompactionProcessor` + `assistant_usage`) happen within a single shared CLI context window. At any point in time, the deepest active subagent "owns" those entries. Attribution uses timestamp overlap with depth-first priority.

---

## Tasks

### 1.1 — Define `SubagentTreeNode` and `RunSummary` types

**File**: `dashboard-local/src/components/log-browser/tool-timeline-types.ts`

New types needed by the tree parser and the server-side API.

**Changes**:

1. **Add `SubagentTreeNode` interface** extending SubagentSpan fields with tree structure:

```typescript
/** A subagent invocation in the tree hierarchy. */
export interface SubagentTreeNode {
  /** Sequential numeric ID (assigned in DFS order). */
  id: number;
  /** Short agent name (prefix-stripped). */
  name: string;
  /** Full agent identifier (e.g. "ralph.content-writer"). */
  fullName: string;
  /** Model from agent definition. */
  definitionModel?: string;
  /** Model actually used for inference. */
  resolvedModel: string;
  /** Whether the model fell back from definition to session model. */
  didFallback: boolean;
  /** ISO timestamp of start. */
  startTs: string;
  /** ISO timestamp of completion. */
  endTs?: string;
  /** Epoch ms start. */
  startMs: number;
  /** Epoch ms end. */
  endMs?: number;
  /** Duration in ms. */
  durationMs?: number;
  /** Total tool_call_executed events. */
  toolCallCount: number;
  /** Model call (LLM turn) count. */
  modelCallCount: number;
  /** Extracted tool calls. */
  toolCalls: SubagentToolCall[];
  /** Nesting depth (0 = root/orchestrator). */
  depth: number;
  /** Parent node ID (null for root). */
  parentId: number | null;
  /** Child invocations. */
  children: SubagentTreeNode[];
  /** Nth invocation of this agent name (1-based). */
  invocationIndex: number;
  /** Context window entries attributed to this node's time window. */
  contextWindowEntries: ContextWindowEntry[];
  /** Assistant usage entries attributed to this node's time window. */
  assistantUsageEntries: AssistantUsageEntry[];
}
```

2. **Add `ParsedTree` result interface**:

```typescript
/** Result of parsing a cli-debug.log into a tree structure. */
export interface ParsedTree {
  /** Synthetic root node representing the orchestrator session. */
  root: SubagentTreeNode;
  /** All nodes in DFS order (flat list for convenience). */
  allNodes: SubagentTreeNode[];
}
```

3. **Add `RunSummary` interface**:

```typescript
/** Aggregate statistics for a complete fractal agent run. */
export interface RunSummary {
  /** Total wall-clock duration in ms. */
  totalDurationMs: number;
  /** Total number of subagent invocations. */
  totalInvocations: number;
  /** Maximum nesting depth observed. */
  maxDepth: number;
  /** Aggregate token counts. */
  tokens: {
    prompt: number;
    completion: number;
    cached: number;
    total: number;
  };
  /** Per-agent-name breakdown. */
  agentBreakdown: AgentBreakdownEntry[];
  /** Total CompactionProcessor events. */
  compactionEventCount: number;
}

/** Per-agent-name statistics in a run summary. */
export interface AgentBreakdownEntry {
  /** Short agent name. */
  name: string;
  /** Number of invocations. */
  count: number;
  /** Average duration in ms. */
  avgDurationMs: number;
  /** Sum of all token usage across invocations. */
  totalTokens: number;
}
```

**Acceptance Criteria**:
- [ ] `SubagentTreeNode` interface exported from `tool-timeline-types.ts`
- [ ] `ParsedTree` interface exported
- [ ] `RunSummary` and `AgentBreakdownEntry` interfaces exported
- [ ] No compile errors (`npm run lint` passes)

---

### 1.2 — Rewrite parser as `parseCliDebugTree()`

**File**: `dashboard-local/src/components/log-browser/cli-debug-subagent-parser.ts`

Replace the guts of the parser with a stack-based approach. Keep the same regex patterns but use a stack instead of `currentSpan`.

**Changes**:

1. **New export `parseCliDebugTree(content: string): ParsedTree`**: The main entry point for tree-aware parsing.

**Algorithm**:

```
stack = [syntheticRoot]      // root node at depth 0
invocationCounts = Map()     // agent name → count so far
nextId = 1

for each line:
  if subagent_started:
    newNode = { depth: stack.length, parentId: stack[top].id, ... }
    invocationCounts[name] = (invocationCounts[name] ?? 0) + 1
    newNode.invocationIndex = invocationCounts[name]
    stack[top].children.push(newNode)
    stack.push(newNode)
    
  if subagent_completed:
    if stack.length > 1:
      completedNode = stack.pop()
      set endTs, durationMs on completedNode
    
  if tool_call_executed:
    stack[top].toolCallCount++
    
  if assistant_usage:
    stack[top].modelCallCount++
    
  // tool call extraction: same logic, applied to stack[top]
```

2. **Synthetic root node**: Created with `id: 0, name: "orchestrator", depth: 0, parentId: null`. Its `startMs` = first timestamp seen, `endMs` = last timestamp seen.

3. **Agent name extraction**: Same lookahead logic as current (scan 15 lines for `getOrCreateAgent` patterns), but applied to `stack[top]` instead of `currentSpan`.

4. **Handle unclosed spans**: If parsing ends with stack.length > 1, pop remaining nodes without setting `endTs` (same as current behavior for unclosed spans).

5. **Keep old export for backward compat** (temporary, removed in 1.4):

```typescript
/** @deprecated Use parseCliDebugTree() + flattenTree() instead. */
export function parseCliDebugSubagents(content: string): SubagentSpan[] {
  const { root } = parseCliDebugTree(content);
  return flattenTree(root);
}
```

**Acceptance Criteria**:
- [ ] `parseCliDebugTree()` exported and returns `ParsedTree`
- [ ] Stack-based nesting: depth increments on `subagent_started`, decrements on `subagent_completed`
- [ ] `invocationIndex` correctly counts per agent name (1-based)
- [ ] Existing `parseCliDebugSubagents()` still works via delegation to tree parser + flatten
- [ ] No compile errors

---

### 1.3 — Add `flattenTree()` utility

**File**: `dashboard-local/src/components/log-browser/cli-debug-subagent-parser.ts`

Converts a `SubagentTreeNode` tree into a flat `SubagentSpan[]` for backward compatibility with the existing Logs tab components.

**Changes**:

1. **New export `flattenTree(root: SubagentTreeNode): SubagentSpan[]`**:

```typescript
export function flattenTree(root: SubagentTreeNode): SubagentSpan[] {
  const spans: SubagentSpan[] = [];

  function walk(node: SubagentTreeNode): void {
    // Skip the synthetic root — it's not a real subagent span
    if (node.depth > 0) {
      spans.push({
        name: node.name,
        fullName: node.fullName,
        definitionModel: node.definitionModel,
        resolvedModel: node.resolvedModel,
        didFallback: node.didFallback,
        startTs: node.startTs,
        endTs: node.endTs,
        startMs: node.startMs,
        endMs: node.endMs,
        durationMs: node.durationMs,
        toolCallCount: node.toolCallCount,
        modelCallCount: node.modelCallCount,
        toolCalls: node.toolCalls,
      });
    }
    for (const child of node.children) walk(child);
  }

  walk(root);
  return spans;
}
```

**Acceptance Criteria**:
- [ ] `flattenTree()` exported
- [ ] Skips synthetic root (depth 0)
- [ ] Returns `SubagentSpan[]` in DFS order
- [ ] Output structurally compatible with old `parseCliDebugSubagents()` output

---

### 1.4 — Refactor existing consumers to use tree parser

**File**: `dashboard-local/src/components/log-browser/useToolTimelineData.ts`

Switch the data hook from the old flat parser to the new tree parser + flatten.

**Changes**:

1. **Update import**: Change `parseCliDebugSubagents` → `parseCliDebugTree`, `flattenTree`
2. **Update useMemo**: 

```typescript
// Before:
const subagentSpans = useMemo(() => {
  if (!cliDebugContent) return [];
  return parseCliDebugSubagents(cliDebugContent);
}, [cliDebugContent]);

// After:
const parsedTree = useMemo(() => {
  if (!cliDebugContent) return null;
  return parseCliDebugTree(cliDebugContent);
}, [cliDebugContent]);

const subagentSpans = useMemo(() => {
  if (!parsedTree) return [];
  return flattenTree(parsedTree.root);
}, [parsedTree]);
```

3. **Expose `parsedTree`** in the hook return type for future use by the Explorer tab (optional — only if other components in the Logs tab want tree data).

**Acceptance Criteria**:
- [ ] `useToolTimelineData` uses `parseCliDebugTree()` + `flattenTree()`
- [ ] `subagentSpans` output is identical to before (behavioral backward compat)
- [ ] Existing Logs tab renders identically
- [ ] No compile errors

---

### 1.5 — Attribute context window entries to tree nodes

**File**: `dashboard-local/src/components/log-browser/cli-debug-subagent-parser.ts`

After building the tree, run the context window and usage parsers on the full log content, then attribute entries to the deepest matching tree node by timestamp.

**Changes**:

1. **New export `attributeEntriesToTree(root, contextEntries, usageEntries)`**:

```typescript
export function attributeEntriesToTree(
  root: SubagentTreeNode,
  contextEntries: ContextWindowEntry[],
  usageEntries: AssistantUsageEntry[],
): void {
  const allNodes = collectAllNodes(root);

  for (const entry of contextEntries) {
    const owner = findDeepestOwner(allNodes, entry.tsMs);
    owner.contextWindowEntries.push(entry);
  }

  for (const entry of usageEntries) {
    const owner = findDeepestOwner(allNodes, entry.tsMs);
    owner.assistantUsageEntries.push(entry);
  }
}
```

2. **`findDeepestOwner(nodes, tsMs)`**: Iterates all nodes, finds all whose time window contains `tsMs`, returns the one with the highest `depth`. Falls back to root if none match.

```typescript
function findDeepestOwner(
  nodes: SubagentTreeNode[],
  tsMs: number,
): SubagentTreeNode {
  let best = nodes[0]; // root fallback
  let bestDepth = -1;
  for (const node of nodes) {
    if (
      node.startMs <= tsMs &&
      (node.endMs == null || tsMs <= node.endMs) &&
      node.depth > bestDepth
    ) {
      best = node;
      bestDepth = node.depth;
    }
  }
  return best;
}
```

3. **Initialize arrays**: In `parseCliDebugTree()`, every new node gets `contextWindowEntries: []` and `assistantUsageEntries: []`.

**Acceptance Criteria**:
- [ ] `attributeEntriesToTree()` exported
- [ ] Entries attributed to deepest matching node by timestamp
- [ ] Root node receives entries that don't fall within any subagent window
- [ ] Each node's `contextWindowEntries` and `assistantUsageEntries` arrays populated after call
