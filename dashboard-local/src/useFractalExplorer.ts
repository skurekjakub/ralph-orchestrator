import { useCallback, useEffect, useRef, useState } from "react";
import type { SubagentTreeNode, RunSummary } from "./components/log-browser/tool-timeline-types";

interface FractalLogResponse {
  tree: { root: SubagentTreeNode; allNodes: SubagentTreeNode[] };
  summary: RunSummary;
}

interface UseFractalExplorerResult {
  tree: SubagentTreeNode | null;
  allNodes: SubagentTreeNode[];
  summary: RunSummary | null;
  loading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  loadLog: (path: string) => void;
}

export function useFractalExplorer(): UseFractalExplorerResult {
  const [tree, setTree] = useState<SubagentTreeNode | null>(null);
  const [allNodes, setAllNodes] = useState<SubagentTreeNode[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadLog = useCallback((path: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setTree(null);
    setAllNodes([]);
    setSummary(null);
    setSelectedNodeId(null);

    fetch(`/api/fractal-log?path=${encodeURIComponent(path)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) return r.json().then((d: { error: string }) => { throw new Error(d.error); });
        return r.json() as Promise<FractalLogResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setTree(data.tree.root);
        setAllNodes(data.tree.allNodes);
        setSummary(data.summary);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { tree, allNodes, summary, loading, error, selectedNodeId, setSelectedNodeId, loadLog };
}
