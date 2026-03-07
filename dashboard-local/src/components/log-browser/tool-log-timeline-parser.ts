import type { PreToolEntry, ToolCallEntry, ToolOutputEntry } from "./tool-timeline-types";

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
      // Skip malformed lines.
    }
  }
  return entries;
}

export function parseToolOutputLog(content: string): ToolOutputEntry[] {
  const entries: ToolOutputEntry[] = [];
  const headerPattern = /^──\s+\d{2}:\d{2}:\d{2}\s+(.+?)\s+\((\w+)\)\s+──$/;

  const lines = content.split("\n");
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const headerMatch = lines[lineIndex].match(headerPattern);
    if (!headerMatch) {
      lineIndex++;
      continue;
    }

    const tool = headerMatch[1];
    const status = headerMatch[2];
    lineIndex++;

    const blockLines: string[] = [];
    while (lineIndex < lines.length && !headerPattern.test(lines[lineIndex])) {
      blockLines.push(lines[lineIndex]);
      lineIndex++;
    }

    const blockText = blockLines.join("\n");
    const argsStart = blockText.indexOf("args: {");
    let argsStr = "";
    let returnValue = "";

    if (argsStart !== -1) {
      const afterArgs = blockText.slice(argsStart + 6);
      let depth = 0;
      let endIndex = -1;
      for (let charIndex = 0; charIndex < afterArgs.length; charIndex++) {
        if (afterArgs[charIndex] === "{") depth++;
        else if (afterArgs[charIndex] === "}") {
          depth--;
          if (depth === 0) {
            endIndex = charIndex;
            break;
          }
        }
      }
      if (endIndex !== -1) {
        argsStr = afterArgs.slice(0, endIndex + 1);
        returnValue = afterArgs.slice(endIndex + 1).trim();
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

export function buildTimeline(preToolContent: string, toolOutputContent: string | null): ToolCallEntry[] {
  const preEntries = parsePreToolLog(preToolContent);
  const outputEntries = toolOutputContent ? parseToolOutputLog(toolOutputContent) : [];

  const outputByTool = new Map<string, ToolOutputEntry[]>();
  for (const entry of outputEntries) {
    const list = outputByTool.get(entry.tool) ?? [];
    list.push(entry);
    outputByTool.set(entry.tool, list);
  }

  const toolCounters = new Map<string, number>();

  const timeline: ToolCallEntry[] = preEntries.map((preEntry, index) => {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(preEntry.args);
    } catch {
      // Ignore malformed args payloads.
    }

    const isSkill = preEntry.tool === "skill";
    const skillName = isSkill ? String(parsedArgs.skill ?? "") : undefined;
    const isSubagent = preEntry.tool === "task";
    const subagentName = isSubagent
      ? String(parsedArgs.agent_type ?? "").replace(/^[^.]+\./, "")
      : undefined;

    const counter = toolCounters.get(preEntry.tool) ?? 0;
    toolCounters.set(preEntry.tool, counter + 1);
    const matchedOutput = outputByTool.get(preEntry.tool)?.[counter];

    return {
      index,
      ts: preEntry.ts,
      tool: preEntry.tool,
      args: parsedArgs,
      isSkill,
      skillName,
      isSubagent,
      subagentName,
      status: matchedOutput?.status,
      returnValue: matchedOutput?.returnValue,
    };
  });

  for (let index = 0; index < timeline.length - 1; index++) {
    timeline[index].durationMs = timeline[index + 1].ts - timeline[index].ts;
  }

  if (timeline.length > 0) {
    timeline[timeline.length - 1].durationMs = timeline[timeline.length - 1].durationMs ?? 0;
  }

  return timeline;
}