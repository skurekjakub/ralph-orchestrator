import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTaskLogGroup } from "./test/factories";
import { useLogBrowser } from "./useLogBrowser";

describe("useLogBrowser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads log groups and refreshes them on demand", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([makeTaskLogGroup()])))
      .mockResolvedValueOnce(new Response(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLogBrowser());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.groups).toHaveLength(1);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.groups).toHaveLength(0);
  });

  it("loads file content for a selected file", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/logs") return new Response(JSON.stringify([makeTaskLogGroup()]));
      if (url.includes("summary.json")) return new Response("summary content");
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLogBrowser());

    await waitFor(() => {
      expect(result.current.groups).toHaveLength(1);
    });

    await act(async () => {
      await result.current.selectFile("DOC-3141/summary.json");
    });

    expect(result.current.fileContent).toBe("summary content");
    expect(result.current.selectedFile).toBe("DOC-3141/summary.json");
  });

  it("shows fallback message when file fetch fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/logs") return new Response(JSON.stringify([makeTaskLogGroup()]));
      throw new Error("boom");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLogBrowser());

    await waitFor(() => {
      expect(result.current.groups).toHaveLength(1);
    });

    await act(async () => {
      await result.current.selectFile("DOC-3141/missing.log");
    });

    expect(result.current.fileContent).toBe("Failed to load file");
  });

  it("clears file content when selection is set to null", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/logs") return new Response(JSON.stringify([makeTaskLogGroup()]));
      if (url.includes("summary.json")) return new Response("summary content");
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLogBrowser());

    await waitFor(() => {
      expect(result.current.groups).toHaveLength(1);
    });

    await act(async () => {
      await result.current.selectFile("DOC-3141/summary.json");
    });

    await act(async () => {
      await result.current.selectFile(null);
    });

    expect(result.current.selectedFile).toBeNull();
    expect(result.current.fileContent).toBeNull();
  });
});