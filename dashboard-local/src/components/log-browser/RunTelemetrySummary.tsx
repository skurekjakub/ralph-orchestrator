import type { RunTelemetry } from "./tool-timeline-types";
import { formatMs } from "./tool-timeline-shared";

/** Display names of the CLIs run telemetry describes. */
const CLI_LABELS: Record<string, string> = { claude: "Claude Code", copilot: "Copilot CLI" };

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Each API error kind of the run with how often it occurred, most frequent first. */
function apiErrorKinds(telemetry: RunTelemetry): [string, number][] {
  const counts = new Map<string, number>();
  for (const { kind } of telemetry.spans.flatMap((span) => span.apiErrors)) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** One line of a run's telemetry counts: sessions, subagents, model and tool calls, and what went wrong. */
export function RunTelemetrySummary({ telemetry }: { telemetry: RunTelemetry }) {
  const { totals } = telemetry;
  const errorKinds = apiErrorKinds(telemetry);

  return (
    <div className="flex items-baseline gap-3 flex-wrap text-[11px] text-dim">
      <span className="font-semibold text-[10px] uppercase tracking-wider">
        {CLI_LABELS[telemetry.cli] ?? telemetry.cli} telemetry
      </span>
      <span>{plural(totals.sessions, "session")}</span>
      <span>{plural(totals.subagents, "subagent")}</span>
      <span>{plural(totals.modelCalls, "model call")}</span>
      <span>{plural(totals.toolCalls, "tool call")}</span>
      {totals.failedToolCalls > 0 && <span className="text-error">{totals.failedToolCalls} failed</span>}
      {errorKinds.length > 0 && (
        <span className="text-error">
          API errors: {errorKinds.map(([kind, count]) => `${kind} ×${count}`).join(", ")}
        </span>
      )}
      {totals.compactions > 0 && <span>{plural(totals.compactions, "compaction")}</span>}
      {totals.malformedLines > 0 && (
        <span className="text-warn">{plural(totals.malformedLines, "unreadable session log line")}</span>
      )}
      {totals.durationMs !== undefined && <span className="text-text">{formatMs(totals.durationMs)}</span>}
    </div>
  );
}
