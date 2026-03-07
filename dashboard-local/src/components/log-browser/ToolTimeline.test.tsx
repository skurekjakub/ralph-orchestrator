import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolTimeline } from "./ToolTimeline";

describe("ToolTimeline", () => {
  it("loads log files and renders the summary plus subagent overview", async () => {
    const preTool = JSON.stringify({
      event: "pre_tool",
      ts: 1000,
      session: "s1",
      tool: "task",
      args: JSON.stringify({ agent_type: "ralph.malph-scout" }),
    });
    const toolOutput = [
      "── 09:23:51 task (success) ──",
      "args: {",
      '  "agent_type": "ralph.malph-scout"',
      "}",
      "done",
    ].join("\n");
    const cliDebug = [
      '2026-03-07T08:23:52.073Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_started)',
      '2026-03-07T08:23:52.075Z [DEBUG] Agent "ralph.malph-scout": definitionModel="claude-sonnet-4.5", sessionModel="claude-opus-4.6", availableModels=[claude-opus-4.6]',
      '2026-03-07T08:23:52.075Z [DEBUG] Agent "ralph.malph-scout" getOrCreateAgent: final model="claude-opus-4.6" (from resolveDefinitionModel)',
      '2026-03-07T08:23:59.900Z [DEBUG]         "function": {',
      '              "name": "report_intent",',
      '              "arguments": "{\"intent\":\"Scouting\"}"',
      '            }',
      '2026-03-07T08:23:59.960Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: tool_call_executed)',
      '2026-03-07T08:26:35.033Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_completed)',
    ].join("\n");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("pre-tool.log")) return new Response(preTool);
      if (url.includes("tool-output.log")) return new Response(toolOutput);
      if (url.includes("cli-debug.log")) return new Response(cliDebug);
      return new Response("", { status: 404 });
    });

    render(
      <ToolTimeline
        preToolFile="run/pre-tool.log"
        toolOutputFile="run/tool-output.log"
        cliDebugFile="run/cli-debug.log"
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/Tool Timeline/i)).not.toBeNull();
    });

    expect(screen.queryByText(/Subagent Pipeline/i)).not.toBeNull();
    expect(screen.getAllByText("malph-scout").length).toBeGreaterThan(0);
    expect(screen.queryByText(/1 calls?/)).not.toBeNull();
  });
});