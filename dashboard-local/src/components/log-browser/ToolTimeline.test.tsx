import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import telemetryJson from "../../test/fixtures/claude-run-telemetry.json?raw";
import { ToolTimeline } from "./ToolTimeline";
import { NO_TOKEN_USAGE_MESSAGE } from "./tool-timeline-shared";

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
      "2026-03-07T08:23:52.073Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_started)",
      '2026-03-07T08:23:52.075Z [DEBUG] Agent "ralph.malph-scout": definitionModel="claude-sonnet-4.5", sessionModel="claude-opus-4.6", availableModels=[claude-opus-4.6]',
      '2026-03-07T08:23:52.075Z [DEBUG] Agent "ralph.malph-scout" getOrCreateAgent: final model="claude-opus-4.6" (from resolveDefinitionModel)',
      '2026-03-07T08:23:59.900Z [DEBUG]         "function": {',
      '              "name": "report_intent",',
      '              "arguments": "{\"intent\":\"Scouting\"}"',
      "            }",
      "2026-03-07T08:23:59.960Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: tool_call_executed)",
      "2026-03-07T08:26:35.033Z [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_completed)",
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
        files={{ preTool: "run/pre-tool.log", toolOutput: "run/tool-output.log", cliDebug: "run/cli-debug.log" }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Tool Timeline/i)).not.toBeNull();
    });

    expect(screen.queryByText(/Subagent Pipeline/i)).not.toBeNull();
    expect(screen.getAllByText("malph-scout").length).toBeGreaterThan(0);
    expect(screen.queryByText(/1 calls?/)).not.toBeNull();
  });

  describe("a Claude Code run", () => {
    /** The main thread's calls of the telemetry fixture's first session, as the audit hooks log them. */
    const CLAUDE_PRE_TOOL = [
      { ts: Date.parse("2026-10-07T06:00:03Z"), tool: "Bash", toolUseId: "toolu_bash", toolKind: "shell" },
      {
        ts: Date.parse("2026-10-07T06:00:05Z"),
        tool: "Agent",
        toolUseId: "toolu_agent",
        toolKind: "subagent",
        subagent: "writer",
      },
    ]
      .map((fields) =>
        JSON.stringify({
          schemaVersion: 2,
          event: "pre_tool",
          session: "s1",
          cli: "claude",
          agentId: null,
          args: "{}",
          ...fields,
        }),
      )
      .join("\n");

    /** Serves the given files by the end of their path, and 404 for anything else. */
    function serve(files: Record<string, string>) {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = decodeURIComponent(String(input));
        const match = Object.entries(files).find(([suffix]) => url.endsWith(suffix));
        return match ? new Response(match[1]) : new Response("File not found", { status: 404 });
      });
    }

    it("shows its telemetry counts and subagents and says its token charts are not available", async () => {
      // Arrange
      serve({ "pre-tool.log": CLAUDE_PRE_TOOL, "claude-run-telemetry.json": telemetryJson });

      // Act
      render(<ToolTimeline files={{ preTool: "run/pre-tool.log", runTelemetry: "run/claude-run-telemetry.json" }} />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText(/Tool Timeline/i)).not.toBeNull();
      });
      expect(screen.queryByText(/Claude Code telemetry/)).not.toBeNull();
      expect(screen.queryByText("API errors: authentication_failed ×1")).not.toBeNull();
      expect(screen.queryByText(/Subagent Pipeline — 3 agents/)).not.toBeNull();
      expect(screen.queryByText("Agent → writer")).not.toBeNull();
      expect(screen.getByRole("note").textContent).toContain(NO_TOKEN_USAGE_MESSAGE);
    });

    it("builds the timeline from the run telemetry when the run has no pre-tool log", async () => {
      // Arrange
      serve({ "claude-run-telemetry.json": telemetryJson });

      // Act
      render(<ToolTimeline files={{ runTelemetry: "run/claude-run-telemetry.json" }} />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText(/Tool Timeline/i)).not.toBeNull();
      });
      expect(screen.queryByText("4 calls")).not.toBeNull();
      expect(screen.getAllByText("writer ›")).toHaveLength(2);
    });

    it("says so when the run telemetry cannot be read", async () => {
      // Arrange
      serve({ "pre-tool.log": CLAUDE_PRE_TOOL, "claude-run-telemetry.json": "{ truncated" });

      // Act
      render(<ToolTimeline files={{ preTool: "run/pre-tool.log", runTelemetry: "run/claude-run-telemetry.json" }} />);

      // Assert
      await waitFor(() => {
        expect(screen.queryByText(/could not be read/)).not.toBeNull();
      });
      expect(screen.queryByText(/Claude Code telemetry/)).toBeNull();
    });
  });
});
