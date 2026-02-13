/**
 * Simple logger interface used by all components.
 *
 * The Orchestrator supplies an implementation that routes messages to both
 * the Ink dashboard ring buffer and the persistent activity JSONL file.
 * The {@link consoleLogger} fallback is used in tests and standalone scripts.
 */
export interface Logger {
  /** Log an informational message. */
  info(message: string): void;
  /** Log a warning. */
  warn(message: string): void;
  /** Log an error. */
  error(message: string): void;
}

/** Fallback logger that writes to stdout/stderr (used in tests and standalone scripts). */
export const consoleLogger: Logger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};
