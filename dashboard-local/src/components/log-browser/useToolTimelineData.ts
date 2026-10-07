import { useEffect, useMemo, useState } from "react";
import { flattenTree, parseCliDebugTree } from "./cli-debug-subagent-parser";
import { parseAssistantUsageEntries, parseContextWindowEntries } from "./context-window-parser";
import {
  applyTelemetryToTimeline,
  parseRunTelemetry,
  telemetrySubagentSpans,
  telemetryTimeline,
} from "./run-telemetry-parser";
import { buildTimeline } from "./tool-log-timeline-parser";
import type {
  AssistantUsageEntry,
  ContextWindowEntry,
  RunTelemetry,
  SubagentSpan,
  TimelineFiles,
  ToolCallEntry,
} from "./tool-timeline-types";

interface UseToolTimelineDataResult {
  loading: boolean;
  timeline: ToolCallEntry[];
  /** Subagents from the run telemetry, then those from the Copilot debug log. */
  subagentSpans: SubagentSpan[];
  /** Subagents by name and full name; the last invocation of a name wins. */
  subagentByName: Map<string, SubagentSpan>;
  /** Subagents by the id of the tool call that spawned them (run telemetry). */
  subagentByToolUseId: Map<string, SubagentSpan>;
  /** Subagents from the Copilot debug log, which its context-window entries are attributed to. */
  copilotSubagentSpans: SubagentSpan[];
  contextWindowEntries: ContextWindowEntry[];
  assistantUsageEntries: AssistantUsageEntry[];
  /** The run telemetry; null without a telemetry file or when it cannot be read. */
  telemetry: RunTelemetry | null;
  /** Whether a run telemetry file was given but could not be read as telemetry this dashboard knows. */
  telemetryUnreadable: boolean;
}

async function fetchText(file: string | undefined): Promise<string | null> {
  if (!file) return null;
  const response = await fetch(`/api/logs/${encodeURIComponent(file)}`);
  return response.ok ? response.text() : null;
}

/**
 * Fetches and parses a run's timeline logs. Run telemetry, when given, supplies the subagents and each call's
 * measured duration and result; pre-tool.log supplies the calls themselves, else the telemetry's calls stand in.
 * The Copilot debug log adds Copilot subagents and the context-window and token entries.
 */
export function useToolTimelineData({
  preTool,
  toolOutput,
  cliDebug,
  runTelemetry,
}: TimelineFiles): UseToolTimelineDataResult {
  const [preToolContent, setPreToolContent] = useState<string | null>(null);
  const [toolOutputContent, setToolOutputContent] = useState<string | null>(null);
  const [cliDebugContent, setCliDebugContent] = useState<string | null>(null);
  const [telemetryContent, setTelemetryContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([fetchText(preTool), fetchText(toolOutput), fetchText(cliDebug), fetchText(runTelemetry)])
      .then(([pre, output, debug, telemetryText]) => {
        if (cancelled) return;
        setPreToolContent(pre);
        setToolOutputContent(output);
        setCliDebugContent(debug);
        setTelemetryContent(telemetryText);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [preTool, toolOutput, cliDebug, runTelemetry]);

  const telemetry = useMemo(
    () => (telemetryContent === null ? null : parseRunTelemetry(telemetryContent)),
    [telemetryContent],
  );

  const timeline = useMemo(() => {
    if (preToolContent) {
      const calls = buildTimeline(preToolContent, toolOutputContent);
      return telemetry ? applyTelemetryToTimeline(calls, telemetry) : calls;
    }
    return telemetry ? telemetryTimeline(telemetry) : [];
  }, [preToolContent, toolOutputContent, telemetry]);

  const copilotSubagentSpans = useMemo(
    () => (cliDebugContent ? flattenTree(parseCliDebugTree(cliDebugContent)) : []),
    [cliDebugContent],
  );

  const subagentSpans = useMemo(
    () => [...(telemetry ? telemetrySubagentSpans(telemetry) : []), ...copilotSubagentSpans],
    [telemetry, copilotSubagentSpans],
  );

  const subagentByName = useMemo(() => {
    const map = new Map<string, SubagentSpan>();
    for (const span of subagentSpans) {
      map.set(span.name, span);
      map.set(span.fullName, span);
    }
    return map;
  }, [subagentSpans]);

  const subagentByToolUseId = useMemo(
    () => new Map(subagentSpans.flatMap((span) => (span.toolUseId ? [[span.toolUseId, span] as const] : []))),
    [subagentSpans],
  );

  const contextWindowEntries = useMemo(
    () => (cliDebugContent ? parseContextWindowEntries(cliDebugContent) : []),
    [cliDebugContent],
  );

  const assistantUsageEntries = useMemo(
    () => (cliDebugContent ? parseAssistantUsageEntries(cliDebugContent) : []),
    [cliDebugContent],
  );

  return {
    loading,
    timeline,
    subagentSpans,
    subagentByName,
    subagentByToolUseId,
    copilotSubagentSpans,
    contextWindowEntries,
    assistantUsageEntries,
    telemetry,
    telemetryUnreadable: Boolean(runTelemetry) && !loading && telemetry === null,
  };
}
