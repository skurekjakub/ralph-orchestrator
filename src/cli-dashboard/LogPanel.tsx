import React from "react";
import { Box, Text } from "ink";
import { LogLevel, type LogEntry } from "../orchestrator-types.js";

interface LogPanelProps {
  logs: readonly LogEntry[];
  /** Title shown at the top of the panel. Defaults to "Activity Log". */
  title?: string;
  /** Maximum number of recent log lines to display. Defaults to 15. */
  maxLines?: number;
}

/** Scrolling activity log panel with color-coded severity (green/yellow/red). */
export function LogPanel({ logs, title = "Activity Log", maxLines = 15 }: LogPanelProps): React.ReactElement {
  const visible = logs.slice(-maxLines);

  const levelColor = (level: LogEntry["level"]): string => {
    switch (level) {
      case LogLevel.Info:
        return "white";
      case LogLevel.Warn:
        return "yellow";
      case LogLevel.Error:
        return "red";
    }
  };

  const levelIcon = (level: LogEntry["level"]): string => {
    switch (level) {
      case LogLevel.Info:
        return "·";
      case LogLevel.Warn:
        return "⚠";
      case LogLevel.Error:
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
      height={maxLines + 3}
    >
      <Text bold>{title}</Text>
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
