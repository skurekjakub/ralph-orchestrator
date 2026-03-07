import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryPanel } from "./HistoryPanel";
import { LogPanel } from "./LogPanel";
import { QueuePanel } from "./QueuePanel";
import { StatusBar } from "./StatusBar";
import { ToolOutputPanel } from "./ToolOutputPanel";
import { makeCompletedTask, makeLogEntry, makeOrchestratorState } from "../test/factories";

describe("StatusBar", () => {
  it("shows live issue, profile, elapsed time, and queue stats", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T09:20:30.000Z"));

    render(<StatusBar state={makeOrchestratorState()} />);

    expect(screen.queryByText("WORKING")).not.toBeNull();
    expect(screen.queryByText("DOC-3141")).not.toBeNull();
    expect(screen.queryByText(/Profile: ralph-vscode/)).not.toBeNull();
    expect(screen.queryByText(/Elapsed: 2m 30s/)).not.toBeNull();
    expect(screen.queryByText(/Queue: 2/)).not.toBeNull();

    vi.useRealTimers();
  });
});

describe("QueuePanel", () => {
  it("renders queued tasks and empty state", () => {
    const { rerender } = render(<QueuePanel items={[]} />);
    expect(screen.queryByText("No pending tasks")).not.toBeNull();

    rerender(<QueuePanel items={[{ key: "DOC-3175", summary: "Autocomplete colors" }]} />);
    expect(screen.queryByText("DOC-3175")).not.toBeNull();
    expect(screen.queryByText("Autocomplete colors")).not.toBeNull();
  });
});

describe("HistoryPanel", () => {
  it("renders completed tasks newest-first with PR links", () => {
    render(
      <HistoryPanel
        tasks={[
          makeCompletedTask({ key: "DOC-1000", completedAt: new Date("2026-03-07T09:10:00.000Z").getTime() }),
          makeCompletedTask({ key: "DOC-2000", completedAt: new Date("2026-03-07T09:20:00.000Z").getTime(), prUrl: "https://example.test/pr/2" }),
        ]}
      />
    );

    const taskKeys = screen.getAllByText(/DOC-/).map((node) => node.textContent);
    expect(taskKeys[0]).toBe("DOC-2000");
    expect(screen.getByRole("link", { name: "PR" }).getAttribute("href")).toBe("https://example.test/pr/2");
  });
});

describe("ToolOutputPanel", () => {
  it("shows empty state and streamed lines", () => {
    const { rerender } = render(<ToolOutputPanel lines={[]} />);
    expect(screen.queryByText(/No tool output yet/)).not.toBeNull();

    rerender(<ToolOutputPanel lines={["first line", "second line"]} />);
    expect(screen.queryByText(/first line/)).not.toBeNull();
    expect(screen.queryByText(/second line/)).not.toBeNull();
  });
});

describe("LogPanel", () => {
  it("renders timestamped log rows with level labels", () => {
    render(
      <LogPanel
        title="Orchestrator Log"
        logs={[
          makeLogEntry({ level: "info", message: "started" }),
          makeLogEntry({ level: "error", message: "failed" }),
        ]}
      />
    );

    expect(screen.queryByText("Orchestrator Log")).not.toBeNull();
    expect(screen.queryByText("INFO")).not.toBeNull();
    expect(screen.queryByText("ERROR")).not.toBeNull();
    expect(screen.queryByText("started")).not.toBeNull();
    expect(screen.queryByText("failed")).not.toBeNull();
  });
});