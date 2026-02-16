import { useEffect, useRef } from "react";

interface Props {
  lines: string[];
}

export function ToolOutputPanel({ lines }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="flex flex-col min-h-[150px] border-b border-border flex-1">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-header font-semibold text-[11px] uppercase tracking-wider text-dim border-b border-border shrink-0">
        Tool Output
        <span className="bg-border text-dim px-1.5 rounded-lg text-[10px] font-semibold">
          {lines.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[11px]">
        {lines.length === 0 ? (
          <div className="text-dim text-[11px] italic py-1">
            No tool output yet — starts streaming when an agent runs.
          </div>
        ) : (
          <pre className="m-0 font-mono text-[11px] whitespace-pre-wrap break-words">
            {lines.join("\n")}
          </pre>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
