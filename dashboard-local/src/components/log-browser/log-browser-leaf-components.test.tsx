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

    render(
      <ExecutionRow
        group={makeTaskLogGroup()}
        onSelectFile={onSelectFile}
        onOpenTimeline={onOpenTimeline}
      />
    );

    await user.click(screen.getByRole("button", { name: /Summary/ }));
    await user.click(screen.getByRole("button", { name: /Timeline/ }));

    expect(onSelectFile).toHaveBeenCalledWith("DOC-3141/summary.json");
    expect(onOpenTimeline).toHaveBeenCalledWith(
      "DOC-3141/pre-tool.log",
      "DOC-3141/tool-output.log",
      "DOC-3141/cli-debug.log"
    );
  });
});

describe("IssueGroupSection", () => {
  it("expands to reveal executions for a task", async () => {
    const user = userEvent.setup();

    render(
      <IssueGroupSection
        group={makeIssueGroup()}
        onSelectFile={() => {}}
        onOpenTimeline={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: /Timeline/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /DOC-3141/ }));

    expect(screen.queryByRole("button", { name: /Timeline/ })).not.toBeNull();
  });
});

describe("DailyLogsSection", () => {
  it("opens a daily log file after expansion", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();

    render(
      <DailyLogsSection
        logs={[makeTaskLogGroup({ id: "activity-2026-03-07", taskId: "activity-2026-03-07", files: { log: "activity-2026-03-07.log" } })]}
        onSelectFile={onSelectFile}
      />
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