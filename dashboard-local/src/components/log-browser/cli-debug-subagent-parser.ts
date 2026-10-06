import type { SubagentSpan, SubagentTreeNode, ParsedTree } from "./tool-timeline-types";

/**
 * Parse cli-debug.log into a tree of subagent invocations.
 * Uses a stack to track nesting — each `subagent_started` pushes,
 * each `subagent_completed` pops.
 */
export function parseCliDebugTree(content: string): ParsedTree {
  const lines = content.split("\n");
  let nodeCounter = 0;
  const invocationCounters = new Map<string, number>();

  const root: SubagentTreeNode = {
    id: `node-${nodeCounter++}`,
    depth: 0,
    parentId: null,
    children: [],
    invocationIndex: 0,
    contextWindowEntries: [],
    assistantUsageEntries: [],
    name: "root",
    fullName: "root",
    resolvedModel: "unknown",
    didFallback: false,
    startTs: "",
    startMs: 0,
    toolCallCount: 0,
    modelCallCount: 0,
    toolCalls: [],
  };

  const allNodes: SubagentTreeNode[] = [root];
  const stack: SubagentTreeNode[] = [root];

  let insideToolCallsArray = false;
  let pendingFunctionBlock = false;
  let pendingToolCall: SubagentSpan["toolCalls"][number] | null = null;
  let lastTimestamp = "";
  let lastTimestampMs = 0;

  const tsPattern = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s/;
  const subagentStarted = /kind: subagent_started/;
  const subagentCompleted = /kind: subagent_completed/;
  const agentFinalModel = /Agent "([^"]+)" getOrCreateAgent: final model="([^"]+)"/;
  const agentDefModel = /Agent "([^"]+)".*definitionModel="([^"]+)".*sessionModel="([^"]+)"/;
  const agentFallback = /Agent "([^"]+)" definition model "([^"]+)" is not available/;
  const toolCallExecuted = /kind: tool_call_executed/;
  const modelCall = /kind: assistant_usage/;
  const toolCallsStart = /"tool_calls":\s*\[/;
  const toolCallsEnd = /^\s*]\s*,?\s*$/;
  const inlineToolFunction = /"function":\s*\{\s*"name":\s*"([^"]+)"(?:,\s*"arguments":\s*"((?:[^"\\]|\\.)*)")?/;
  const functionStart = /"function":\s*\{/;
  const functionName = /"name":\s*"([^"]+)"/;
  const functionEnd = /^\s*}\s*,?\s*$/;
  const toolInvocationResult = /Tool invocation result:\s*(.+)$/;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const tsMatch = line.match(tsPattern);

    if (tsMatch) {
      lastTimestamp = tsMatch[1];
      lastTimestampMs = new Date(lastTimestamp).getTime();
    }

    // Update root timing from first/last timestamps
    if (tsMatch && root.startMs === 0) {
      root.startTs = lastTimestamp;
      root.startMs = lastTimestampMs;
    }
    if (tsMatch) {
      root.endTs = lastTimestamp;
      root.endMs = lastTimestampMs;
    }

    if (subagentStarted.test(line)) {
      const timestamp = tsMatch?.[1] ?? "";
      const parent = stack[stack.length - 1];
      const depth = stack.length;

      const node: SubagentTreeNode = {
        id: `node-${nodeCounter++}`,
        depth,
        parentId: parent.id,
        children: [],
        invocationIndex: 0,
        contextWindowEntries: [],
        assistantUsageEntries: [],
        name: "",
        fullName: "",
        definitionModel: undefined,
        resolvedModel: "unknown",
        didFallback: false,
        startTs: timestamp,
        startMs: timestamp ? new Date(timestamp).getTime() : 0,
        toolCallCount: 0,
        modelCallCount: 0,
        toolCalls: [],
      };

      for (let scanIndex = lineIndex + 1; scanIndex < Math.min(lineIndex + 15, lines.length); scanIndex++) {
        const ahead = lines[scanIndex];

        const definitionMatch = ahead.match(agentDefModel);
        if (definitionMatch) {
          node.fullName = definitionMatch[1];
          node.name = definitionMatch[1].replace(/^[^.]+\./, "");
          node.definitionModel = definitionMatch[2];
        }

        const finalMatch = ahead.match(agentFinalModel);
        if (finalMatch) {
          if (!node.fullName) {
            node.fullName = finalMatch[1];
            node.name = finalMatch[1].replace(/^[^.]+\./, "");
          }
          node.resolvedModel = finalMatch[2];
        }

        if (ahead.match(agentFallback)) {
          node.didFallback = true;
        }

        if (finalMatch) break;
      }

      // Assign invocation index
      const prevCount = invocationCounters.get(node.name) ?? 0;
      node.invocationIndex = prevCount + 1;
      invocationCounters.set(node.name, node.invocationIndex);

      parent.children.push(node);
      allNodes.push(node);
      stack.push(node);
      insideToolCallsArray = false;
      pendingFunctionBlock = false;
      pendingToolCall = null;
      continue;
    }

    if (subagentCompleted.test(line) && stack.length > 1) {
      const timestamp = tsMatch?.[1] ?? "";
      const node = stack.pop()!;
      node.endTs = timestamp;
      node.endMs = timestamp ? new Date(timestamp).getTime() : 0;
      if (node.startMs && node.endMs) {
        node.durationMs = node.endMs - node.startMs;
      }
      insideToolCallsArray = false;
      pendingFunctionBlock = false;
      pendingToolCall = null;
      continue;
    }

    // Attribute tool/model calls to the current (deepest) agent
    const current = stack[stack.length - 1];
    if (current === root) continue;

    if (toolCallExecuted.test(line)) {
      current.toolCallCount++;
    }
    if (modelCall.test(line)) {
      current.modelCallCount++;
    }

    if (toolCallsStart.test(line)) {
      insideToolCallsArray = true;
      continue;
    }

    if (insideToolCallsArray && toolCallsEnd.test(line)) {
      insideToolCallsArray = false;
      pendingFunctionBlock = false;
      pendingToolCall = null;
      continue;
    }

    const resultMatch = line.match(toolInvocationResult);
    if (resultMatch) {
      const nextWithoutResult = current.toolCalls.find((toolCall) => toolCall.returnValue == null);
      if (nextWithoutResult) {
        nextWithoutResult.returnValue = resultMatch[1];
      }
    }

    if (!insideToolCallsArray) continue;

    if (functionStart.test(line)) {
      pendingFunctionBlock = true;
      pendingToolCall = {
        ts: lastTimestamp,
        tsMs: lastTimestampMs,
        tool: "unknown",
      };
    }

    if (pendingFunctionBlock) {
      const nameMatch = line.match(functionName);
      if (nameMatch) {
        if (pendingToolCall) pendingToolCall.tool = nameMatch[1];
      }

      const parsedArguments = parseArgumentsLine(line);
      if (parsedArguments != null && pendingToolCall) {
        pendingToolCall.argsJson = parsedArguments;
      }

      if (functionEnd.test(line)) {
        if (pendingToolCall && pendingToolCall.tool !== "unknown") {
          current.toolCalls.push(pendingToolCall);
        }
        pendingFunctionBlock = false;
        pendingToolCall = null;
        continue;
      }
    }

    const inlineMatch = line.match(inlineToolFunction);
    if (inlineMatch) {
      current.toolCalls.push({
        ts: lastTimestamp,
        tsMs: lastTimestampMs,
        tool: inlineMatch[1],
        argsJson: inlineMatch[2] ? decodeJsonString(inlineMatch[2]) : undefined,
      });
    }
  }

  // Close any unclosed spans, tracking which nodes lacked explicit completion
  const unclosedIds = new Set<string>();
  while (stack.length > 1) {
    const node = stack.pop()!;
    unclosedIds.add(node.id);
    node.unclosed = true;
    if (!node.endMs && root.endMs) {
      node.endTs = root.endTs;
      node.endMs = root.endMs;
      node.durationMs = node.endMs - node.startMs;
    }
  }

  if (root.startMs && root.endMs) {
    root.durationMs = root.endMs - root.startMs;
  }

  reparentUnclosedSpans({ root, allNodes }, unclosedIds);
  flattenParallelDispatches({ root, allNodes });

  return { root, allNodes };
}

/**
 * Reparent children of unclosed spans (missing `subagent_completed`) to the
 * grandparent. Unclosed spans stay on the stack for the rest of the run,
 * causing all subsequent dispatches to appear falsely nested under them.
 */
function reparentUnclosedSpans(tree: ParsedTree, unclosedIds: Set<string>): void {
  if (unclosedIds.size === 0) return;

  const nodeMap = new Map<string, SubagentTreeNode>();
  for (const node of tree.allNodes) nodeMap.set(node.id, node);

  // Process shallowest-first so cascading unclosed chains resolve correctly
  const unclosed = tree.allNodes.filter((n) => unclosedIds.has(n.id)).sort((a, b) => a.depth - b.depth);

  for (const node of unclosed) {
    if (node.children.length === 0) continue;
    const parent = node.parentId ? nodeMap.get(node.parentId) : null;
    if (!parent) continue;

    // Move all children up to the grandparent
    for (const child of node.children) {
      child.parentId = parent.id;
      child.depth = node.depth;
      parent.children.push(child);
      adjustDescendantDepths(child);
    }
    node.children = [];
  }

  // Sort children by start time after restructuring
  for (const node of tree.allNodes) {
    if (node.children.length > 1) {
      node.children.sort((a, b) => a.startMs - b.startMs);
    }
  }
}

/**
 * Detect and fix false parent-child nesting caused by parallel subagent dispatch.
 *
 * When the CLI fires multiple `subagent_started` events within a short window
 * (e.g. a coordinator dispatching 3 reviewers in parallel), the stack-based parser
 * creates false chains like `style→persona→accuracy` when all three are actually
 * siblings. This post-processing step detects such chains by comparing each node's
 * start time to its parent's start time and re-parents false children as siblings.
 */
function flattenParallelDispatches(tree: ParsedTree, thresholdMs: number = 100): void {
  const nodeMap = new Map<string, SubagentTreeNode>();
  for (const node of tree.allNodes) nodeMap.set(node.id, node);

  // Collect nodes to reparent, sorted shallowest-first so cascading chains resolve correctly.
  const candidates = tree.allNodes
    .filter((n) => n !== tree.root && n.parentId != null)
    .sort((a, b) => a.depth - b.depth);

  for (const node of candidates) {
    const parent = nodeMap.get(node.parentId!);
    if (!parent || parent === tree.root) continue;

    if (Math.abs(node.startMs - parent.startMs) < thresholdMs) {
      const grandparent = parent.parentId ? nodeMap.get(parent.parentId) : null;
      if (!grandparent) continue;

      // Remove from old parent
      parent.children = parent.children.filter((c) => c.id !== node.id);

      // Re-parent as sibling of old parent
      node.parentId = grandparent.id;
      node.depth = parent.depth;
      grandparent.children.push(node);

      // Recursively fix descendant depths
      adjustDescendantDepths(node);
    }
  }

  // Sort all children by start time after restructuring
  for (const node of tree.allNodes) {
    if (node.children.length > 1) {
      node.children.sort((a, b) => a.startMs - b.startMs);
    }
  }
}

function adjustDescendantDepths(node: SubagentTreeNode): void {
  for (const child of node.children) {
    child.depth = node.depth + 1;
    adjustDescendantDepths(child);
  }
}

/** DFS walk producing SubagentSpan[] for backward compat. Skips synthetic root. */
export function flattenTree(tree: ParsedTree): SubagentSpan[] {
  const spans: SubagentSpan[] = [];
  function walk(node: SubagentTreeNode) {
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
  walk(tree.root);
  return spans;
}

/**
 * Backward-compatible wrapper — returns flat SubagentSpan[] like the old parser.
 */
export function parseCliDebugSubagents(content: string): SubagentSpan[] {
  return flattenTree(parseCliDebugTree(content));
}

/**
 * Attribute context window and usage entries to tree nodes.
 * Each entry goes to the deepest active node whose time window contains the timestamp.
 * Unowned entries go to root.
 */
export function attributeEntriesToTree(
  tree: ParsedTree,
  contextEntries: import("./tool-timeline-types").ContextWindowEntry[],
  usageEntries: import("./tool-timeline-types").AssistantUsageEntry[],
): void {
  // Clear existing attributions
  for (const node of tree.allNodes) {
    node.contextWindowEntries = [];
    node.assistantUsageEntries = [];
  }

  function findDeepestOwner(tsMs: number): SubagentTreeNode {
    let best = tree.root;
    for (const node of tree.allNodes) {
      if (node === tree.root || node.unclosed) continue;
      if (tsMs >= node.startMs && (node.endMs == null || tsMs <= node.endMs)) {
        if (node.depth > best.depth) best = node;
      }
    }
    return best;
  }

  for (const entry of contextEntries) {
    findDeepestOwner(entry.tsMs).contextWindowEntries.push(entry);
  }

  for (const entry of usageEntries) {
    findDeepestOwner(entry.tsMs).assistantUsageEntries.push(entry);
  }
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function parseArgumentsLine(line: string): string | null {
  const marker = '"arguments": ';
  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) return null;

  const rawValue = line
    .slice(markerIndex + marker.length)
    .trim()
    .replace(/,$/, "");
  try {
    const parsed = JSON.parse(rawValue) as string;
    return unwrapJsonString(parsed);
  } catch {
    return normalizeRawArgumentValue(rawValue);
  }
}

function unwrapJsonString(value: string): string {
  let current = value;
  for (let i = 0; i < 2; i++) {
    if (!(current.startsWith('"') && current.endsWith('"'))) {
      return current;
    }

    try {
      const parsed = JSON.parse(current) as string;
      if (typeof parsed !== "string") {
        return current;
      }
      current = parsed;
    } catch {
      return current.slice(1, -1);
    }
  }

  return current;
}

function normalizeRawArgumentValue(value: string): string {
  let current = value.trim();
  if (current.startsWith('"') && current.endsWith('"')) {
    current = current.slice(1, -1);
  }
  return current.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
