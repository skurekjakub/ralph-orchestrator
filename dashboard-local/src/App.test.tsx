import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeOrchestratorState } from "./test/factories";

const useDashboardMock = vi.fn();

vi.mock("./useDashboard", () => ({
  useDashboard: () => useDashboardMock(),
}));

vi.mock("./components/LogBrowser", () => ({
  LogBrowser: () => <div>LOG_BROWSER_VIEW</div>,
}));

import { App } from "./App";

describe("App", () => {
  it("shows the live connection placeholder until dashboard state arrives", () => {
    useDashboardMock.mockReturnValue({
      state: null,
      toolOutput: [],
      connectionStatus: "connecting",
    });

    render(<App />);

    expect(screen.queryByText("Connecting to orchestrator...")).not.toBeNull();
  });

  it("switches from live view to the logs tab", async () => {
    const user = userEvent.setup();
    useDashboardMock.mockReturnValue({
      state: makeOrchestratorState(),
      toolOutput: ["hello"],
      connectionStatus: "connected",
    });

    render(<App />);

    expect(screen.queryByText("Container Output")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Logs" }));

    expect(screen.queryByText("LOG_BROWSER_VIEW")).not.toBeNull();
  });
});