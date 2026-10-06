export function FileViewer({
  filename,
  content,
  loading,
}: {
  filename: string;
  content: string | null;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1 bg-bg-panel border-b border-border text-[11px] font-mono text-dim">{filename}</div>
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <div className="text-dim text-sm">Loading...</div>
        ) : (
          <pre className="m-0 font-mono text-[11px] whitespace-pre-wrap break-words leading-relaxed">{content}</pre>
        )}
      </div>
    </div>
  );
}
