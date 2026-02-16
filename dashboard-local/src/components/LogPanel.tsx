import { useEffect, useRef } from "react";
import type { LogEntry } from "../types";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

const levelColor: Record<string, string> = {
  info: "text-info",
  warn: "text-warn",
  error: "text-error",
};

interface Props {
  title: string;
  logs: readonly LogEntry[];
  className?: string;
}

export function LogPanel({ title, logs, className }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className={`flex flex-col min-h-[120px] border-b border-border flex-1 ${className ?? ""}`}>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-header font-semibold text-[11px] uppercase tracking-wider text-dim border-b border-border shrink-0">
        {title}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 font-mono text-[11.5px]">
        {logs.map((entry, i) => (
          <div
            key={i}
            className="flex gap-2 px-1 py-px rounded-sm hover:bg-white/[0.03]"
          >
            <span className="text-dim shrink-0 text-[10.5px]">
              {formatTime(entry.timestamp)}
            </span>
            <span
              className={`shrink-0 w-9 text-[10px] font-semibold ${levelColor[entry.level]}`}
            >
              {entry.level.toUpperCase()}
            </span>
            <span className="whitespace-pre-wrap break-words">
              {entry.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
