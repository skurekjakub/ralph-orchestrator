import React from "react";
import { Box, Text } from "ink";
import type { OrchestratorState } from "../orchestrator.js";

interface StatusPanelProps {
  state: OrchestratorState;
}

export function StatusPanel({ state }: StatusPanelProps): React.ReactElement {
  const statusColor =
    state.status === "working"
      ? "yellow"
      : state.status === "idle"
        ? "green"
        : "red";

  const statusLabel =
    state.status === "working"
      ? "WORKING"
      : state.status === "idle"
        ? "IDLE — waiting for tasks"
        : "STOPPING";

  const elapsed = state.startedAt
    ? Math.floor((Date.now() - state.startedAt) / 1000)
    : 0;
  const elapsedStr = elapsed
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : "";

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Status: </Text>
        <Text color={statusColor} bold>
          {statusLabel}
        </Text>
      </Box>

      {state.currentIssue && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text bold>Current: </Text>
            <Text color="cyan">
              {state.currentIssue.key}
            </Text>
            <Text> — {state.currentIssue.summary}</Text>
          </Box>
          {elapsedStr && (
            <Box>
              <Text bold>Elapsed: </Text>
              <Text>{elapsedStr}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
