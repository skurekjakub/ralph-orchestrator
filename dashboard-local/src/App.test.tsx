import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeOrchestratorState } from "./test/factories";
import { MockWebSocket } from "./test/fakes";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([]))),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows the live connection placeholder until dashboard state arrives", async () => {
    render(<App />);

    expect(screen.queryByText("Connecting to orchestrator...")).not.toBeNull();
  });

  it("switches from live view to the logs tab", async () => {
    const user = userEvent.setup();

    render(<App />);

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage({
        type: "state",
        data: makeOrchestratorState(),
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Container Output")).not.toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Logs" }));

    await waitFor(() => {
      expect(screen.queryByText("Log Browser")).not.toBeNull();
    });
  });
});