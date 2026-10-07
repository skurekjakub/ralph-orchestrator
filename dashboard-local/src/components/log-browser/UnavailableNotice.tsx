/** Placeholder for a view whose data the run's logs do not hold, saying which data and why. */
export function UnavailableNotice({ title, message }: { title: string; message: string }) {
  return (
    <div role="note" className="flex flex-col gap-0.5 px-2 py-1.5 rounded border border-dashed border-border">
      <span className="text-[10px] text-dim uppercase tracking-wider font-semibold">{title}</span>
      <span className="text-[11px] text-dim">{message}</span>
    </div>
  );
}
