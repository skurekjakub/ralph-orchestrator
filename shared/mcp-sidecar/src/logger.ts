/** Leveled logger for the sidecar gateway. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Writes lines prefixed with a UTC ISO timestamp to stdout (info) and stderr (warn, error). */
export const consoleLogger: Logger = {
  info: (message) => console.log(`${new Date().toISOString()} ${message}`),
  warn: (message) => console.error(`${new Date().toISOString()} ${message}`),
  error: (message) => console.error(`${new Date().toISOString()} ${message}`),
};
