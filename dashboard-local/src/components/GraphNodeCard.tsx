import { Handle, Position, type NodeProps } from "@xyflow/react";

interface GraphNodeData {
  label: string;
  nodeType: "agent" | "sub-agent" | "include" | "skill";
  category?: string;
  [key: string]: unknown;
}

const nodeStyles: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  agent: { icon: "🤖", bg: "#0891b2", border: "#06b6d4", text: "#fff" },
  "sub-agent": { icon: "🧩", bg: "#0e7490", border: "#06b6d4", text: "#fff" },
  include: { icon: "📄", bg: "#92400e", border: "#d97706", text: "#fff" },
};

function skillStyle(category?: string) {
  if (category?.startsWith("workflow")) return { icon: "⚡", bg: "#1e40af", border: "#3b82f6", text: "#fff" };
  if (category?.startsWith("integrations")) return { icon: "⚡", bg: "#6b21a8", border: "#a855f7", text: "#fff" };
  if (category?.startsWith("tasks")) return { icon: "⚡", bg: "#854d0e", border: "#eab308", text: "#fff" };
  return { icon: "⚡", bg: "#166534", border: "#22c55e", text: "#fff" };
}

const categoryLabels: Record<string, string> = {
  workflow: "workflow",
  domain: "domain",
  integrations: "integration",
  tasks: "task",
};

export function GraphNodeCard({ data }: NodeProps) {
  const d = data as GraphNodeData;
  const style = d.nodeType === "skill" ? skillStyle(d.category) : nodeStyles[d.nodeType];
  const catLabel = d.category ? categoryLabels[d.category] || d.category : null;

  const handleStyle = { width: 5, height: 5, background: "#4b5563", border: "none" };

  return (
    <>
      <Handle type="target" id="top" position={Position.Top} style={handleStyle} />
      <Handle type="target" id="left" position={Position.Left} style={handleStyle} />
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap select-none"
        style={{
          background: style.bg,
          border: `1.5px solid ${style.border}`,
          color: style.text,
          maxWidth: 280,
          lineHeight: "1.2",
        }}
      >
        <span className="text-[13px] leading-none">{style.icon}</span>
        <span className="truncate">{d.label}</span>
        {catLabel && (
          <span className="text-[9px] opacity-70 ml-auto pl-1.5" style={{ fontWeight: 400 }}>
            {catLabel}
          </span>
        )}
      </div>
      <Handle type="source" id="bottom" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" id="right" position={Position.Right} style={handleStyle} />
    </>
  );
}
