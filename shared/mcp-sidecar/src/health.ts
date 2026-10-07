import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Logger } from "./logger";
import { ServerStatus, type ListenAddress } from "./managed-server";
import { DriftStatus, ExposureStatus, type DriftReport, type ExposureReport } from "./upstream-monitor";

/** Tool-filter state of a server that has an allowlist. */
export interface ToolFilterHealth {
  upstreamPort: number;
  allowedTools: string[];
  /** `tools/call` messages the proxy refused since start. */
  deniedCalls: number;
  drift: DriftReport;
  exposure: ExposureReport;
}

/** Health of one MCP server. */
export interface ServerHealth {
  status: ServerStatus;
  port: number;
  restarts: number;
  lastError: string | null;
  /** Present only for servers fronted by the tool-filter proxy. */
  toolFilter?: ToolFilterHealth;
}

/** Body of `GET /health`. */
export interface HealthReport {
  /**
   * True when every server {@link isServerReady | is ready}; drives the HTTP status (200 or 503) and
   * the compose healthcheck, so the agent container does not start until it holds.
   */
  healthy: boolean;
  servers: Record<string, ServerHealth>;
  /** Tool-filter findings that need an operator (allowlist drift, unlistable tools, bypassable upstream ports). */
  warnings: string[];
}

/**
 * Whether a server may be offered to the agent: it is running and, when it has a tool filter, its
 * tools were listed through loopback and its upstream port was verified unreachable off loopback.
 * Unverified (pending) checks count as not ready, so the gateway fails closed.
 */
export function isServerReady(server: ServerHealth): boolean {
  if (server.status !== ServerStatus.Running) return false;
  if (!server.toolFilter) return true;
  const { drift, exposure } = server.toolFilter;
  const listed = drift.status === DriftStatus.Ok || drift.status === DriftStatus.Drift;
  return listed && exposure.status === ExposureStatus.LoopbackOnly;
}

/** Human-readable warnings for a server's tool-filter state; empty when there is nothing to fix. */
export function toolFilterWarnings(serverName: string, filter: ToolFilterHealth): string[] {
  const warnings: string[] = [];
  if (filter.drift.status === DriftStatus.Drift) {
    warnings.push(
      `${serverName}: allowlisted tools not exposed by the server: ${filter.drift.missingTools.join(", ")}`,
    );
  }
  if (filter.drift.status === DriftStatus.Error) {
    warnings.push(`${serverName}: could not list the server's tools: ${filter.drift.error}`);
  }
  if (filter.exposure.status === ExposureStatus.Exposed) {
    warnings.push(
      `${serverName}: upstream port ${filter.upstreamPort} is reachable on ${filter.exposure.addresses.join(", ")}; the tool allowlist can be bypassed`,
    );
  }
  return warnings;
}

/**
 * Serve `GET /health` with the current report: HTTP 200 when healthy, 503 otherwise. Other paths get 404.
 *
 * @throws If the listen address is unavailable.
 */
export async function startHealthServer(
  listen: ListenAddress,
  report: () => HealthReport,
  logger: Logger,
): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      const body = report();
      res.writeHead(body.healthy ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listen.port, listen.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  logger.info(`[gateway] Health endpoint listening on port ${(server.address() as AddressInfo).port}`);
  return server;
}
