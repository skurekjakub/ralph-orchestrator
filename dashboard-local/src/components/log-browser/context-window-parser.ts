import type { AssistantUsageEntry, ContextWindowEntry } from "./tool-timeline-types";

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
