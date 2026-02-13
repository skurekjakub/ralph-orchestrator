import React from "react";
import { Box, Text } from "ink";
import type { OrchestratorState } from "../orchestrator.js";

interface QueuePanelProps {
  state: OrchestratorState;
}

export function QueuePanel({ state }: QueuePanelProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        Queue ({state.queueSize}):
      </Text>
      {state.queueItems.length === 0 ? (
        <Text dimColor>  (empty)</Text>
      ) : (
        state.queueItems.map((item, i) => (
          <Box key={item.key}>
            <Text dimColor>  {i + 1}. </Text>
            <Text color="cyan">{item.key}</Text>
            <Text> — {item.summary}</Text>
          </Box>
        ))
      )}
    </Box>
  );
}
