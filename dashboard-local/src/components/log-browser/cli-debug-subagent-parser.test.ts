import { describe, expect, it } from "vitest";
import { parseCliDebugSubagents } from "./cli-debug-subagent-parser";

describe("parseCliDebugSubagents", () => {
  it("extracts subagent spans, fallback model info, and nested tool calls", () => {
    const log = [
      "2026-03-07T08:23:52.073Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_started)",
      '2026-03-07T08:23:52.075Z [DEBUG] Agent "ralph.malph-scout": definitionModel="claude-sonnet-4.5", sessionModel="claude-opus-4.6", availableModels=[claude-opus-4.6]',
      '2026-03-07T08:23:52.075Z [INFO] Agent "ralph.malph-scout" definition model "claude-sonnet-4.5" is not available, falling back to session model "claude-opus-4.6"',
      '2026-03-07T08:23:52.075Z [DEBUG] Agent "ralph.malph-scout" getOrCreateAgent: final model="claude-opus-4.6" (from resolveDefinitionModel)',
      '2026-03-07T08:23:59.800Z [DEBUG]         "tool_calls": [',
      '2026-03-07T08:23:59.900Z [DEBUG]         "function": {',
      '              "name": "report_intent",',
      '              "arguments": "{\"intent\":\"Scouting\"}"',
      "            }",
      "2026-03-07T08:23:59.960Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: tool_call_executed)",
      '2026-03-07T08:24:00.100Z [DEBUG]         "function": {',
      '              "name": "bash",',
      '              "arguments": "{\"command\":\"echo hi\"}"',
      "            }",
      "        ],",
      "2026-03-07T08:24:00.200Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: tool_call_executed)",
      '2026-03-07T08:24:00.543Z [DEBUG] Tool invocation result: {"success":true,"commentId":"662016"}',
      '2026-03-07T08:24:00.700Z [DEBUG] Tool invocation result: {"success":true,"stdout":"ok"}',
      "2026-03-07T08:24:10.000Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: assistant_usage)",
      "2026-03-07T08:26:35.033Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_completed)",
    ].join("\n");

    const spans = parseCliDebugSubagents(log);

    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("malph-scout");
    expect(spans[0].definitionModel).toBe("claude-sonnet-4.5");
    expect(spans[0].resolvedModel).toBe("claude-opus-4.6");
    expect(spans[0].didFallback).toBe(true);
    expect(spans[0].toolCallCount).toBe(2);
    expect(spans[0].modelCallCount).toBe(1);
    expect(spans[0].toolCalls.map((entry) => entry.tool)).toEqual(["report_intent", "bash"]);
    expect(spans[0].toolCalls[0].argsJson).toBe('{"intent":"Scouting"}');
    expect(spans[0].toolCalls[0].returnValue).toContain('"commentId":"662016"');
    expect(spans[0].toolCalls[1].argsJson).toBe('{"command":"echo hi"}');
    expect(spans[0].toolCalls[1].returnValue).toContain('"stdout":"ok"');
    expect(spans[0].durationMs).toBeGreaterThan(0);
  });
});
