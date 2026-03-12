import { useState } from "react";
import { useDashboard } from "./useDashboard";
import { useZoomState, ZoomProvider } from "./useZoom";
import { StatusBar } from "./components/StatusBar";
import { LogPanel } from "./components/LogPanel";
import { ToolOutputPanel } from "./components/ToolOutputPanel";
import { QueuePanel } from "./components/QueuePanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { LogBrowser } from "./components/LogBrowser";
import { AgentGraph } from "./components/AgentGraph";
import { ZoomControls } from "./components/ZoomControls";
import { Button, ButtonVariant } from "./components/Button";
import "./styles.css";

const badgeColors: Record<string, string> = {
  connected: "bg-success/15 text-success",
  connecting: "bg-warn/15 text-warn",
  disconnected: "bg-error/15 text-error",
};

type Tab = "live" | "logs" | "agents";

export function App() {
  const { state, toolOutput, connectionStatus } = useDashboard();
  const [tab, setTab] = useState<Tab>("live");
  const zoomState = useZoomState();

  return (
    <ZoomProvider value={zoomState}>
      <div
        className="flex flex-col overflow-hidden origin-top-left"
        style={{
          zoom: zoomState.zoom,
          width: `${100 / zoomState.zoom}vw`,
          height: `${100 / zoomState.zoom}vh`,
        }}
      >
        {/* Header */}
        <header className="flex items-center gap-4 px-4 py-2 bg-bg-header border-b border-border shrink-0">
          <h1 className="text-[15px] font-semibold tracking-wide">
            Ralph Orchestrator
          </h1>

          {/* Tabs */}
          <nav className="flex gap-1 ml-4">
            <Button
              onClick={() => setTab("live")}
              variant={tab === "live" ? ButtonVariant.Pill : ButtonVariant.Ghost}
              className={tab === "live" ? "bg-info/15 text-info" : ""}
            >
              Live
            </Button>
            <Button
              onClick={() => setTab("logs")}
              variant={tab === "logs" ? ButtonVariant.Pill : ButtonVariant.Ghost}
              className={tab === "logs" ? "bg-info/15 text-info" : ""}
            >
              Logs
            </Button>
            <Button
              onClick={() => setTab("agents")}
              variant={tab === "agents" ? ButtonVariant.Pill : ButtonVariant.Ghost}
              className={tab === "agents" ? "bg-info/15 text-info" : ""}
            >
              Agents
            </Button>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <ZoomControls />
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium uppercase ${badgeColors[connectionStatus]}`}
            >
              {connectionStatus}
            </span>
          </div>
        </header>

        {/* Content */}
        {tab === "live" ? (
          !state ? (
            <div className="flex items-center justify-center flex-1 text-dim text-sm">
              Connecting to orchestrator...
            </div>
          ) : (
            <>
              <StatusBar state={state} />

              <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Main column */}
                <div className="flex flex-col min-h-0 flex-2 border-r border-border">
                  <LogPanel
                    title="Container Output"
                    logs={state.containerLogs}
                    className="flex-2"
                  />
                  <ToolOutputPanel lines={toolOutput} />
                </div>

                {/* Side column */}
                <div className="flex flex-col min-h-0 flex-1 min-w-80">
                  <LogPanel
                    title="Orchestrator Log"
                    logs={state.orchestratorLogs}
                  />
                  <QueuePanel items={state.queueItems} />
                  <HistoryPanel tasks={state.completedToday} />
                </div>
              </div>
            </>
          )
        ) : tab === "logs" ? (
          <LogBrowser />
        ) : (
          <AgentGraph />
        )}
      </div>
    </ZoomProvider>
  );
}
