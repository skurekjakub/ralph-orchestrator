import { useState, useCallback, createContext, useContext } from "react";

const COOKIE_KEY = "ralph-dashboard-zoom";
const DEFAULT_ZOOM = 1.0;
const ZOOM_STEPS = [0.75, 0.85, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5];

function readCookie(key: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(key: string, value: string): void {
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

function getInitialZoom(): number {
  const stored = readCookie(COOKIE_KEY);
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && ZOOM_STEPS.includes(parsed)) return parsed;
  }
  return DEFAULT_ZOOM;
}

export interface ZoomState {
  zoom: number;
  zoomPercent: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

const ZoomContext = createContext<ZoomState | null>(null);

export const ZoomProvider = ZoomContext.Provider;

export function useZoom(): ZoomState {
  const ctx = useContext(ZoomContext);
  if (!ctx) throw new Error("useZoom must be used within a ZoomProvider");
  return ctx;
}

/** Creates zoom state. Call once at the root, pass to ZoomProvider. */
export function useZoomState(): ZoomState {
  const [zoom, setZoomState] = useState(getInitialZoom);

  const setZoom = useCallback((value: number) => {
    setZoomState(value);
    writeCookie(COOKIE_KEY, String(value));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom(
      ZOOM_STEPS[Math.min(ZOOM_STEPS.indexOf(zoom) + 1, ZOOM_STEPS.length - 1)] ??
        zoom
    );
  }, [zoom, setZoom]);

  const zoomOut = useCallback(() => {
    setZoom(ZOOM_STEPS[Math.max(ZOOM_STEPS.indexOf(zoom) - 1, 0)] ?? zoom);
  }, [zoom, setZoom]);

  const resetZoom = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
  }, [setZoom]);

  return {
    zoom,
    zoomPercent: Math.round(zoom * 100),
    zoomIn,
    zoomOut,
    resetZoom,
    canZoomIn: ZOOM_STEPS.indexOf(zoom) < ZOOM_STEPS.length - 1,
    canZoomOut: ZOOM_STEPS.indexOf(zoom) > 0,
  };
}
