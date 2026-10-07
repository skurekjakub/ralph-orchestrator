import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Logger } from "./logger";
import type { ListenAddress } from "./managed-server";
import { MCP_PATH } from "./tool-filter-proxy";
import type { ToolAllowlist } from "./tool-policy";

/** Whether the allowlist matches the tools the server really exposes. */
export enum DriftStatus {
  /** Not checked yet for the current server process. */
  Pending = "pending",
  Ok = "ok",
  /** At least one allowlisted tool is not exposed by the server. */
  Drift = "drift",
  /** The server's tools could not be listed. */
  Error = "error",
}

/** Whether the server's upstream port is reachable from outside the sidecar. */
export enum ExposureStatus {
  /** Not checked yet, or not checkable because the server could not be reached. */
  Pending = "pending",
  LoopbackOnly = "loopback-only",
  /** The port accepts connections on a non-loopback address, so clients can bypass the proxy. */
  Exposed = "exposed",
}

/** Result of comparing the allowlist with the server's `tools/list`. */
export interface DriftReport {
  status: DriftStatus;
  /** Allowlisted tool names the server does not expose. */
  missingTools: string[];
  upstreamToolCount: number | null;
  checkedAt: string | null;
  error: string | null;
}

/** Result of probing the upstream port on the sidecar's non-loopback addresses. */
export interface ExposureReport {
  status: ExposureStatus;
  /** Non-loopback addresses on which the upstream port accepts connections. */
  addresses: string[];
  checkedAt: string | null;
}

/** Construction options for {@link UpstreamMonitor}. */
export interface UpstreamMonitorOptions {
  serverName: string;
  upstream: ListenAddress;
  allowlist: ToolAllowlist;
  logger: Logger;
  maxAttempts?: number;
  retryDelayMs?: number;
  /** Timeout of each MCP request and TCP probe. */
  timeoutMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_RETRY_DELAY_MS = 3000;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_LIST_PAGES = 100;

/**
 * Checks a filtered server after each (re)start: lists its real tools to detect allowlist drift,
 * then probes whether its upstream port is reachable on a non-loopback address.
 * Findings are logged and kept for the health endpoint.
 */
export class UpstreamMonitor {
  drift: DriftReport = pendingDrift();
  exposure: ExposureReport = pendingExposure();

  private generation = 0;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: UpstreamMonitorOptions) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Run the checks for a freshly started server process, superseding any round still in progress.
   * Never rejects: failures are recorded in {@link drift}.
   */
  async check(): Promise<void> {
    const generation = ++this.generation;
    this.drift = pendingDrift();
    this.exposure = pendingExposure();
    const { serverName, upstream, allowlist, logger } = this.options;
    const url = new URL(`http://${upstream.host}:${upstream.port}${MCP_PATH}`);

    let toolNames: string[] | undefined;
    let lastError = "";
    for (let attempt = 1; attempt <= this.maxAttempts && toolNames === undefined; attempt++) {
      try {
        toolNames = await listUpstreamToolNames(url, this.timeoutMs);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < this.maxAttempts) await delay(this.retryDelayMs, undefined, { ref: false });
      }
      if (generation !== this.generation) return;
    }

    if (toolNames === undefined) {
      this.drift = { ...pendingDrift(), status: DriftStatus.Error, checkedAt: now(), error: lastError };
      logger.warn(
        `[guard] ${serverName}: could not list upstream tools after ${this.maxAttempts} attempts: ${lastError}`,
      );
      return;
    }

    const missingTools = allowlist.missingFrom(toolNames);
    this.drift = {
      status: missingTools.length > 0 ? DriftStatus.Drift : DriftStatus.Ok,
      missingTools,
      upstreamToolCount: toolNames.length,
      checkedAt: now(),
      error: null,
    };
    const allowed = allowlist.toArray().length - missingTools.length;
    logger.info(
      `[proxy] ${serverName}: upstream exposes ${toolNames.length} tool(s); ${allowed} allowlisted, ${toolNames.length - allowed} hidden`,
    );
    if (missingTools.length > 0) {
      logger.warn(
        `[guard] ${serverName}: allowlist drift: ${missingTools.join(", ")} not exposed by the server (fix "tools" in its mcp-server.json)`,
      );
    }

    const addresses = await findExposedAddresses(upstream.port, this.timeoutMs);
    if (generation !== this.generation) return;
    this.exposure = {
      status: addresses.length > 0 ? ExposureStatus.Exposed : ExposureStatus.LoopbackOnly,
      addresses,
      checkedAt: now(),
    };
    if (addresses.length > 0) {
      logger.error(
        `[guard] ${serverName}: upstream port ${upstream.port} accepts connections on ${addresses.join(", ")}; clients can bypass the tool allowlist`,
      );
    }
  }

  /** Abandon any round in progress. */
  cancel(): void {
    this.generation++;
  }
}

/**
 * List every tool name the MCP server at `url` exposes, following pagination.
 *
 * @throws If the server cannot be reached, the handshake or a `tools/list` call fails or times out,
 *   or the listing does not end within {@link MAX_LIST_PAGES} pages.
 */
export async function listUpstreamToolNames(url: URL, timeoutMs: number): Promise<string[]> {
  const client = new Client({ name: "ralph-mcp-sidecar-monitor", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url);
  try {
    await client.connect(transport, { timeout: timeoutMs });
    const names: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const result = await client.listTools(cursor === undefined ? undefined : { cursor }, { timeout: timeoutMs });
      names.push(...result.tools.map((tool) => tool.name));
      cursor = result.nextCursor;
      if (cursor === undefined) return names;
    }
    throw new Error(`tools/list did not finish within ${MAX_LIST_PAGES} pages`);
  } finally {
    // Ending the session is best effort: the listing is already decided, and stateless servers have no session.
    await transport.terminateSession().catch(() => undefined);
    await client.close();
  }
}

/** Non-loopback addresses of this host on which `port` accepts TCP connections. */
export async function findExposedAddresses(port: number, timeoutMs: number): Promise<string[]> {
  const candidates = nonLoopbackAddresses();
  const reachable = await Promise.all(candidates.map((host) => acceptsConnections(host, port, timeoutMs)));
  return candidates.filter((_, index) => reachable[index]);
}

/** This host's non-internal interface addresses, without IPv6 link-local ones (unusable without a zone id). */
export function nonLoopbackAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((infos) => infos ?? [])
    .filter((info) => !info.internal && !(info.family === "IPv6" && info.address.toLowerCase().startsWith("fe80:")))
    .map((info) => info.address);
}

function acceptsConnections(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const settle = (reachable: boolean): void => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

function pendingDrift(): DriftReport {
  return { status: DriftStatus.Pending, missingTools: [], upstreamToolCount: null, checkedAt: null, error: null };
}

function pendingExposure(): ExposureReport {
  return { status: ExposureStatus.Pending, addresses: [], checkedAt: null };
}

function now(): string {
  return new Date().toISOString();
}
