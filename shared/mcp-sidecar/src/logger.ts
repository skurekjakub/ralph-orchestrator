/**
 * Leveled logger for the sidecar. Its stdout/stderr is collected by the orchestrator
 * (`docker compose logs`) into the per-task `*-sidecar.log`, so every line carries a UTC timestamp.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Writes timestamped lines to stdout (info) and stderr (warn, error). */
export const consoleLogger: Logger = {
  info: (message) => console.log(`${new Date().toISOString()} ${message}`),
  warn: (message) => console.error(`${new Date().toISOString()} ${message}`),
  error: (message) => console.error(`${new Date().toISOString()} ${message}`),
};
