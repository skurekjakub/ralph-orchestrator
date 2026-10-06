import React from "react";
import { Box, Text } from "ink";
import type { CompletedTask } from "../orchestrator-types";
import { TaskStatus } from "../container/types";

interface HistoryPanelProps {
  completed: CompletedTask[];
}

/** Shows today’s completed tasks with status icons, duration, and PR links. */
export function HistoryPanel({ completed }: HistoryPanelProps): React.ReactElement {
  const statusIcon = (status: CompletedTask["status"]): string => {
    switch (status) {
      case TaskStatus.Completed:
        return "✅";
      case TaskStatus.Partial:
        return "⚠️";
      case TaskStatus.Blocked:
        return "🚫";
      case TaskStatus.Error:
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
      <Text bold>Completed today: {completed.length}</Text>
      {completed.length === 0 ? (
        <Text dimColor> (none yet)</Text>
      ) : (
        [...completed]
          .reverse()
          .slice(0, 5)
          .map((task, i) => (
            <Box key={`${task.key}-${task.completedAt}-${i}`}>
              <Text>
                {"  "}
                {statusIcon(task.status)} {task.key} — {task.summary} ({formatDuration(task.durationMs)})
                {task.profileId ? ` [${task.profileId}]` : ""}
              </Text>
            </Box>
          ))
      )}
    </Box>
  );
}
