import { Handle, Position, type NodeProps } from "@xyflow/react";

interface FractalNodeData {
  label: string;
  shortLabel: string;
  nodeKind: "orchestrator" | "coordinator" | "specialist" | "artifact";
  [key: string]: unknown;
}

const nodeStyles: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  orchestrator: { icon: "🎯", bg: "#7c3aed", border: "#a78bfa", text: "#fff" },
  coordinator: { icon: "📋", bg: "#0e7490", border: "#06b6d4", text: "#fff" },
  specialist: { icon: "⚙️", bg: "#1d4ed8", border: "#3b82f6", text: "#fff" },
  artifact: { icon: "📦", bg: "#854d0e", border: "#eab308", text: "#fff" },
};

export function FractalNodeCard({ data }: NodeProps) {
  const d = data as FractalNodeData;
  const style = nodeStyles[d.nodeKind] ?? nodeStyles.specialist;

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
          maxWidth: 220,
          lineHeight: "1.2",
        }}
      >
        <span className="text-[13px] leading-none">{style.icon}</span>
        <span className="truncate">{d.shortLabel}</span>
      </div>
      <Handle type="source" id="bottom" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" id="right" position={Position.Right} style={handleStyle} />
    </>
  );
}
