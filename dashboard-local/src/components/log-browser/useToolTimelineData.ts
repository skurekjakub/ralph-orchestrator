import { useEffect, useMemo, useState } from "react";
import { parseCliDebugSubagents } from "./cli-debug-subagent-parser";
import { buildTimeline } from "./tool-log-timeline-parser";
import type { SubagentSpan } from "./tool-timeline-types";

interface UseToolTimelineDataParams {
  preToolFile: string;
  toolOutputFile?: string;
  cliDebugFile?: string;
}

interface UseToolTimelineDataResult {
  loading: boolean;
  timeline: ReturnType<typeof buildTimeline>;
  subagentSpans: SubagentSpan[];
  subagentByName: Map<string, SubagentSpan>;
}

export function useToolTimelineData({
  preToolFile,
  toolOutputFile,
  cliDebugFile,
}: UseToolTimelineDataParams): UseToolTimelineDataResult {
  const [preToolContent, setPreToolContent] = useState<string | null>(null);
  const [toolOutputContent, setToolOutputContent] = useState<string | null>(null);
  const [cliDebugContent, setCliDebugContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetches = [
      fetch(`/api/logs/${encodeURIComponent(preToolFile)}`).then((r) => r.text()),
      toolOutputFile
        ? fetch(`/api/logs/${encodeURIComponent(toolOutputFile)}`).then((r) => r.text())
        : Promise.resolve(null),
      cliDebugFile
        ? fetch(`/api/logs/${encodeURIComponent(cliDebugFile)}`).then((r) => r.text())
        : Promise.resolve(null),
    ] as const;

    Promise.all(fetches)
      .then(([pre, output, debug]) => {
        if (cancelled) return;
        setPreToolContent(pre);
        setToolOutputContent(output);
        setCliDebugContent(debug);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [preToolFile, toolOutputFile, cliDebugFile]);

  const timeline = useMemo(() => {
    if (!preToolContent) return [];
    return buildTimeline(preToolContent, toolOutputContent);
  }, [preToolContent, toolOutputContent]);

  const subagentSpans = useMemo(() => {
    if (!cliDebugContent) return [];
    return parseCliDebugSubagents(cliDebugContent);
  }, [cliDebugContent]);

  const subagentByName = useMemo(() => {
    const map = new Map<string, SubagentSpan>();
    for (const span of subagentSpans) {
      map.set(span.name, span);
      map.set(span.fullName, span);
    }
    return map;
  }, [subagentSpans]);

  return { loading, timeline, subagentSpans, subagentByName };
}