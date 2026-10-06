import type { Logger } from "../../src/logger.js";

/** A {@link Logger} that keeps every line for assertions instead of printing it. */
export interface RecordingLogger extends Logger {
  lines: { level: "info" | "warn" | "error"; message: string }[];
  /** Messages logged at `level`. */
  messages(level: "info" | "warn" | "error"): string[];
}

export function createRecordingLogger(): RecordingLogger {
  const lines: RecordingLogger["lines"] = [];
  return {
    lines,
    info: (message) => lines.push({ level: "info", message }),
    warn: (message) => lines.push({ level: "warn", message }),
    error: (message) => lines.push({ level: "error", message }),
    messages: (level) => lines.filter((line) => line.level === level).map((line) => line.message),
  };
}
