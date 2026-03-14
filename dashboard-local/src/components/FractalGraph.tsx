import { useMemo, useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useFractalGraph, type EdgeFilter } from "../useFractalGraph";
import type { FractalGraphData, FractalNode, ArtifactNode } from "../fractalGraphPlugin";
import { FractalNodeCard } from "./FractalNodeCard";
import { Button, ButtonVariant } from "./Button";

const nodeTypes: NodeTypes = { fractalNode: FractalNodeCard };

// ── Edge colors ──────────────────────────────────────────────────

const edgeColorMap: Record<string, { stroke: string; label: string }> = {
  dispatch: { stroke: "#a78bfa", label: "dispatch" },
  "artifact-write": { stroke: "#eab308", label: "writes" },
  "artifact-read": { stroke: "#22c55e", label: "reads" },
};

// ── Layout ───────────────────────────────────────────────────────

const AGENT_COL_X = 0;
const ARTIFACT_COL_X = 480;
const ROW_GAP = 70;
const ARTIFACT_ROW_GAP = 50;
const GROUP_GAP = 30;

interface LayoutResult {
  flowNodes: Node[];
  flowEdges: Edge[];
}

function layoutDataflow(data: FractalGraphData, edgeFilters: Set<EdgeFilter>): LayoutResult {
  const positions = new Map<string, { x: number; y: number }>();

  // Sort agents: orchestrator → coordinators → specialists (by passNumber)
  const sortedAgents = [...data.agents].sort((a, b) => {
    const roleOrder = { orchestrator: 0, coordinator: 1, specialist: 2 };
    const ro = roleOrder[a.role] - roleOrder[b.role];
    if (ro !== 0) return ro;
    return (a.passNumber ?? 999) - (b.passNumber ?? 999);
  });

  // Place agents in a vertical column
  let y = 0;
  for (const agent of sortedAgents) {
    positions.set(agent.id, { x: AGENT_COL_X, y });
    y += ROW_GAP;
  }

  // Determine which artifacts are actually visible based on edge filters
  const visibleArtifactIds = new Set<string>();
  if (edgeFilters.has("artifact-write") || edgeFilters.has("artifact-read")) {
    for (const edge of data.edges) {
      if (edge.type === "artifact-write" && edgeFilters.has("artifact-write")) {
        visibleArtifactIds.add(edge.target);
      }
      if (edge.type === "artifact-read" && edgeFilters.has("artifact-read")) {
        visibleArtifactIds.add(edge.source);
      }
    }
  }

  // Place artifacts in a second column, grouped by parent dir
  const visibleArtifacts = data.artifacts.filter((a) => visibleArtifactIds.has(a.id));
  const artifactsByDir = new Map<string, ArtifactNode[]>();
  for (const art of visibleArtifacts) {
    const parts = art.path.split("/");
    const dir = parts.length > 2 ? parts.slice(0, -1).join("/") : parts[0];
    if (!artifactsByDir.has(dir)) artifactsByDir.set(dir, []);
    artifactsByDir.get(dir)!.push(art);
  }

  let artY = 0;
  for (const [, arts] of artifactsByDir) {
    for (const art of arts) {
      positions.set(art.id, { x: ARTIFACT_COL_X, y: artY });
      artY += ARTIFACT_ROW_GAP;
    }
    artY += GROUP_GAP;
  }

  // Build nodes
  const flowNodes: Node[] = [];

  for (const agent of sortedAgents) {
    const pos = positions.get(agent.id);
    if (!pos) continue;
    flowNodes.push({
      id: agent.id,
      type: "fractalNode",
      position: pos,
      data: { label: agent.label, shortLabel: agent.shortLabel, nodeKind: agent.role },
    });
  }

  for (const art of visibleArtifacts) {
    const pos = positions.get(art.id);
    if (!pos) continue;
    flowNodes.push({
      id: art.id,
      type: "fractalNode",
      position: pos,
      data: { label: art.path, shortLabel: art.label, nodeKind: "artifact" },
    });
  }

  // Build edges
  const flowEdges: Edge[] = [];
  for (const edge of data.edges) {
    if (!edgeFilters.has(edge.type)) continue;
    if (!positions.has(edge.source) || !positions.has(edge.target)) continue;

    const color = edgeColorMap[edge.type];
    const isDispatch = edge.type === "dispatch";

    flowEdges.push({
      id: `${edge.source}->${edge.target}:${edge.type}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: isDispatch ? "bottom" : "right",
      targetHandle: isDispatch ? "top" : "left",
      type: "smoothstep",
      animated: isDispatch,
      style: {
        stroke: color.stroke,
        strokeWidth: isDispatch ? 2 : 1.5,
        strokeDasharray: edge.type === "artifact-read" ? "6 3" : undefined,
      },
      labelStyle: { fill: color.stroke, fontSize: 9, fontWeight: 500 },
      labelBgStyle: { fill: "#161b22", fillOpacity: 0.95 },
      labelBgPadding: [4, 2] as [number, number],
    });
  }

  return { flowNodes, flowEdges };
}

// ── Pipeline layout ──────────────────────────────────────────────

const PIPELINE_NODE_W = 200;
const PIPELINE_NODE_GAP = 60;
const PIPELINE_Y = 0;

function layoutPipeline(data: FractalGraphData): LayoutResult {
  if (data.pipeline.length === 0) return { flowNodes: [], flowEdges: [] };

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  let x = 0;
  for (let i = 0; i < data.pipeline.length; i++) {
    const pass = data.pipeline[i];
    const id = `pass:${pass.number}`;
    flowNodes.push({
      id,
      type: "fractalNode",
      position: { x, y: PIPELINE_Y },
      data: {
        label: pass.label,
        shortLabel: pass.label,
        nodeKind: pass.agents.length > 1 ? "coordinator" : "specialist",
      },
    });

    // Agent sub-nodes below the pass
    let subY = 60;
    for (const agentId of pass.agents) {
      const agent = data.agents.find((a) => a.id === agentId);
      if (!agent) continue;
      const subId = `pipeline:${agentId}`;
      flowNodes.push({
        id: subId,
        type: "fractalNode",
        position: { x: x + 10, y: subY },
        data: { label: agent.label, shortLabel: agent.shortLabel, nodeKind: agent.role },
      });
      flowEdges.push({
        id: `${id}->${subId}`,
        source: id,
        target: subId,
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "smoothstep",
        style: { stroke: "#4b5563", strokeWidth: 1 },
      });
      subY += 45;
    }

    // Connect passes sequentially
    if (i > 0) {
      const prevId = `pass:${data.pipeline[i - 1].number}`;
      flowEdges.push({
        id: `${prevId}->${id}`,
        source: prevId,
        target: id,
        sourceHandle: "right",
        targetHandle: "left",
        type: "smoothstep",
        animated: true,
        style: { stroke: "#a78bfa", strokeWidth: 2 },
        label: data.pipeline[i - 1].resultValues.length > 0
          ? data.pipeline[i - 1].resultValues[0]
          : undefined,
        labelStyle: { fill: "#c4b5fd", fontSize: 9, fontWeight: 500 },
        labelBgStyle: { fill: "#161b22", fillOpacity: 0.95 },
        labelBgPadding: [4, 2] as [number, number],
      });
    }

    x += PIPELINE_NODE_W + PIPELINE_NODE_GAP;
  }

  return { flowNodes, flowEdges };
}

// ── Component ────────────────────────────────────────────────────

type ViewMode = "dataflow" | "pipeline";

const filterLabels: Record<EdgeFilter, { label: string; color: string }> = {
  dispatch: { label: "Dispatch", color: "#a78bfa" },
  "artifact-write": { label: "Writes", color: "#eab308" },
  "artifact-read": { label: "Reads", color: "#22c55e" },
};

export function FractalGraph() {
  const { families, loading, selectedFamily, graph, graphLoading, edgeFilters, selectFamily, toggleEdgeFilter } =
    useFractalGraph();

  const [viewMode, setViewMode] = useState<ViewMode>("dataflow");

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!graph) return { initialNodes: [] as Node[], initialEdges: [] as Edge[] };
    const { flowNodes, flowEdges } = viewMode === "dataflow"
      ? layoutDataflow(graph, edgeFilters)
      : layoutPipeline(graph);
    return { initialNodes: flowNodes, initialEdges: flowEdges };
  }, [graph, edgeFilters, viewMode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onSelectFamily = useCallback(
    (f: typeof families[number]) => selectFamily(f),
    [selectFamily],
  );

  if (loading) {
    return <div className="flex items-center justify-center h-full text-dim text-sm">Loading families...</div>;
  }

  if (families.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-dim text-sm">
        No multi-agent families detected. Families need 3+ agents with a shared name prefix.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-header border-b border-border shrink-0 overflow-x-auto">
        <span className="font-semibold text-[11px] uppercase tracking-wider text-dim shrink-0">
          Fractal Agents
        </span>

        {/* Family selector */}
        {families.map((f) => (
          <Button
            key={`${f.dir}/${f.name}`}
            onClick={() => onSelectFamily(f)}
            variant={selectedFamily?.name === f.name && selectedFamily?.dir === f.dir
              ? ButtonVariant.Pill
              : ButtonVariant.Ghost}
            className={selectedFamily?.name === f.name ? "bg-info/15 text-info" : ""}
          >
            {f.name} ({f.agentCount})
          </Button>
        ))}

        {/* Separator */}
        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        {/* View mode toggle */}
        <Button
          onClick={() => setViewMode("dataflow")}
          variant={viewMode === "dataflow" ? ButtonVariant.Pill : ButtonVariant.Ghost}
          className={viewMode === "dataflow" ? "bg-info/15 text-info" : ""}
        >
          Dataflow
        </Button>
        <Button
          onClick={() => setViewMode("pipeline")}
          variant={viewMode === "pipeline" ? ButtonVariant.Pill : ButtonVariant.Ghost}
          className={viewMode === "pipeline" ? "bg-info/15 text-info" : ""}
        >
          Pipeline
        </Button>

        {/* Edge filters (only in dataflow mode) */}
        {viewMode === "dataflow" && (
          <>
            <div className="w-px h-4 bg-border mx-1 shrink-0" />
            {(Object.entries(filterLabels) as [EdgeFilter, { label: string; color: string }][]).map(
              ([key, { label, color }]) => (
                <button
                  key={key}
                  onClick={() => toggleEdgeFilter(key)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-opacity shrink-0"
                  style={{
                    opacity: edgeFilters.has(key) ? 1 : 0.35,
                    color,
                    border: `1px solid ${color}40`,
                    background: edgeFilters.has(key) ? `${color}15` : "transparent",
                  }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: color }}
                  />
                  {label}
                </button>
              ),
            )}
          </>
        )}

        {/* Stats */}
        {graph && (
          <span className="text-[10px] text-dim ml-auto shrink-0">
            {graph.agents.length} agents · {graph.artifacts.length} artifacts · {graph.edges.length} edges
          </span>
        )}
      </div>

      {/* Graph */}
      <div className="flex-1 min-h-0">
        {graphLoading ? (
          <div className="flex items-center justify-center h-full text-dim text-sm">Loading graph...</div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dim text-sm">
            Select a family to visualize
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ animated: false }}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#21262d" />
            <Controls
              showInteractive={false}
              position="bottom-right"
              style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6 }}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
