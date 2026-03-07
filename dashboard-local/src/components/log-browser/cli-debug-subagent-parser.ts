import type { SubagentSpan } from "./tool-timeline-types";

export function parseCliDebugSubagents(content: string): SubagentSpan[] {
  const lines = content.split("\n");
  const spans: SubagentSpan[] = [];
  let currentSpan: SubagentSpan | null = null;
  let pendingFunctionBlock = false;
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
  const inlineToolFunction = /"function":\s*\{\s*"name":\s*"([^"]+)"/;
  const functionStart = /"function":\s*\{/;
  const functionName = /"name":\s*"([^"]+)"/;

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
      pendingFunctionBlock = false;
      continue;
    }

    if (!currentSpan) continue;

    if (toolCallExecuted.test(line)) {
      currentSpan.toolCallCount++;
    }
    if (modelCall.test(line)) {
      currentSpan.modelCallCount++;
    }

    if (functionStart.test(line)) {
      pendingFunctionBlock = true;
    }

    if (pendingFunctionBlock) {
      const nameMatch = line.match(functionName);
      if (nameMatch) {
        currentSpan.toolCalls.push({
          ts: lastTimestamp,
          tsMs: lastTimestampMs,
          tool: nameMatch[1],
        });
        pendingFunctionBlock = false;
        continue;
      }

      if (line.trim() === "}") {
        pendingFunctionBlock = false;
      }
    }

    const inlineMatch = line.match(inlineToolFunction);
    if (inlineMatch) {
      currentSpan.toolCalls.push({
        ts: lastTimestamp,
        tsMs: lastTimestampMs,
        tool: inlineMatch[1],
      });
    }
  }

  if (currentSpan) {
    spans.push(currentSpan);
  }

  return spans;
}