import { spawn, type ChildProcess } from "node:child_process";
import { ServerType, type ServerConfig } from "./gateway-config";
import type { Logger } from "./logger";

/** Lifecycle state of a server process. */
export enum ServerStatus {
  Starting = "starting",
  Running = "running",
  Crashed = "crashed",
  Stopped = "stopped",
}

/** Interface and port a server process must listen on. */
export interface ListenAddress {
  host: string;
  port: number;
}

/** Executable and argv used to start a server process. */
export interface LaunchCommand {
  command: string;
  args: string[];
}

/**
 * Build the command that starts a server listening on `listen`.
 *
 * Custom servers get `--transport http --host <host> --port <port>`. npm (stdio) servers are wrapped
 * in supergateway, which has no bind-address option and always listens on every interface.
 */
export function buildLaunchCommand(config: ServerConfig, listen: ListenAddress): LaunchCommand {
  if (config.type === ServerType.Custom) {
    return {
      command: config.command,
      args: [...config.args, "--transport", "http", "--host", listen.host, "--port", String(listen.port)],
    };
  }
  return {
    command: "supergateway",
    args: [
      "--stdio",
      [config.command, ...config.args].join(" "),
      "--outputTransport",
      "streamableHttp",
      "--port",
      String(listen.port),
    ],
  };
}

/** Construction options for {@link ManagedServer}. */
export interface ManagedServerOptions {
  config: ServerConfig;
  listen: ListenAddress;
  logger: Logger;
  /** Called each time a (re)spawned process is considered running. */
  onRunning?: () => void;
  maxRestarts?: number;
  restartDelayMs?: number;
  /** A process that stays alive this long without a startup log line is considered running. */
  startupGraceMs?: number;
}

const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_RESTART_DELAY_MS = 1000;
const DEFAULT_STARTUP_GRACE_MS = 2000;
const STARTUP_MARKERS = ["listening", "started", "ready"];

/**
 * One MCP server child process: spawns it, relays its output to the log, and restarts it
 * (up to `maxRestarts`) when it exits unexpectedly.
 */
export class ManagedServer {
  status: ServerStatus = ServerStatus.Starting;
  restarts = 0;
  lastError: string | null = null;

  private child: ChildProcess | null = null;
  private readonly maxRestarts: number;
  private readonly restartDelayMs: number;
  private readonly startupGraceMs: number;

  constructor(private readonly options: ManagedServerOptions) {
    this.maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
    this.restartDelayMs = options.restartDelayMs ?? DEFAULT_RESTART_DELAY_MS;
    this.startupGraceMs = options.startupGraceMs ?? DEFAULT_STARTUP_GRACE_MS;
  }

  /** Spawn the process. Spawn failures and exits are handled by the restart policy, never thrown. */
  start(): void {
    const { config, listen, logger } = this.options;
    this.status = ServerStatus.Starting;

    const { command, args } = buildLaunchCommand(config, listen);
    logger.info(
      `[gateway] Starting ${config.name} (${config.type}) on ${listen.host}:${listen.port}: ${command} ${args.join(" ")}`,
    );

    const child = spawn(command, args, {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    logger.info(`[gateway] ${config.name} spawned (pid=${child.pid})`);

    child.stdout?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (!line) return;
      logger.info(`[${config.name}] ${line}`);
      if (STARTUP_MARKERS.some((marker) => line.includes(marker))) this.markRunning(child);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) logger.error(`[${config.name}] ${line}`);
      this.lastError = line;
    });

    child.on("error", (err) => {
      logger.error(`[gateway] Failed to spawn ${config.name}: ${err.message}`);
      this.status = ServerStatus.Crashed;
      this.lastError = err.message;
      this.child = null;
      this.scheduleRestart();
    });

    // 'close' fires after stdio is flushed, so the final stderr line is logged before the crash report.
    child.on("close", (code, signal) => {
      if (this.status === ServerStatus.Stopped || this.child !== child) return;
      logger.error(
        `[gateway] ${config.name} exited (pid=${child.pid}, code=${code}, signal=${signal}, lastError=${this.lastError ?? "none"})`,
      );
      this.status = ServerStatus.Crashed;
      this.child = null;
      this.scheduleRestart();
    });

    setTimeout(() => {
      if (this.status === ServerStatus.Starting && this.child === child && !child.killed) this.markRunning(child);
    }, this.startupGraceMs).unref();
  }

  /** Send SIGTERM and stop restarting. */
  stop(): void {
    this.status = ServerStatus.Stopped;
    if (this.child && !this.child.killed) {
      this.options.logger.info(`[gateway] Stopping ${this.options.config.name}`);
      this.child.kill("SIGTERM");
    }
  }

  /** Send SIGKILL to a process that ignored {@link stop}. */
  forceKill(): void {
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) this.child.kill("SIGKILL");
  }

  private markRunning(child: ChildProcess): void {
    if (this.status !== ServerStatus.Starting || this.child !== child) return;
    this.status = ServerStatus.Running;
    this.options.onRunning?.();
  }

  private scheduleRestart(): void {
    const { config, logger } = this.options;
    if (this.restarts >= this.maxRestarts) {
      logger.error(`[gateway] ${config.name} exceeded max restarts (${this.maxRestarts}), giving up`);
      return;
    }
    this.restarts++;
    logger.info(
      `[gateway] Restarting ${config.name} in ${this.restartDelayMs}ms (attempt ${this.restarts}/${this.maxRestarts})`,
    );
    setTimeout(() => {
      if (this.status !== ServerStatus.Stopped) this.start();
    }, this.restartDelayMs);
  }
}
