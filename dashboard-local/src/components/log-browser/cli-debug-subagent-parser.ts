import type { SubagentSpan } from "./tool-timeline-types";

export function parseCliDebugSubagents(content: string): SubagentSpan[] {
  const lines = content.split("\n");
  const spans: SubagentSpan[] = [];
  let currentSpan: SubagentSpan | null = null;
  let insideToolCallsArray = false;
  let pendingFunctionBlock = false;
  let pendingToolCall: SubagentSpan["toolCalls"][number] | null = null;
  let lastTimestamp = "";
  let lastTimestampMs = 0;

  const tsPattern = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s/;
  const subagentStarted = /kind: subagent_started/;
  const subagentCompleted = /kind: subagent_completed/;
  const agentFinalModel = /Agent "([^"]+)" getOrCreateAgent: final model="([^"]+)"/;
  const agentDefModel = /Agent "([^"]+)".*definitionModel="([^"]+)".*sessionModel="([^"]+)"/;
  const agentFallback = /Agent "([^"]+)" definition model "([^"]+)" is not available/;
  const toolCallExecuted = /kind: tool_call_executed/;
  const modelCall = /kind: assistant_usage/;
  const toolCallsStart = /"tool_calls":\s*\[/;
  const toolCallsEnd = /^\s*]\s*,?\s*$/;
  const inlineToolFunction = /"function":\s*\{\s*"name":\s*"([^"]+)"(?:,\s*"arguments":\s*"((?:[^"\\]|\\.)*)")?/;
  const functionStart = /"function":\s*\{/;
  const functionName = /"name":\s*"([^"]+)"/;
  const functionEnd = /^\s*}\s*,?\s*$/;
  const toolInvocationResult = /Tool invocation result:\s*(.+)$/;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const tsMatch = line.match(tsPattern);

    if (tsMatch) {
      lastTimestamp = tsMatch[1];
      lastTimestampMs = new Date(lastTimestamp).getTime();
    }

    if (subagentStarted.test(line)) {
      const timestamp = tsMatch?.[1] ?? "";
      currentSpan = {
        name: "",
        fullName: "",
        definitionModel: undefined,
        resolvedModel: "unknown",
        didFallback: false,
        startTs: timestamp,
        startMs: timestamp ? new Date(timestamp).getTime() : 0,
        toolCallCount: 0,
        modelCallCount: 0,
        toolCalls: [],
      };

      for (let scanIndex = lineIndex + 1; scanIndex < Math.min(lineIndex + 15, lines.length); scanIndex++) {
        const ahead = lines[scanIndex];

        const definitionMatch = ahead.match(agentDefModel);
        if (definitionMatch) {
          currentSpan.fullName = definitionMatch[1];
          currentSpan.name = definitionMatch[1].replace(/^[^.]+\./, "");
          currentSpan.definitionModel = definitionMatch[2];
        }

        const finalMatch = ahead.match(agentFinalModel);
        if (finalMatch) {
          if (!currentSpan.fullName) {
            currentSpan.fullName = finalMatch[1];
            currentSpan.name = finalMatch[1].replace(/^[^.]+\./, "");
          }
          currentSpan.resolvedModel = finalMatch[2];
        }

        if (ahead.match(agentFallback)) {
          currentSpan.didFallback = true;
        }

        if (finalMatch) break;
      }

      continue;
    }

    if (subagentCompleted.test(line) && currentSpan) {
      const timestamp = tsMatch?.[1] ?? "";
      currentSpan.endTs = timestamp;
      currentSpan.endMs = timestamp ? new Date(timestamp).getTime() : 0;
      if (currentSpan.startMs && currentSpan.endMs) {
        currentSpan.durationMs = currentSpan.endMs - currentSpan.startMs;
      }
      spans.push(currentSpan);
      currentSpan = null;
      insideToolCallsArray = false;
      pendingFunctionBlock = false;
      pendingToolCall = null;
      continue;
    }

    if (!currentSpan) continue;

    if (toolCallExecuted.test(line)) {
      currentSpan.toolCallCount++;
    }
    if (modelCall.test(line)) {
      currentSpan.modelCallCount++;
    }

    if (toolCallsStart.test(line)) {
      insideToolCallsArray = true;
      continue;
    }

    if (insideToolCallsArray && toolCallsEnd.test(line)) {
      insideToolCallsArray = false;
      pendingFunctionBlock = false;
      pendingToolCall = null;
      continue;
    }

    const resultMatch = line.match(toolInvocationResult);
    if (resultMatch) {
      const nextWithoutResult = currentSpan.toolCalls.find((toolCall) => toolCall.returnValue == null);
      if (nextWithoutResult) {
        nextWithoutResult.returnValue = resultMatch[1];
      }
    }

    if (!insideToolCallsArray) continue;

    if (functionStart.test(line)) {
      pendingFunctionBlock = true;
      pendingToolCall = {
        ts: lastTimestamp,
        tsMs: lastTimestampMs,
        tool: "unknown",
      };
    }

    if (pendingFunctionBlock) {
      const nameMatch = line.match(functionName);
      if (nameMatch) {
        if (pendingToolCall) pendingToolCall.tool = nameMatch[1];
      }

      const parsedArguments = parseArgumentsLine(line);
      if (parsedArguments != null && pendingToolCall) {
        pendingToolCall.argsJson = parsedArguments;
      }

      if (functionEnd.test(line)) {
        if (pendingToolCall && pendingToolCall.tool !== "unknown") {
          currentSpan.toolCalls.push(pendingToolCall);
        }
        pendingFunctionBlock = false;
        pendingToolCall = null;
        continue;
      }
    }

    const inlineMatch = line.match(inlineToolFunction);
    if (inlineMatch) {
      currentSpan.toolCalls.push({
        ts: lastTimestamp,
        tsMs: lastTimestampMs,
        tool: inlineMatch[1],
        argsJson: inlineMatch[2] ? decodeJsonString(inlineMatch[2]) : undefined,
      });
    }
  }

  if (currentSpan) {
    spans.push(currentSpan);
  }

  return spans;
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function parseArgumentsLine(line: string): string | null {
  const marker = '"arguments": ';
  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) return null;

  const rawValue = line.slice(markerIndex + marker.length).trim().replace(/,$/, "");
  try {
    const parsed = JSON.parse(rawValue) as string;
    return unwrapJsonString(parsed);
  } catch {
    return normalizeRawArgumentValue(rawValue);
  }
}

function unwrapJsonString(value: string): string {
  let current = value;
  for (let i = 0; i < 2; i++) {
    if (!(current.startsWith('"') && current.endsWith('"'))) {
      return current;
    }

    try {
      const parsed = JSON.parse(current) as string;
      if (typeof parsed !== "string") {
        return current;
      }
      current = parsed;
    } catch {
      return current.slice(1, -1);
    }
  }

  return current;
}

function normalizeRawArgumentValue(value: string): string {
  let current = value.trim();
  if (current.startsWith('"') && current.endsWith('"')) {
    current = current.slice(1, -1);
  }
  return current.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}