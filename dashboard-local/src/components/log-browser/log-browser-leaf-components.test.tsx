import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DailyLogsSection } from "./DailyLogsSection";
import { ExecutionRow } from "./ExecutionRow";
import { FileViewer } from "./FileViewer";
import { IssueGroupSection } from "./IssueGroupSection";
import { makeIssueGroup, makeTaskLogGroup } from "../../test/factories";

describe("ExecutionRow", () => {
  it("opens files and the timeline from the available buttons", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    const onOpenTimeline = vi.fn();

    render(<ExecutionRow group={makeTaskLogGroup()} onSelectFile={onSelectFile} onOpenTimeline={onOpenTimeline} />);

    await user.click(screen.getByRole("button", { name: /Summary/ }));
    await user.click(screen.getByRole("button", { name: /Timeline/ }));

    expect(onSelectFile).toHaveBeenCalledWith("DOC-3141/summary.json");
    expect(onOpenTimeline).toHaveBeenCalledWith({
      preTool: "DOC-3141/pre-tool.log",
      toolOutput: "DOC-3141/tool-output.log",
      cliDebug: "DOC-3141/cli-debug.log",
    });
  });

  it("opens the timeline of a Claude Code run that has run telemetry but no pre-tool log", async () => {
    // Arrange
    const user = userEvent.setup();
    const onOpenTimeline = vi.fn();
    const group = makeTaskLogGroup({
      files: { summary: "DF-1/summary.json", claudeRunTelemetry: "DF-1/claude-run-telemetry.json" },
    });
    render(<ExecutionRow group={group} onSelectFile={() => {}} onOpenTimeline={onOpenTimeline} />);

    // Act
    await user.click(screen.getByRole("button", { name: /Timeline/ }));

    // Assert
    expect(onOpenTimeline).toHaveBeenCalledWith({ runTelemetry: "DF-1/claude-run-telemetry.json" });
  });

  it("offers the Claude Code transcript, debug log and run telemetry as files", async () => {
    // Arrange
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    const group = makeTaskLogGroup({
      files: {
        claudeTranscript: "DF-1/claude-transcript.md",
        claudeCliDebug: "DF-1/claude-cli-debug.log",
        claudeRunTelemetry: "DF-1/claude-run-telemetry.json",
      },
    });
    render(<ExecutionRow group={group} onSelectFile={onSelectFile} />);

    // Act
    for (const name of ["Claude Transcript", "Claude Debug Log", "Run Telemetry"]) {
      await user.click(screen.getByRole("button", { name: new RegExp(name) }));
    }

    // Assert
    expect(onSelectFile.mock.calls).toEqual([
      ["DF-1/claude-transcript.md"],
      ["DF-1/claude-cli-debug.log"],
      ["DF-1/claude-run-telemetry.json"],
    ]);
  });
});

describe("IssueGroupSection", () => {
  it("expands to reveal executions for a task", async () => {
    const user = userEvent.setup();

    render(<IssueGroupSection group={makeIssueGroup()} onSelectFile={() => {}} onOpenTimeline={() => {}} />);

    expect(screen.queryByRole("button", { name: /Timeline/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /DOC-3141/ }));

    expect(screen.queryByRole("button", { name: /Timeline/ })).not.toBeNull();
  });

  it("flags the latest run's failure reason and sessions without hooks in its header", () => {
    // Arrange
    const latest = makeTaskLogGroup({
      summary: { status: "error", failureReason: "missing-result-block", hooklessSessions: ["s1"] },
    });

    // Act
    render(
      <IssueGroupSection
        group={makeIssueGroup({ executions: [latest], latestStatus: "error" })}
        onSelectFile={() => {}}
      />,
    );

    // Assert
    const header = screen.getByRole("button", { name: /DOC-3141/ });
    expect(header.textContent).toContain("missing-result-block");
    expect(header.textContent).toContain("hooks did not run");
  });
});

describe("DailyLogsSection", () => {
  it("opens a daily log file after expansion", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();

    render(
      <DailyLogsSection
        logs={[
          makeTaskLogGroup({
            id: "activity-2026-03-07",
            taskId: "activity-2026-03-07",
            files: { log: "activity-2026-03-07.log" },
          }),
        ]}
        onSelectFile={onSelectFile}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Daily Logs/ }));
    await user.click(screen.getByText("activity-2026-03-07"));

    expect(onSelectFile).toHaveBeenCalledWith("activity-2026-03-07.log");
  });
});

describe("FileViewer", () => {
  it("shows loading and then file content", () => {
    const { rerender } = render(<FileViewer filename="run.log" content={null} loading />);
    expect(screen.queryByText("Loading...")).not.toBeNull();

    rerender(<FileViewer filename="run.log" content="hello world" loading={false} />);
    expect(screen.queryByText("run.log")).not.toBeNull();
    expect(screen.queryByText("hello world")).not.toBeNull();
  });
});
