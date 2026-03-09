import { useMemo, useCallback, useEffect } from "react";
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
import { useAgentGraph } from "../useAgentGraph";
import { GraphNodeCard } from "./GraphNodeCard";
import { Button, ButtonVariant } from "./Button";
import type { GraphNodeJson } from "../agentGraphPlugin";

const nodeTypes: NodeTypes = { graphNode: GraphNodeCard };

/** Edge color by reference type. */
const edgeColors: Record<string, string> = {
  "sub-agent": "#06b6d4",
  render: "#4b5563",
  "conditional-render": "#a855f7",
  skill: "#3fb950",
};

/** Layout constants. */
const COL_W = 210;
const ROW_H = 46;
const SPINE_GAP = 55;
const SPINE_X = 0;

/**
 * Vertical-spine + horizontal-branch layout.
 *
 * The "spine" runs top-to-bottom: root agent → sub-agents (the workflow).
 * Each spine node's includes and skills branch out to the right in columns,
 * making it immediately clear what each agent does.
 */
function layoutGraph(
  nodes: GraphNodeJson[],
  rootId: string,
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = byId.get(rootId);
  if (!root) return { flowNodes: [], flowEdges: [] };

  // Spine: root + its sub-agents (in declaration order)
  const spine: string[] = [rootId];
  for (const ref of root.refs) {
    if (ref.type === "sub-agent" && byId.has(ref.targetId)) spine.push(ref.targetId);
  }
  const spineSet = new Set(spine);

  const placed = new Set<string>();
  const positions = new Map<string, { x: number; y: number }>();

  // --- Build edges for every ref ---
  const flowEdges: Edge[] = [];
  for (const n of nodes) {
    for (const ref of n.refs) {
      if (!byId.has(ref.targetId)) continue;
      const isSpineEdge = spineSet.has(n.id) && spineSet.has(ref.targetId) && ref.type === "sub-agent";
      const color = isSpineEdge ? "#06b6d4" : (edgeColors[ref.type] ?? "#4b5563");
      const condLabel = ref.condition
        ? ref.condition.replace(/triggerParams\./g, "").replace(/^not /, "!")
        : undefined;
      flowEdges.push({
        id: `${n.id}->${ref.targetId}`,
        source: n.id,
        target: ref.targetId,
        sourceHandle: isSpineEdge ? "bottom" : "right",
        targetHandle: isSpineEdge ? "top" : "left",
        label: condLabel,
        type: "smoothstep",
        style: {
          stroke: color,
          strokeWidth: isSpineEdge ? 2.5 : 1.5,
          strokeDasharray: ref.type === "conditional-render" ? "6 3" : undefined,
        },
        labelStyle: { fill: "#c4b5fd", fontSize: 9, fontWeight: 500 },
        labelBgStyle: { fill: "#161b22", fillOpacity: 0.95 },
        labelBgPadding: [4, 2] as [number, number],
      });
    }
  }

  // --- Position nodes: vertical spine, horizontal branches ---
  let y = 0;

  for (const spineId of spine) {
    const spineNode = byId.get(spineId)!;

    // Collect branch columns via BFS
    const includes: string[] = [];
    const skills: string[] = [];
    const transitive: string[] = [];

    // Col 1: direct includes (render/conditional-render, non-spine)
    for (const ref of spineNode.refs) {
      if ((ref.type === "render" || ref.type === "conditional-render")
        && !spineSet.has(ref.targetId) && !placed.has(ref.targetId) && byId.has(ref.targetId)) {
        includes.push(ref.targetId);
        placed.add(ref.targetId);
      }
    }

    // Col 2 seed: direct skills from spine node
    for (const ref of spineNode.refs) {
      if (ref.type === "skill" && !placed.has(ref.targetId) && byId.has(ref.targetId)) {
        skills.push(ref.targetId);
        placed.add(ref.targetId);
      }
    }

    // BFS through includes → find sub-includes and their skills
    for (let i = 0; i < includes.length; i++) {
      const inc = byId.get(includes[i]);
      if (!inc) continue;
      for (const ref of inc.refs) {
        if (!byId.has(ref.targetId) || placed.has(ref.targetId)) continue;
        if (ref.type === "render" || ref.type === "conditional-render") {
          includes.push(ref.targetId);
          placed.add(ref.targetId);
        } else if (ref.type === "skill") {
          skills.push(ref.targetId);
          placed.add(ref.targetId);
        }
      }
    }

    // Col 3: transitive skills (BFS from col-2 skills)
    for (let i = 0; i < skills.length; i++) {
      const sk = byId.get(skills[i]);
      if (!sk) continue;
      for (const ref of sk.refs) {
        if (ref.type === "skill" && !placed.has(ref.targetId) && byId.has(ref.targetId)) {
          transitive.push(ref.targetId);
          placed.add(ref.targetId);
        }
      }
    }
    // One more level of transitivity
    for (let i = 0; i < transitive.length; i++) {
      const sk = byId.get(transitive[i]);
      if (!sk) continue;
      for (const ref of sk.refs) {
        if (ref.type === "skill" && !placed.has(ref.targetId) && byId.has(ref.targetId)) {
          transitive.push(ref.targetId);
          placed.add(ref.targetId);
        }
      }
    }

    // Pack non-empty columns
    const columns = [includes, skills, transitive].filter((c) => c.length > 0);
    const maxRows = Math.max(1, ...columns.map((c) => c.length));
    const branchH = maxRows * ROW_H;

    // Spine node: vertically centered with its branch
    positions.set(spineId, { x: SPINE_X, y: y + (branchH - ROW_H) / 2 });
    placed.add(spineId);

    // Place each column, vertically centered within the branch band
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci];
      const colY = y + (branchH - col.length * ROW_H) / 2;
      for (let ri = 0; ri < col.length; ri++) {
        positions.set(col[ri], { x: SPINE_X + COL_W * (ci + 1), y: colY + ri * ROW_H });
      }
    }

    y += branchH + SPINE_GAP;
  }

  // Catch-all for orphans
  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, { x: SPINE_X + COL_W * 4, y });
      y += ROW_H;
    }
  }

  const flowNodes: Node[] = nodes
    .filter((n) => positions.has(n.id))
    .map((n) => ({
      id: n.id,
      type: "graphNode",
      position: positions.get(n.id)!,
      data: { label: n.label, nodeType: n.nodeType, category: n.category },
    }));

  return { flowNodes, flowEdges };
}

export function AgentGraph() {
  const { profiles, loading, selectedProfile, selectedAgent, graph, graphLoading, selectAgent } =
    useAgentGraph();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!graph || !selectedProfile || !selectedAgent) return { initialNodes: [], initialEdges: [] };
    const rid = `agent:${selectedProfile}/${selectedAgent}`;
    const { flowNodes, flowEdges } = layoutGraph(graph, rid);
    return { initialNodes: flowNodes, initialEdges: flowEdges };
  }, [graph, selectedProfile, selectedAgent]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync React Flow state when graph data changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onSelectAgent = useCallback(
    (profile: string, agent: string) => {
      selectAgent(profile, agent);
    },
    [selectAgent],
  );

  if (loading) {
    return <div className="flex items-center justify-center h-full text-dim text-sm">Loading profiles...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-header border-b border-border shrink-0 overflow-x-auto">
        <span className="font-semibold text-[11px] uppercase tracking-wider text-dim shrink-0">
          Agent Graph
        </span>
        {profiles.map((p) => (
          <div key={p.profile} className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-dim uppercase tracking-wide ml-2">{p.profile}:</span>
            {p.agents.map((a) => {
              const isActive = selectedProfile === p.profile && selectedAgent === a;
              return (
                <Button
                  key={`${p.profile}/${a}`}
                  onClick={() => onSelectAgent(p.profile, a)}
                  variant={isActive ? ButtonVariant.Pill : ButtonVariant.Ghost}
                  className={isActive ? "bg-info/15 text-info" : ""}
                >
                  {a.replace("ralph.", "")}
                </Button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Graph */}
      <div className="flex-1 min-h-0">
        {graphLoading ? (
          <div className="flex items-center justify-center h-full text-dim text-sm">Loading graph...</div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-dim text-sm">Select an agent to visualize</div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.35}
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
