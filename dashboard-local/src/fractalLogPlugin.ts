import { readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import type { Plugin } from "vite";
import { parseCliDebugTree, attributeEntriesToTree } from "./components/log-browser/cli-debug-subagent-parser";
import { parseContextWindowEntries, parseAssistantUsageEntries } from "./components/log-browser/context-window-parser";
import {
  buildTelemetryRunSummary,
  buildTelemetryTree,
  parseRunTelemetry,
} from "./components/log-browser/run-telemetry-parser";
import type {
  ContextWindowEntry,
  ParsedTree,
  RunAnalysis,
  RunSummary,
  AgentBreakdownEntry,
  SubagentTreeNode,
} from "./components/log-browser/tool-timeline-types";

/** Ending of the run telemetry files the explorer reads (`<taskId>-<ts>-<cli>-run-telemetry.json`). */
const RUN_TELEMETRY_SUFFIX = "-run-telemetry.json";

/** Ending of Claude Code's debug log, which the Copilot debug-log parser cannot read. */
const CLAUDE_DEBUG_LOG_SUFFIX = "-claude-cli-debug.log";

/**
 * Vite plugin serving GET /api/fractal-log?path=<abs-path>.
 * Reads a Copilot cli-debug log or a run telemetry file from disk and
 * returns JSON with its subagent tree and run summary.
 */
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

        // Path validation: must be absolute, canonical, and a .log or run telemetry file
        if (!isAbsolute(filePath)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Path must be absolute" }));
          return;
        }

        const canonical = resolve(filePath);
        if (canonical !== filePath) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Path must be canonical (no .., symlinks)" }));
          return;
        }

        if (filePath.endsWith(CLAUDE_DEBUG_LOG_SUFFIX)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "The Claude Code debug log holds no subagent tree; load the run's -claude-run-telemetry.json",
            }),
          );
          return;
        }

        const isRunTelemetry = filePath.endsWith(RUN_TELEMETRY_SUFFIX);
        if (!filePath.endsWith(".log") && !isRunTelemetry) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: "Only Copilot cli-debug .log files and *-run-telemetry.json files are supported" }),
          );
          return;
        }

        try {
          const content = readFileSync(filePath, "utf-8");
          const analysis = isRunTelemetry ? analyzeRunTelemetry(content) : analyzeCliDebugLog(content);
          if (!analysis) {
            res.writeHead(422, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Not run telemetry of a schema version this dashboard reads" }));
            return;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ tree: serializeTree(analysis.tree), summary: analysis.summary }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

/** The subagent tree and run summary of a Copilot CLI debug log. */
export function analyzeCliDebugLog(content: string): RunAnalysis {
  const tree = parseCliDebugTree(content);
  const contextEntries = parseContextWindowEntries(content);
  const usageEntries = parseAssistantUsageEntries(content);
  attributeEntriesToTree(tree, contextEntries, usageEntries);
  synthesizeContextFromUsage(tree, contextEntries);
  return { tree, summary: buildRunSummary(tree, contextEntries) };
}

/**
 * The subagent tree and run summary of a run telemetry file.
 *
 * @returns null when the file is not run telemetry of the schema version this dashboard reads.
 */
export function analyzeRunTelemetry(content: string): RunAnalysis | null {
  const telemetry = parseRunTelemetry(content);
  return telemetry && { tree: buildTelemetryTree(telemetry), summary: buildTelemetryRunSummary(telemetry) };
}

/**
 * Synthesize context window entries from assistant usage data for nodes
 * lacking CompactionProcessor coverage. Uses promptTokens as context size.
 */
function synthesizeContextFromUsage(tree: ParsedTree, contextEntries: ContextWindowEntry[]): void {
  const maxTokens = contextEntries.length > 0 ? contextEntries[0].maxTokens : 200_000;

  for (const node of tree.allNodes) {
    if (
      node.assistantUsageEntries.length > 0 &&
      node.contextWindowEntries.length < node.assistantUsageEntries.length / 2
    ) {
      const synthetic: ContextWindowEntry[] = node.assistantUsageEntries.map((u) => ({
        tsMs: u.tsMs,
        usedTokens: u.promptTokens,
        maxTokens,
        utilization: Math.min(100, (u.promptTokens / maxTokens) * 100),
      }));
      node.contextWindowEntries = [...node.contextWindowEntries, ...synthetic].sort((a, b) => a.tsMs - b.tsMs);
    }
  }
}

/** Build aggregate run summary from a parsed tree. */
export function buildRunSummary(
  tree: ParsedTree,
  contextEntries: import("./components/log-browser/tool-timeline-types").ContextWindowEntry[],
): RunSummary {
  const invocations = tree.allNodes.filter((n) => n.depth > 0);
  let maxDepth = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCachedTokens = 0;

  const agentMap = new Map<
    string,
    { count: number; totalDurationMs: number; totalTokens: number; compactionCount: number; maxDepth: number }
  >();

  for (const node of tree.allNodes) {
    if (node.depth > maxDepth) maxDepth = node.depth;

    for (const usage of node.assistantUsageEntries) {
      totalPromptTokens += usage.promptTokens;
      totalCompletionTokens += usage.completionTokens;
      totalCachedTokens += usage.cachedTokens;
    }

    let nodeCompactions = 0;
    for (let i = 1; i < node.contextWindowEntries.length; i++) {
      if (node.contextWindowEntries[i - 1].utilization - node.contextWindowEntries[i].utilization > 10) {
        nodeCompactions++;
      }
    }

    if (node.depth > 0) {
      const existing = agentMap.get(node.name);
      const nodeTokens = node.assistantUsageEntries.reduce((s, u) => s + u.totalTokens, 0);
      if (existing) {
        existing.count++;
        existing.totalDurationMs += node.durationMs ?? 0;
        existing.totalTokens += nodeTokens;
        existing.compactionCount += nodeCompactions;
        if (node.depth > existing.maxDepth) existing.maxDepth = node.depth;
      } else {
        agentMap.set(node.name, {
          count: 1,
          totalDurationMs: node.durationMs ?? 0,
          totalTokens: nodeTokens,
          compactionCount: nodeCompactions,
          maxDepth: node.depth,
        });
      }
    }
  }

  // Count compaction events (utilization drops >10 points) across all nodes
  let compactionCount = 0;
  for (const node of tree.allNodes) {
    const entries = node.contextWindowEntries;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i - 1].utilization - entries[i].utilization > 10) {
        compactionCount++;
      }
    }
  }

  const agentBreakdown: AgentBreakdownEntry[] = [...agentMap]
    .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
    .map(([name, data]) => ({ name, ...data }));

  return {
    totalDurationMs: tree.root.durationMs ?? 0,
    totalInvocations: invocations.length,
    maxDepth,
    totalPromptTokens,
    totalCompletionTokens,
    totalCachedTokens,
    compactionCount,
    agentBreakdown,
  };
}

/** Serialize tree to a JSON-safe structure (strips circular refs). */
function serializeTree(tree: ParsedTree) {
  function serializeNode(node: SubagentTreeNode): Record<string, unknown> {
    return {
      id: node.id,
      depth: node.depth,
      parentId: node.parentId,
      invocationIndex: node.invocationIndex,
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
      contextWindowEntries: node.contextWindowEntries,
      assistantUsageEntries: node.assistantUsageEntries,
      children: node.children.map(serializeNode),
    };
  }
  return {
    root: serializeNode(tree.root),
    allNodes: tree.allNodes.map(serializeNode),
  };
}
