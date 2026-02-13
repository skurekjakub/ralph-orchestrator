import React, { useState, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import { StatusPanel } from "./StatusPanel.js";
import { QueuePanel } from "./QueuePanel.js";
import { HistoryPanel } from "./HistoryPanel.js";
import type { OrchestratorState } from "../orchestrator.js";
import type { Orchestrator } from "../orchestrator.js";

interface AppProps {
  orchestrator: Orchestrator;
}

export function App({ orchestrator }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<OrchestratorState>(
    orchestrator.getState()
  );

  useEffect(() => {
    orchestrator.onStateChange(setState);

    // Also refresh every second for the elapsed timer
    const timer = setInterval(() => {
      setState(orchestrator.getState());
    }, 1000);

    return () => clearInterval(timer);
  }, [orchestrator]);

  // Handle Ctrl+C
  useEffect(() => {
    const handler = () => {
      orchestrator.stop();
      setTimeout(() => exit(), 1000);
    };

    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);

    return () => {
      process.removeListener("SIGINT", handler);
      process.removeListener("SIGTERM", handler);
    };
  }, [orchestrator, exit]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="blue">
        🤖 Ralph Orchestrator
      </Text>

      <StatusPanel state={state} />
      <QueuePanel state={state} />
      <HistoryPanel completed={state.completedToday} />

      <Box marginTop={1}>
        <Text dimColor>
          Logs: ./output/logs/    Ctrl+C to stop
        </Text>
      </Box>
    </Box>
  );
}
