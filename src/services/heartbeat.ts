/**
 * Heartbeat sender — pushes orchestrator status to the Ralph status dashboard
 * at a regular interval. Fires and forgets; failures are logged and retried
 * on the next interval, never blocking the main loop.
 */

import type { Logger } from "../logger.js";
import { toErrorMessage } from "../util/error.js";

/** Heartbeat lifecycle status sent to the dashboard. */
export enum HeartbeatStatus {
  Idle = "idle",
  Working = "working",
  Building = "building",
  Polling = "polling",
  Stopped = "stopped",
}

/** Payload sent to the dashboard `/api/heartbeat` endpoint. */
export interface HeartbeatPayload {
  /** Unique agent ID — UUID generated fresh on every orchestrator startup. */
  agentId: string;
  status: HeartbeatStatus;
  queueSize: number;
  currentTask: string | null;
  currentTaskStartedAt: string | null;
  profileId: string | null;
  totalProcessed: number;
  lastCompletedTask: string | null;
  lastCompletedAt: string | null;
}

/** Callback the orchestrator registers to supply the latest state snapshot. */
export type HeartbeatStateProvider = () => HeartbeatPayload;

/** Public contract for the dashboard heartbeat sender. */
export interface IHeartbeatSender {
  /** Start sending heartbeats on an interval. */
  start(stateProvider: HeartbeatStateProvider): void;
  /** Stop the heartbeat loop. */
  stop(): void;
}

export class HeartbeatSender implements IHeartbeatSender {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastError: string | null = null;

  /**
   * @param dashboardUrl  Base URL of the Ralph dashboard (e.g. `https://ralph-dashboard.vercel.app`)
   * @param secret        Bearer token shared with the dashboard
   * @param intervalMs    How often to send heartbeats (default: 30 000 ms)
   * @param logger        Logger for warnings/errors
   */
  constructor(
    private dashboardUrl: string,
    private secret: string,
    private intervalMs: number = 30_000,
    private logger?: Logger,
  ) {}

  /** Start sending heartbeats on an interval. */
  start(stateProvider: HeartbeatStateProvider): void {
    if (this.timer) return;

    // Send one immediately
    void this.send(stateProvider());

    this.timer = setInterval(() => {
      void this.send(stateProvider());
    }, this.intervalMs);
  }

  /** Stop the heartbeat loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Send a single heartbeat. Fire-and-forget; errors are logged. */
  private async send(payload: HeartbeatPayload): Promise<void> {
    const url = `${this.dashboardUrl.replace(/\/$/, "")}/api/heartbeat`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      // Clear last error on success
      if (this.lastError) {
        this.logger?.info?.("Dashboard heartbeat restored");
        this.lastError = null;
      }
    } catch (err) {
      const msg = toErrorMessage(err);
      // Only log once per distinct error to avoid flooding the activity log
      if (msg !== this.lastError) {
        this.lastError = msg;
        this.logger?.warn?.(`Dashboard heartbeat failed: ${msg}`);
      }
    }
  }
}
