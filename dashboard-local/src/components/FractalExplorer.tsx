import { useState, type FormEvent } from "react";
import { useFractalExplorer } from "../useFractalExplorer";
import { InvocationTree } from "./fractal-explorer/InvocationTree";
import { NodeDetailPanel } from "./fractal-explorer/NodeDetailPanel";
import { RunSummaryPanel } from "./fractal-explorer/RunSummaryPanel";
import { FlameChart } from "./fractal-explorer/FlameChart";
import { TokenSankey } from "./fractal-explorer/TokenSankey";
import { UnavailableNotice } from "./log-browser/UnavailableNotice";
import { NO_TOKEN_USAGE_MESSAGE } from "./log-browser/tool-timeline-shared";

type SubView = "detail" | "flame" | "summary" | "sankey";

export function FractalExplorer() {
  const { tree, allNodes, summary, loading, error, selectedNodeId, setSelectedNodeId, loadLog } = useFractalExplorer();
  const [pathInput, setPathInput] = useState("");
  const [subView, setSubView] = useState<SubView>("detail");
  const tokensRecorded = summary?.totalPromptTokens != null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) loadLog(pathInput.trim());
  };

  const selectedNode = selectedNodeId ? (allNodes.find((n) => n.id === selectedNodeId) ?? null) : null;

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const ancestorChain = (nodeId: string | null): string[] => {
    const chain: string[] = [];
    let current = nodeId ? nodeMap.get(nodeId) : null;
    while (current && current.depth > 0) {
      chain.unshift(current.invocationIndex > 0 ? `${current.name} #${current.invocationIndex}` : current.name);
      current = current.parentId ? nodeMap.get(current.parentId) : null;
    }
    return chain;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Path input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-4 py-2 bg-bg-sidebar border-b border-border shrink-0"
      >
        <label className="text-xs text-dim font-medium">Log path:</label>
        <input
          type="text"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          placeholder="/absolute/path/to/cli-debug.log or …-claude-run-telemetry.json"
          className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border rounded font-mono text-fg-primary placeholder:text-dim"
        />
        <button
          type="submit"
          disabled={!pathInput.trim() || loading}
          className="px-3 py-1 text-xs font-medium bg-info/15 text-info rounded hover:bg-info/25 disabled:opacity-40"
        >
          {loading ? "Loading…" : "Load"}
        </button>
      </form>

      {/* Error */}
      {error && <div className="px-4 py-2 text-xs text-error bg-error/10 border-b border-error/20">{error}</div>}

      {/* Empty state */}
      {!tree && !loading && !error && (
        <div className="flex items-center justify-center flex-1 text-dim text-sm">
          Enter a Copilot cli-debug.log or a Claude Code run telemetry path to explore the run
        </div>
      )}

      {/* Loading */}
      {loading && <div className="flex items-center justify-center flex-1 text-dim text-sm">Parsing log file…</div>}

      {/* Loaded content */}
      {tree && !loading && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar: invocation tree */}
          <div className="w-72 min-w-60 border-r border-border overflow-y-auto bg-bg-sidebar shrink-0">
            <InvocationTree root={tree} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
          </div>

          {/* Main area */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Sub-nav */}
            <nav className="flex gap-1 px-4 py-1.5 bg-bg-header border-b border-border shrink-0">
              {(["detail", "flame", "summary", "sankey"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSubView(v)}
                  className={`px-2 py-0.5 text-xs rounded font-medium ${
                    subView === v ? "bg-info/15 text-info" : "text-dim hover:text-fg-primary"
                  }`}
                >
                  {v === "detail"
                    ? "Node Detail"
                    : v === "flame"
                      ? "Flame Chart"
                      : v === "summary"
                        ? "Summary"
                        : "Token Flow"}
                </button>
              ))}
            </nav>

            {/* View content */}
            <div className="flex-1 min-h-0 overflow-auto p-4">
              {subView === "detail" &&
                (selectedNode ? (
                  <NodeDetailPanel
                    node={selectedNode}
                    ancestorChain={ancestorChain(selectedNodeId)}
                    tokensRecorded={tokensRecorded}
                  />
                ) : (
                  <div className="text-dim text-sm">Select a node in the sidebar</div>
                ))}
              {subView === "flame" && summary && (
                <FlameChart root={tree} allNodes={allNodes} onSelectNode={setSelectedNodeId} />
              )}
              {subView === "summary" && summary && <RunSummaryPanel summary={summary} />}
              {subView === "sankey" &&
                summary &&
                (tokensRecorded ? (
                  <TokenSankey allNodes={allNodes} />
                ) : (
                  <UnavailableNotice title="Token flow" message={NO_TOKEN_USAGE_MESSAGE} />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
