import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ZoomControls } from "./components/ZoomControls";
import { ZoomProvider, useZoom, useZoomState } from "./useZoom";

describe("useZoomState", () => {
  it("hydrates from the cookie and updates it when zoom changes", async () => {
    document.cookie = "ralph-dashboard-zoom=1.2";
    const user = userEvent.setup();

    function Harness() {
      const zoomState = useZoomState();
      return (
        <ZoomProvider value={zoomState}>
          <ZoomControls />
        </ZoomProvider>
      );
    }

    render(<Harness />);

    expect(screen.getByRole("button", { name: "120%" })).not.toBeNull();

    await user.click(screen.getByTitle("Zoom in"));

    expect(document.cookie).toContain("ralph-dashboard-zoom=1.35");
  });

  it("throws when useZoom is called outside the provider", () => {
    expect(() => renderHook(() => useZoom())).toThrow("useZoom must be used within a ZoomProvider");
  });
});
