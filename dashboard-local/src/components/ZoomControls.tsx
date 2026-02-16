import { useZoom } from "../useZoom";
import { Button, ButtonVariant, ButtonSize } from "./Button";

export function ZoomControls() {
  const { zoomPercent, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut } =
    useZoom();

  return (
    <div className="flex items-center gap-0.5">
      <Button
        onClick={zoomOut}
        disabled={!canZoomOut}
        variant={ButtonVariant.Pill}
        size={ButtonSize.XS}
        title="Zoom out"
        className="w-6 h-6 flex items-center justify-center text-[12px]"
      >
        −
      </Button>
      <Button
        onClick={resetZoom}
        variant={ButtonVariant.Pill}
        size={ButtonSize.XS}
        title="Reset zoom"
        className="font-mono"
      >
        {zoomPercent}%
      </Button>
      <Button
        onClick={zoomIn}
        disabled={!canZoomIn}
        variant={ButtonVariant.Pill}
        size={ButtonSize.XS}
        title="Zoom in"
        className="w-6 h-6 flex items-center justify-center text-[12px]"
      >
        +
      </Button>
    </div>
  );
}
