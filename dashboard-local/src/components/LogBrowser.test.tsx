import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskLogGroup } from "../types";
import { makeTaskLogGroup } from "../test/factories";

const useLogBrowserMock = vi.fn();

vi.mock("../useLogBrowser", () => ({
  useLogBrowser: () => useLogBrowserMock(),
}));

vi.mock("./log-browser/ToolTimeline", () => ({
  ToolTimeline: () => <div>TOOL_TIMELINE</div>,
}));

import { LogBrowser } from "./LogBrowser";

describe("LogBrowser", () => {
  it("renders log groups and opens the timeline view from an execution row", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    const selectFile = vi.fn();

    useLogBrowserMock.mockReturnValue({
      groups: [makeTaskLogGroup()] satisfies TaskLogGroup[],
      loading: false,
      selectedFile: null,
      fileContent: null,
      fileLoading: false,
      selectFile,
      refresh,
    });

    render(<LogBrowser />);

    await user.click(screen.getByRole("button", { name: /DOC-3141/ }));
    await user.click(screen.getByRole("button", { name: /Timeline/ }));

    expect(screen.queryByText("TOOL_TIMELINE")).not.toBeNull();
  });

  it("shows loading and selected-file states", () => {
    useLogBrowserMock.mockReturnValueOnce({
      groups: [],
      loading: true,
      selectedFile: null,
      fileContent: null,
      fileLoading: false,
      selectFile: vi.fn(),
      refresh: vi.fn(),
    });

    const { rerender } = render(<LogBrowser />);
    expect(screen.queryByText("Loading logs...")).not.toBeNull();

    useLogBrowserMock.mockReturnValueOnce({
      groups: [],
      loading: false,
      selectedFile: "run.log",
      fileContent: "hello",
      fileLoading: false,
      selectFile: vi.fn(),
      refresh: vi.fn(),
    });

    rerender(<LogBrowser />);
    expect(screen.queryByText("run.log")).not.toBeNull();
    expect(screen.queryByText("hello")).not.toBeNull();
  });
});