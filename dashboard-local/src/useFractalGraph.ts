import { useCallback, useEffect, useState } from "react";
import type { FractalFamily, FractalGraphData } from "./fractalGraphPlugin";

export type EdgeFilter = "dispatch" | "artifact-write" | "artifact-read";

export interface FractalGraphState {
  families: FractalFamily[];
  loading: boolean;
  selectedFamily: FractalFamily | null;
  graph: FractalGraphData | null;
  graphLoading: boolean;
  edgeFilters: Set<EdgeFilter>;
  selectFamily: (family: FractalFamily) => void;
  toggleEdgeFilter: (filter: EdgeFilter) => void;
}

export function useFractalGraph(): FractalGraphState {
  const [families, setFamilies] = useState<FractalFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFamily, setSelectedFamily] = useState<FractalFamily | null>(null);
  const [graph, setGraph] = useState<FractalGraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [edgeFilters, setEdgeFilters] = useState<Set<EdgeFilter>>(
    new Set(["dispatch", "artifact-write", "artifact-read"]),
  );

  useEffect(() => {
    fetch("/api/fractal-families")
      .then((r) => r.json())
      .then((data: FractalFamily[]) => {
        setFamilies(data);
        if (data.length > 0) setSelectedFamily(data[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedFamily) return;
    setGraphLoading(true);
    const dir = encodeURIComponent(selectedFamily.dir);
    const name = encodeURIComponent(selectedFamily.name);
    fetch(`/api/fractal-graph/${dir}/${name}`)
      .then((r) => r.json())
      .then((data: FractalGraphData) => setGraph(data))
      .finally(() => setGraphLoading(false));
  }, [selectedFamily]);

  const selectFamily = useCallback((family: FractalFamily) => {
    setSelectedFamily(family);
  }, []);

  const toggleEdgeFilter = useCallback((filter: EdgeFilter) => {
    setEdgeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }, []);

  return { families, loading, selectedFamily, graph, graphLoading, edgeFilters, selectFamily, toggleEdgeFilter };
}
