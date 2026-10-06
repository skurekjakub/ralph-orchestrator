import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboard } from "./useDashboard";
import { makeOrchestratorState } from "./test/factories";
import { MockWebSocket } from "./test/fakes";

describe("useDashboard", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("connects, receives state updates, and keeps only the latest 500 tool output lines", async () => {
    const { result } = renderHook(() => useDashboard());

    expect(result.current.connectionStatus).toBe("connecting");
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage({ type: "state", data: makeOrchestratorState() });
      for (let index = 0; index < 505; index++) {
        MockWebSocket.instances[0].emitMessage({ type: "toolOutput", data: `line-${index}` });
      }
    });

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe("connected");
      expect(result.current.state?.currentIssue?.key).toBe("DOC-3141");
      expect(result.current.toolOutput).toHaveLength(500);
      expect(result.current.toolOutput[0]).toBe("line-5");
    });
  });

  it("marks the connection disconnected and schedules a reconnect after close", async () => {
    const { result } = renderHook(() => useDashboard());

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });

    vi.useFakeTimers();

    act(() => {
      MockWebSocket.instances[0].emitClose();
    });

    expect(result.current.connectionStatus).toBe("disconnected");

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.connectionStatus).toBe("connecting");
    expect(MockWebSocket.instances.length).toBe(2);
  });
});
