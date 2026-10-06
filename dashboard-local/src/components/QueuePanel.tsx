interface Props {
  items: readonly { key: string; summary: string }[];
}

export function QueuePanel({ items }: Props) {
  return (
    <div className="flex flex-col border-b border-border max-h-40">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-header font-semibold text-[11px] uppercase tracking-wider text-dim border-b border-border shrink-0">
        Queue
        <span className="bg-border text-dim px-1.5 rounded-lg text-[10px] font-semibold">{items.length}</span>
      </div>
      <div className="px-3 py-2 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-dim text-[11px] italic">No pending tasks</div>
        ) : (
          <ul className="list-none">
            {items.map((item, i) => (
              <li key={i} className="flex gap-2 py-0.5 text-xs">
                <span className="font-semibold text-info font-mono text-[11px]">{item.key}</span>
                <span className="text-dim text-[11px] truncate">{item.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
