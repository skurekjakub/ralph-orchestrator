import React from "react";
import { Box, Text } from "ink";
import type { CompletedTask } from "../orchestrator.js";

interface HistoryPanelProps {
  completed: CompletedTask[];
}

export function HistoryPanel({ completed }: HistoryPanelProps): React.ReactElement {
  const statusIcon = (status: CompletedTask["status"]): string => {
    switch (status) {
      case "completed":
        return "✅";
      case "partial":
        return "⚠️";
      case "blocked":
        return "🚫";
      case "error":
        return "❌";
    }
  };

  const formatDuration = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>
        Completed today: {completed.length}
      </Text>
      {completed.length === 0 ? (
        <Text dimColor>  (none yet)</Text>
      ) : (
        [...completed].reverse().slice(0, 5).map((task) => (
          <Box key={task.key}>
            <Text>
              {"  "}
              {statusIcon(task.status)} {task.key} — {task.summary} (
              {formatDuration(task.durationMs)})
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}
