/** Largest POST body the tool-filter proxy buffers to inspect (the MCP SDK's `DEFAULT_MAX_REQUEST_BODY_SIZE`). */
export const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Largest single message the gateway holds in memory on the way back to an agent: a JSON response it
 * filters, one SSE event it filters, or one line from a stdio server.
 */
export const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

/** Concurrent agent connections each tool-filter proxy accepts; more are dropped. */
export const MAX_CONNECTIONS = 128;
