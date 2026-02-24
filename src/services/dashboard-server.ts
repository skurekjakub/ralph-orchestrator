import { WebSocketServer, WebSocket } from "ws";
import { toErrorMessage } from "../util/error.js";
import type { OrchestratorState, LogEntry } from "../orchestrator-types.js";
import type { OrchestratorObserver } from "../orchestrator-observer.js";
import type { Logger } from "../logger.js";

/** Message types sent from the server to dashboard clients. */
export type DashboardMessage =
  | { type: "state"; data: OrchestratorState }
  | { type: "log"; data: LogEntry }
  | { type: "toolOutput"; data: string }
  | { type: "preToolUse"; data: string };

const DEFAULT_PORT = 3100;

/**
 * WebSocket server that streams real-time orchestrator state, container
 * logs, and tool output to the local React dashboard.
 *
 * Historical log browsing is handled by the Vite plugin
 * (`dashboard-local/src/logApiPlugin.ts`) which reads `output/logs/`
 * directly — no orchestrator dependency required.
 */
export class DashboardServer {
  private wss: WebSocketServer | null = null;
  private port: number;

  constructor(
    private observer: OrchestratorObserver,
    private logger: Logger,
    port?: number,
  ) {
    this.port = port ?? DEFAULT_PORT;
  }

  /** Start the WebSocket server and subscribe to observer state updates. */
  start(): void {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on("connection", (ws) => {
      this.send(ws, { type: "state", data: this.observer.getState() });
    });

    this.wss.on("error", (err) => {
      this.logger.warn(
        `Dashboard server error: ${toErrorMessage(err)}`
      );
    });

    this.observer.onStateChange((state) => {
      this.broadcast({ type: "state", data: state });
    });

    this.logger.info(`Dashboard server listening on ws://localhost:${this.port}`);
  }

  /** Forward a single log entry to all clients. */
  pushLog(entry: LogEntry): void {
    this.broadcast({ type: "log", data: entry });
  }

  /** Forward a tool output line to all clients. */
  pushToolOutput(line: string): void {
    this.broadcast({ type: "toolOutput", data: line });
  }

  /** Forward a pre-tool invocation line to all clients. */
  pushPreToolUse(line: string): void {
    this.broadcast({ type: "preToolUse", data: line });
  }

  /** Stop the server and close all connections. */
  stop(): void {
    if (!this.wss) return;
    for (const client of this.wss.clients) client.close();
    this.wss.close();
    this.wss = null;
  }

  private broadcast(message: DashboardMessage): void {
    if (!this.wss) return;
    const json = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  private send(ws: WebSocket, message: DashboardMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}
