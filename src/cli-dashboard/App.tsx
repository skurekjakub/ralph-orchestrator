import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { StatusPanel } from "./StatusPanel.js";
import { QueuePanel } from "./QueuePanel.js";
import { HistoryPanel } from "./HistoryPanel.js";
import { LogPanel } from "./LogPanel.js";
import type { OrchestratorState } from "../orchestrator-types.js";
import type { OrchestratorObserver } from "../orchestrator-observer.js";

/** Props for the root Ink dashboard. */
interface AppProps {
  observer: OrchestratorObserver;
}

/**
 * Root Ink component — subscribes to orchestrator observer state changes
 * and renders the terminal dashboard (status, queue, history, activity log).
 */
export function App({ observer }: AppProps): React.ReactElement {
  const [state, setState] = useState<OrchestratorState>(observer.getState());

  useEffect(() => {
    observer.onStateChange(setState);

    // Also refresh every second for the elapsed timer
    const timer = setInterval(() => {
      setState(observer.getState());
    }, 1000);

    return () => clearInterval(timer);
  }, [observer]);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={2} paddingY={1}>
      <Text bold color="blue">
        🤖 Ralph Orchestrator
      </Text>

      <StatusPanel state={state} />

      <LogPanel title="Container Output" logs={state.containerLogs} maxLines={12} />
      <LogPanel title="Orchestrator Log" logs={state.orchestratorLogs} maxLines={6} />

      <Box marginTop={1}>
        <Text dimColor>{"─".repeat(50)}</Text>
      </Box>

      <QueuePanel state={state} />
      <HistoryPanel completed={state.completedToday} />

      <Box marginTop={1}>
        <Text dimColor>{"─".repeat(50)}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Output: ./output/logs/ │ Press Ctrl+C to stop</Text>
      </Box>
    </Box>
  );
}
