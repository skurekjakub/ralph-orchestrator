import { useMemo } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import type { SubagentTreeNode } from "../log-browser/tool-timeline-types";

interface TokenSankeyProps {
  allNodes: SubagentTreeNode[];
  width?: number;
  height?: number;
}

interface SNode {
  name: string;
  color: string;
}

interface SLink {
  source: number;
  target: number;
  value: number;
}

const AGENT_COLORS: Record<string, string> = {
  coordinator: "#6366f1",
  orchestrator: "#6366f1",
  writer: "#22c55e",
  reviewer: "#f59e0b",
  analyzer: "#3b82f6",
  scout: "#8b5cf6",
  planner: "#ec4899",
  coder: "#14b8a6",
  scribe: "#f97316",
};

function agentColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (lower.includes(key)) return color;
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

export function TokenSankey({ allNodes, width = 800, height = 400 }: TokenSankeyProps) {
  const { nodes, links, sankeyData } = useMemo(() => {
    // Build aggregated parent→child token flows by unique agent names
    const nodeNames = new Set<string>();
    const flowMap = new Map<string, number>();

    for (const node of allNodes) {
      if (node.depth === 0) {
        nodeNames.add("orchestrator");
        continue;
      }
      nodeNames.add(node.name);

      const parentNode = allNodes.find((n) => n.id === node.parentId);
      const parentName = parentNode && parentNode.depth > 0 ? parentNode.name : "orchestrator";
      nodeNames.add(parentName);

      const tokens = node.assistantUsageEntries.reduce((s, u) => s + u.totalTokens, 0);
      if (tokens > 0) {
        const key = `${parentName}→${node.name}`;
        flowMap.set(key, (flowMap.get(key) ?? 0) + tokens);
      }
    }

    const nameList = Array.from(nodeNames);
    const nameIndex = new Map(nameList.map((n, i) => [n, i]));
    const sNodes: SNode[] = nameList.map((n) => ({ name: n, color: agentColor(n) }));
    const sLinks: SLink[] = [];

    for (const [key, value] of flowMap) {
      const [src, tgt] = key.split("→");
      const si = nameIndex.get(src);
      const ti = nameIndex.get(tgt);
      if (si != null && ti != null && si !== ti) {
        sLinks.push({ source: si, target: ti, value });
      }
    }

    if (sLinks.length === 0) {
      return { nodes: sNodes, links: sLinks, sankeyData: null };
    }

    const generator = sankey<SNode, SLink>()
      .nodeWidth(16)
      .nodePadding(12)
      .extent([
        [1, 1],
        [width - 1, height - 20],
      ]);

    const data = generator({
      nodes: sNodes.map((d) => ({ ...d })),
      links: sLinks.map((d) => ({ ...d })),
    });

    return { nodes: sNodes, links: sLinks, sankeyData: data };
  }, [allNodes, width, height]);

  if (!sankeyData || links.length === 0) {
    return <div className="text-dim text-xs">No token flow data to display</div>;
  }

  const linkPath = sankeyLinkHorizontal();

  return (
    <svg width={width} height={height}>
      {/* Links */}
      {sankeyData.links.map((link, i) => {
        const sourceNode = link.source as unknown as { color: string; name: string };
        return (
          <path
            key={i}
            d={linkPath(link as Parameters<typeof linkPath>[0]) ?? ""}
            fill="none"
            stroke={sourceNode.color}
            strokeOpacity={0.3}
            strokeWidth={Math.max(1, (link as unknown as { width: number }).width)}
          >
            <title>
              {sourceNode.name} → {(link.target as unknown as { name: string }).name}:{" "}
              {(link.value as number).toLocaleString()} tokens
            </title>
          </path>
        );
      })}

      {/* Nodes */}
      {sankeyData.nodes.map((node, i) => {
        const n = node as unknown as { x0: number; x1: number; y0: number; y1: number; color: string; name: string };
        return (
          <g key={i}>
            <rect
              x={n.x0}
              y={n.y0}
              width={n.x1 - n.x0}
              height={Math.max(1, n.y1 - n.y0)}
              fill={n.color}
              opacity={0.8}
              rx={2}
            />
            <text
              x={n.x0 < width / 2 ? n.x1 + 6 : n.x0 - 6}
              y={(n.y0 + n.y1) / 2}
              textAnchor={n.x0 < width / 2 ? "start" : "end"}
              dominantBaseline="central"
              fontSize="10"
              fill="currentColor"
              opacity="0.8"
            >
              {n.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
