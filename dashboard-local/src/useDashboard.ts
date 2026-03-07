import { useEffect, useRef, useState, useCallback } from "react";
import type { OrchestratorState, DashboardMessage } from "./types";

const WS_URL = "ws://localhost:3100";
const RECONNECT_INTERVAL = 2000;

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseDashboardResult {
  state: OrchestratorState | null;
  toolOutput: string[];
  connectionStatus: ConnectionStatus;
}

export function useDashboard(): UseDashboardResult {
  const [state, setState] = useState<OrchestratorState | null>(null);
  const [toolOutput, setToolOutput] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
    };

    ws.onmessage = (event) => {
      const msg: DashboardMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "state":
          setState(msg.data);
          break;
        case "toolOutput":
          setToolOutput((prev) => [...prev.slice(-499), msg.data]);
          break;
      }
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, RECONNECT_INTERVAL);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, toolOutput, connectionStatus };
}
