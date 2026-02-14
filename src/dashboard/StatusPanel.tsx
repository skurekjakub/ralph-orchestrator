import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { OrchestratorState } from "../orchestrator.js";

interface StatusPanelProps {
  state: OrchestratorState;
}

/** Braille spinner frames for the WORKING state animation. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Displays current status, active issue, and elapsed time with an animated spinner. */
export function StatusPanel({ state }: StatusPanelProps): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (state.status !== "working") return;
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, [state.status]);

  const statusColor =
    state.status === "working"
      ? "yellow"
      : state.status === "idle"
        ? "green"
        : "red";

  const statusLabel =
    state.status === "working"
      ? `${SPINNER_FRAMES[frame]} WORKING`
      : state.status === "idle"
        ? "● IDLE"
        : "■ STOPPING";

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
          {state.currentProfile && (
            <Box>
              <Text bold>Profile: </Text>
              <Text color="magenta">{state.currentProfile}</Text>
            </Box>
          )}
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
