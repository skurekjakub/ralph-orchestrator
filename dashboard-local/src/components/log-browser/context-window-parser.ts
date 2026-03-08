import type { AssistantUsageEntry, ContextWindowEntry, SubagentSpan } from "./tool-timeline-types";

/** Context window + usage entries attributed to a single agent (main or subagent). */
export interface AgentWindowSlice {
  /** Agent display name ("main" for the orchestrator). */
  name: string;
  /** Full agent identifier (empty for "main"). */
  fullName: string;
  /** Model used for inference. */
  model: string;
  /** Context window entries within this agent's time window. */
  entries: ContextWindowEntry[];
  /** Assistant usage entries within this agent's time window. */
  usageEntries: AssistantUsageEntry[];
}

const compactionPattern =
  /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s.*CompactionProcessor:\s*Utilization\s+([\d.]+)%\s+\((\d+)\/(\d+)\s+tokens\)/;

/**
 * Parse CompactionProcessor utilization lines from cli-debug.log.
 *
 * Each line looks like:
 * ```
 * 2026-03-07T08:22:33.874Z [INFO] CompactionProcessor: Utilization 17.6% (22534/128000 tokens) below threshold 80%
 * ```
 */
export function parseContextWindowEntries(content: string): ContextWindowEntry[] {
  const entries: ContextWindowEntry[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(compactionPattern);
    if (!match) continue;
    entries.push({
      tsMs: new Date(match[1]).getTime(),
      utilization: parseFloat(match[2]),
      usedTokens: parseInt(match[3], 10),
      maxTokens: parseInt(match[4], 10),
    });
  }
  entries.sort((a, b) => a.tsMs - b.tsMs);
  return entries;
}

const assistantUsagePattern = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s.*kind:\s*assistant_usage/;

/**
 * Parse assistant_usage telemetry blocks from cli-debug.log.
 *
 * Each block starts with a `kind: assistant_usage` line, followed within ~15 lines
 * by a JSON object containing `"usage": { ... }`.
 */
export function parseAssistantUsageEntries(content: string): AssistantUsageEntry[] {
  const lines = content.split("\n");
  const entries: AssistantUsageEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const headerMatch = lines[i].match(assistantUsagePattern);
    if (!headerMatch) continue;

    const tsMs = new Date(headerMatch[1]).getTime();

    // Scan ahead for the JSON usage block (typically within 10-20 lines).
    // The outer `{` is usually 1 line before the `"usage"` key, so when
    // we find `"usage"` we back up to capture the full object.
    for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
      if (lines[j].includes('"usage"')) {
        // Look back up to 3 lines for the opening `{`
        let start = j;
        for (let k = j - 1; k >= Math.max(j - 3, i + 1); k--) {
          const stripped = lines[k].replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+\[DEBUG]\s*/, "").trim();
          if (stripped === "{") { start = k; break; }
        }
        const usage = extractUsageBlock(lines, start);
        if (usage) {
          entries.push({ tsMs, ...usage });
          break;
        }
      }
    }
  }

  return entries;
}

interface UsageFields {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

/**
 * Extract { prompt_tokens, completion_tokens, cached_tokens, total_tokens }
 * from a JSON block starting around the given line index.
 */
function extractUsageBlock(lines: string[], startIndex: number): UsageFields | null {
  // Collect lines until we've captured the full usage object.
  // The object is typically a small JSON fragment spanning 6-8 lines.
  let jsonFragment = "";
  let braceDepth = 0;
  let started = false;

  for (let i = startIndex; i < Math.min(startIndex + 15, lines.length); i++) {
    const trimmed = lines[i].replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+\[DEBUG]\s*/, "");
    for (const ch of trimmed) {
      if (ch === "{") {
        braceDepth++;
        started = true;
      }
      if (started) jsonFragment += ch;
      if (ch === "}" && started) {
        braceDepth--;
        if (braceDepth === 0) {
          return parseUsageJson(jsonFragment);
        }
      }
    }
    if (started) jsonFragment += "\n";
  }
  return null;
}

function parseUsageJson(json: string): UsageFields | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const usage = parsed["usage"] as Record<string, unknown> | undefined;
    if (!usage) return null;
    const details = (usage["prompt_tokens_details"] as Record<string, unknown>) ?? {};
    return {
      promptTokens: asNumber(usage["prompt_tokens"]),
      completionTokens: asNumber(usage["completion_tokens"]),
      cachedTokens: asNumber(details["cached_tokens"]),
      totalTokens: asNumber(usage["total_tokens"]),
    };
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/**
 * Split context window and usage entries into per-agent slices using subagent
 * time windows. Entries whose timestamp falls between a subagent's `startMs`
 * and `endMs` are attributed to that subagent; all others go to "main".
 */
export function splitEntriesByAgent(
  entries: ContextWindowEntry[],
  usageEntries: AssistantUsageEntry[],
  subagentSpans: SubagentSpan[],
): AgentWindowSlice[] {
  if (subagentSpans.length === 0) return [];

  const sorted = [...subagentSpans].sort((a, b) => a.startMs - b.startMs);

  function findOwner(tsMs: number): SubagentSpan | null {
    for (const span of sorted) {
      if (tsMs >= span.startMs && span.endMs != null && tsMs <= span.endMs) return span;
    }
    return null;
  }

  const mainEntries: ContextWindowEntry[] = [];
  const mainUsage: AssistantUsageEntry[] = [];
  const spanMap = new Map<SubagentSpan, { entries: ContextWindowEntry[]; usage: AssistantUsageEntry[] }>();

  for (const span of sorted) {
    spanMap.set(span, { entries: [], usage: [] });
  }

  for (const entry of entries) {
    const owner = findOwner(entry.tsMs);
    if (owner) spanMap.get(owner)!.entries.push(entry);
    else mainEntries.push(entry);
  }

  for (const entry of usageEntries) {
    const owner = findOwner(entry.tsMs);
    if (owner) spanMap.get(owner)!.usage.push(entry);
    else mainUsage.push(entry);
  }

  const slices: AgentWindowSlice[] = [
    { name: "main", fullName: "", model: "", entries: mainEntries, usageEntries: mainUsage },
  ];

  for (const span of sorted) {
    const data = spanMap.get(span)!;
    if (data.entries.length === 0 && data.usage.length === 0) continue;
    slices.push({
      name: span.name,
      fullName: span.fullName,
      model: span.resolvedModel,
      entries: data.entries,
      usageEntries: data.usage,
    });
  }

  return slices;
}
