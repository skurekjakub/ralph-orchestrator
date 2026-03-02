/** Parsed tool call entry for the timeline visualization. */
export interface ToolCallEntry {
  /** Index in the overall call sequence. */
  index: number;
  /** Epoch millisecond timestamp from pre-tool.log (when the call started). */
  ts: number;
  /** Tool name (e.g. "bash", "skill", "ralphchives-read-search_ralphchives"). */
  tool: string;
  /** Parsed args object. */
  args: Record<string, unknown>;
  /** Whether this is a skill invocation (tool === "skill"). */
  isSkill: boolean;
  /** Skill name if isSkill (extracted from args.skill). */
  skillName?: string;
  /** Whether this is a subagent invocation (tool === "task"). */
  isSubagent: boolean;
  /** Subagent name if isSubagent (extracted from args.agent_type, prefix-stripped). */
  subagentName?: string;
  /** Execution status from tool-output.log (e.g. "success"). */
  status?: string;
  /** Return value text from tool-output.log. */
  returnValue?: string;
  /** Duration in ms (computed from gap to next entry's timestamp). */
  durationMs?: number;
}

/** Raw pre-tool.log JSONL entry. */
interface PreToolEntry {
  event: string;
  ts: number;
  session: string;
  tool: string;
  args: string;
}

/** Parsed tool-output.log entry. */
interface ToolOutputEntry {
  tool: string;
  status: string;
  args: string;
  returnValue: string;
}

/**
 * Parse pre-tool.log JSONL content into structured entries.
 */
export function parsePreToolLog(content: string): PreToolEntry[] {
  const entries: PreToolEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as PreToolEntry;
      if (parsed.event === "pre_tool" && parsed.ts && parsed.tool) {
        entries.push(parsed);
      }
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/**
 * Parse tool-output.log text content into structured entries.
 *
 * Format:
 * ```
 * ── HH:MM:SS tool_name (status) ──
 * args: {
 *   "key": "value"
 * }
 * <return value text>
 * ```
 */
export function parseToolOutputLog(content: string): ToolOutputEntry[] {
  const entries: ToolOutputEntry[] = [];
  const headerPattern = /^──\s+\d{2}:\d{2}:\d{2}\s+(.+?)\s+\((\w+)\)\s+──$/;

  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const headerMatch = lines[i].match(headerPattern);
    if (!headerMatch) {
      i++;
      continue;
    }

    const tool = headerMatch[1];
    const status = headerMatch[2];
    i++;

    // Collect everything until the next header
    const blockLines: string[] = [];
    while (i < lines.length && !headerPattern.test(lines[i])) {
      blockLines.push(lines[i]);
      i++;
    }

    const blockText = blockLines.join("\n");

    // Split into args and return value
    // Args start with "args: {" and end with "}"
    const argsStart = blockText.indexOf("args: {");
    let argsStr = "";
    let returnValue = "";

    if (argsStart !== -1) {
      // Find the closing brace by tracking nesting
      const afterArgs = blockText.slice(argsStart + 6); // skip "args: "
      let depth = 0;
      let endIdx = -1;
      for (let j = 0; j < afterArgs.length; j++) {
        if (afterArgs[j] === "{") depth++;
        else if (afterArgs[j] === "}") {
          depth--;
          if (depth === 0) {
            endIdx = j;
            break;
          }
        }
      }
      if (endIdx !== -1) {
        argsStr = afterArgs.slice(0, endIdx + 1);
        returnValue = afterArgs.slice(endIdx + 1).trim();
      } else {
        returnValue = blockText.trim();
      }
    } else {
      returnValue = blockText.trim();
    }

    entries.push({ tool, status, args: argsStr, returnValue });
  }

  return entries;
}

/**
 * Merge pre-tool entries with tool-output entries to build a complete timeline.
 *
 * Correlation strategy: Match by order — the Nth pre-tool entry for a given tool
 * corresponds to the Nth tool-output entry for that tool. This handles cases where
 * the same tool is called multiple times.
 */
export function buildTimeline(
  preToolContent: string,
  toolOutputContent: string | null,
): ToolCallEntry[] {
  const preEntries = parsePreToolLog(preToolContent);
  const outputEntries = toolOutputContent ? parseToolOutputLog(toolOutputContent) : [];

  // Build a map of tool -> output entries (in order) for correlation
  const outputByTool = new Map<string, ToolOutputEntry[]>();
  for (const entry of outputEntries) {
    const list = outputByTool.get(entry.tool) ?? [];
    list.push(entry);
    outputByTool.set(entry.tool, list);
  }

  // Count how many times each tool has been seen in pre-tool entries
  const toolCounters = new Map<string, number>();

  const timeline: ToolCallEntry[] = preEntries.map((pre, index) => {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(pre.args);
    } catch { /* skip */ }

    const isSkill = pre.tool === "skill";
    const skillName = isSkill ? String(parsedArgs.skill ?? "") : undefined;
    const isSubagent = pre.tool === "task";
    const subagentName = isSubagent
      ? String(parsedArgs.agent_type ?? "").replace(/^[^.]+\./, "")
      : undefined;

    // Find matching output entry
    const counter = toolCounters.get(pre.tool) ?? 0;
    toolCounters.set(pre.tool, counter + 1);
    const outputs = outputByTool.get(pre.tool);
    const matchedOutput = outputs?.[counter];

    return {
      index,
      ts: pre.ts,
      tool: pre.tool,
      args: parsedArgs,
      isSkill,
      skillName,
      isSubagent,
      subagentName,
      status: matchedOutput?.status,
      returnValue: matchedOutput?.returnValue,
    };
  });

  // Compute durations from timestamp gaps
  for (let i = 0; i < timeline.length - 1; i++) {
    timeline[i].durationMs = timeline[i + 1].ts - timeline[i].ts;
  }
  // Last entry: estimate from task end or mark as unknown
  if (timeline.length > 0) {
    const last = timeline[timeline.length - 1];
    last.durationMs = last.durationMs ?? 0;
  }

  return timeline;
}

/** Category colors for tool types. */
export function getToolCategory(tool: string): "skill" | "mcp" | "edit" | "shell" | "nav" | "other" {
  if (tool === "skill") return "skill";
  if (tool.includes("-")) return "mcp"; // MCP tools have dashes (e.g. "ado-ado_create_pull_request")
  if (tool === "bash" || tool === "shell") return "shell";
  if (tool === "edit" || tool === "create" || tool === "view" || tool === "show_file") return "edit";
  if (tool === "task" || tool === "report_intent") return "nav";
  return "other";
}

export const categoryColors: Record<ReturnType<typeof getToolCategory>, { bg: string; text: string; bar: string }> = {
  skill:  { bg: "bg-purple-500/15", text: "text-purple-400", bar: "bg-purple-500" },
  mcp:    { bg: "bg-info/15",       text: "text-info",       bar: "bg-info" },
  edit:   { bg: "bg-success/15",    text: "text-success",    bar: "bg-success" },
  shell:  { bg: "bg-warn/15",       text: "text-warn",       bar: "bg-warn" },
  nav:    { bg: "bg-dim/15",        text: "text-dim",        bar: "bg-dim" },
  other:  { bg: "bg-border",        text: "text-text",       bar: "bg-text/50" },
};
