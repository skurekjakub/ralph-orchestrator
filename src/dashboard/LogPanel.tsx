import React from "react";
import { Box, Text } from "ink";
import type { LogEntry } from "../orchestrator.js";

interface LogPanelProps {
  logs: readonly LogEntry[];
  maxLines?: number;
}

export function LogPanel({ logs, maxLines = 15 }: LogPanelProps): React.ReactElement {
  const visible = logs.slice(-maxLines);

  const levelColor = (level: LogEntry["level"]): string => {
    switch (level) {
      case "info":
        return "white";
      case "warn":
        return "yellow";
      case "error":
        return "red";
    }
  };

  const levelIcon = (level: LogEntry["level"]): string => {
    switch (level) {
      case "info":
        return "·";
      case "warn":
        return "⚠";
      case "error":
        return "✗";
    }
  };

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      height={maxLines + 2}
    >
      <Text bold>Activity Log</Text>
      {visible.length === 0 ? (
        <Text dimColor>  Waiting for activity...</Text>
      ) : (
        visible.map((entry, i) => (
          <Box key={i}>
            <Text dimColor>{formatTime(entry.timestamp)} </Text>
            <Text color={levelColor(entry.level)}>
              {levelIcon(entry.level)} {entry.message}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}
