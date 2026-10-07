import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { HEALTH_PORT, type ResolvedGatewayConfig, type ResolvedServerConfig } from "./gateway-config";
import { isServerReady, startHealthServer, toolFilterWarnings, type HealthReport, type ServerHealth } from "./health";
import type { Logger } from "./logger";
import { ManagedServer, ServerStatus, type ListenAddress, type ManagedServerOptions } from "./managed-server";
import { ToolFilterProxy } from "./tool-filter-proxy";
import { ToolAllowlist } from "./tool-policy";
import { DriftStatus, ExposureStatus, UpstreamMonitor, type UpstreamMonitorOptions } from "./upstream-monitor";

/** Interface servers bind when the agent connects to them directly. */
const PUBLIC_HOST = "0.0.0.0";
/** Interface a filtered server binds, so only the proxy in the same container can reach it. */
const LOOPBACK_HOST = "127.0.0.1";

/** Construction options for {@link SidecarGateway}. */
export interface SidecarGatewayOptions {
  config: ResolvedGatewayConfig;
  logger: Logger;
  /** Defaults to `0.0.0.0:9000`. */
  healthListen?: ListenAddress;
  processOptions?: Pick<ManagedServerOptions, "maxRestarts" | "restartDelayMs" | "startupGraceMs">;
  monitorOptions?: Pick<UpstreamMonitorOptions, "maxAttempts" | "retryDelayMs" | "timeoutMs" | "sleep">;
}

/** Events a {@link SidecarGateway} emits. */
export enum GatewayEvent {
  /** A server's status or tool-filter state changed, so {@link SidecarGateway.healthReport} may differ. */
  Changed = "changed",
}

interface ToolFilter {
  proxy: ToolFilterProxy;
  monitor: UpstreamMonitor;
  allowlist: ToolAllowlist;
  upstreamPort: number;
  /** Why the proxy could not start; the server then counts as crashed and is not launched. */
  startError: string | null;
}

interface GatewayEntry {
  config: ResolvedServerConfig;
  managed: ManagedServer;
  filter: ToolFilter | null;
}

/**
 * The sidecar's MCP gateway: runs every configured server, fronts servers that have an `allowedTools`
 * list with a {@link ToolFilterProxy} on their agent-facing port (the server itself then listens on
 * loopback at its upstream port), and serves the health endpoint.
 *
 * It fails closed: a filtered server counts as ready only once its upstream port is verified
 * loopback-only, and a server found reachable off loopback is stopped and refused for good.
 */
export class SidecarGateway extends EventEmitter<{ [GatewayEvent.Changed]: [] }> {
  private readonly entries: GatewayEntry[];
  private healthServer: Server | null = null;

  constructor(private readonly options: SidecarGatewayOptions) {
    super();
    this.entries = options.config.servers.map((config) => this.createEntry(config));
  }

  /**
   * Start proxies, server processes and the health endpoint.
   *
   * @throws If the health endpoint cannot listen. A proxy that cannot listen marks its server crashed instead.
   */
  async start(): Promise<void> {
    const { logger } = this.options;
    if (this.entries.length === 0) {
      logger.info("[gateway] No servers configured, running health endpoint only");
    } else {
      logger.info(`[gateway] Starting ${this.entries.length} MCP server(s)`);
    }

    for (const entry of this.entries) {
      if (entry.filter) {
        try {
          await entry.filter.proxy.start();
        } catch (err) {
          entry.filter.startError = `tool-filter proxy failed to listen on port ${entry.config.port}: ${err instanceof Error ? err.message : String(err)}`;
          logger.error(`[gateway] ${entry.config.name}: ${entry.filter.startError}`);
          this.emit(GatewayEvent.Changed);
          continue;
        }
      }
      entry.managed.start();
    }

    this.healthServer = await startHealthServer(
      this.options.healthListen ?? { host: PUBLIC_HOST, port: HEALTH_PORT },
      () => this.healthReport(),
      logger,
    );
  }

  /** Stop all server processes (SIGTERM), checks, proxies and the health endpoint. */
  async stop(): Promise<void> {
    for (const entry of this.entries) {
      entry.managed.stop();
      entry.filter?.monitor.cancel();
    }
    await Promise.all(this.entries.map((entry) => entry.filter?.proxy.stop()));
    const health = this.healthServer;
    this.healthServer = null;
    if (health) {
      await new Promise<void>((resolve) => health.close(() => resolve()));
    }
  }

  /** SIGKILL server processes that survived {@link stop}. */
  forceKill(): void {
    for (const entry of this.entries) entry.managed.forceKill();
  }

  /** Current health of every server, including tool-filter state. */
  healthReport(): HealthReport {
    const servers: Record<string, ServerHealth> = {};
    const warnings: string[] = [];
    for (const { config, managed, filter } of this.entries) {
      const health: ServerHealth = {
        status: filter?.startError ? ServerStatus.Crashed : managed.status,
        port: config.port,
        restarts: managed.restarts,
        lastError: filter?.startError ?? managed.lastError,
      };
      if (filter) {
        health.toolFilter = {
          upstreamPort: filter.upstreamPort,
          allowedTools: filter.allowlist.toArray(),
          deniedCalls: filter.proxy.deniedCalls,
          drift: filter.monitor.drift,
          exposure: filter.monitor.exposure,
        };
        warnings.push(...toolFilterWarnings(config.name, health.toolFilter));
      }
      servers[config.name] = health;
    }
    const healthy = Object.values(servers).every(isServerReady);
    return { healthy, servers, warnings };
  }

  private createEntry(config: ResolvedServerConfig): GatewayEntry {
    const { logger, processOptions, monitorOptions } = this.options;
    const onStatusChange = (): void => void this.emit(GatewayEvent.Changed);
    if (config.upstreamPort === null || config.allowedTools === undefined) {
      return {
        config,
        managed: new ManagedServer({
          ...processOptions,
          config,
          listen: { host: PUBLIC_HOST, port: config.port },
          logger,
          onStatusChange,
        }),
        filter: null,
      };
    }

    const upstream: ListenAddress = { host: LOOPBACK_HOST, port: config.upstreamPort };
    const allowlist = new ToolAllowlist(config.allowedTools);
    const monitor = new UpstreamMonitor({ ...monitorOptions, serverName: config.name, upstream, allowlist, logger });
    const proxy = new ToolFilterProxy({
      serverName: config.name,
      listen: { host: PUBLIC_HOST, port: config.port },
      upstream,
      allowlist,
      logger,
    });
    const filter: ToolFilter = { proxy, monitor, allowlist, upstreamPort: config.upstreamPort, startError: null };
    const entry: GatewayEntry = {
      config,
      managed: new ManagedServer({
        ...processOptions,
        config,
        listen: upstream,
        logger,
        onStatusChange,
        onRunning: () => void this.verify(entry, filter),
      }),
      filter,
    };
    return entry;
  }

  /** Check a freshly (re)started filtered server and refuse it when its upstream is reachable off loopback. */
  private async verify(entry: GatewayEntry, filter: ToolFilter): Promise<void> {
    const round = filter.monitor.check();
    this.emit(GatewayEvent.Changed);
    await round;
    const { drift, exposure } = filter.monitor;
    if (exposure.status === ExposureStatus.Exposed) {
      const unreachable =
        drift.status === DriftStatus.Error ? `, and it does not answer MCP on 127.0.0.1: ${drift.error}` : "";
      const reason =
        `refusing to serve ${entry.config.name}: its upstream port ${filter.upstreamPort} accepts connections on ` +
        `${exposure.addresses.join(", ")}${unreachable}, so agents could bypass the tool allowlist; ` +
        `the server must bind only the --host address ${LOOPBACK_HOST}`;
      this.options.logger.error(`[guard] ${entry.config.name}: ${reason}`);
      filter.proxy.refuse(reason);
      entry.managed.refuse(reason);
    }
    this.emit(GatewayEvent.Changed);
  }
}
