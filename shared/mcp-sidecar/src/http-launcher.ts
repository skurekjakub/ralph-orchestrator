import { spawn } from "node:child_process";
import type { ServerConfig } from "./gateway-config";
import type { ListenAddress } from "./http-listen";
import type { Logger } from "./logger";
import type { InstanceObserver, ServerInstance, ServerLauncher } from "./managed-server";

/** Executable and argv used to start a server process. */
export interface LaunchCommand {
  command: string;
  args: string[];
}

/** Construction options for {@link HttpServerLauncher}. */
export interface HttpServerLauncherOptions {
  config: ServerConfig;
  listen: ListenAddress;
  logger: Logger;
  /** A process that stays alive this long without a startup line on stdout is considered running. */
  startupGraceMs?: number;
}

const DEFAULT_STARTUP_GRACE_MS = 2000;
const STARTUP_MARKERS = ["listening", "started", "ready"];

/** The launch contract of a custom server: its own command plus `--transport http --host <host> --port <port>`. */
export function buildLaunchCommand(config: ServerConfig, listen: ListenAddress): LaunchCommand {
  return {
    command: config.command,
    args: [...config.args, "--transport", "http", "--host", listen.host, "--port", String(listen.port)],
  };
}

/**
 * Launches a custom server that serves Streamable HTTP itself on `listen`. An instance counts as
 * running once it prints a startup line (`listening`, `started` or `ready`) or survives the grace period.
 */
export class HttpServerLauncher implements ServerLauncher {
  readonly description: string;
  private readonly command: LaunchCommand;
  private readonly startupGraceMs: number;

  constructor(private readonly options: HttpServerLauncherOptions) {
    this.command = buildLaunchCommand(options.config, options.listen);
    this.startupGraceMs = options.startupGraceMs ?? DEFAULT_STARTUP_GRACE_MS;
    this.description = `${this.command.command} ${this.command.args.join(" ")} (HTTP on ${options.listen.host}:${options.listen.port})`;
  }

  launch(observer: InstanceObserver): ServerInstance {
    const { config, logger } = this.options;
    const child = spawn(this.command.command, this.command.args, {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (!text) return;
      logger.info(`[${config.name}] ${text}`);
      if (STARTUP_MARKERS.some((marker) => text.includes(marker))) observer.running();
    });
    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) observer.stderr(text);
    });
    let ended = false;
    const exit = (description: string): void => {
      if (ended) return;
      ended = true;
      observer.exited(description);
    };
    child.on("spawn", () => logger.info(`[gateway] ${config.name} spawned (pid=${child.pid})`));
    child.on("error", (err) => exit(`failed to spawn: ${err.message}`));
    // 'close' fires after stdio is flushed, so the final stderr output is recorded before the exit is reported.
    child.on("close", (code, signal) => exit(`exited (pid=${child.pid}, code=${code}, signal=${signal})`));

    const grace = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) observer.running();
    }, this.startupGraceMs);
    grace.unref();
    child.once("close", () => clearTimeout(grace));

    return {
      stop: () => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      },
      forceKill: () => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      },
    };
  }
}
