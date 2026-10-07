import type { Logger } from "./logger";

/** Lifecycle state of a server process. */
export enum ServerStatus {
  Starting = "starting",
  Running = "running",
  /** Exited unexpectedly; a restart is scheduled. */
  Crashed = "crashed",
  /** Exited unexpectedly with no restarts left. */
  Failed = "failed",
  /** Stopped for good because it is unsafe to serve; `lastError` says why. */
  Refused = "refused",
  Stopped = "stopped",
}

/** What a launched server instance reports back to its {@link ManagedServer}. */
export interface InstanceObserver {
  /** The instance is ready to serve. */
  running(): void;
  /** The instance ended, or never started; `description` says how. Reported at most once. */
  exited(description: string): void;
  /** Output the instance wrote to stderr. */
  stderr(text: string): void;
}

/** One launched instance of a server process. */
export interface ServerInstance {
  /** Ask the process to end (SIGTERM, or closing its stdin first for a stdio server). */
  stop(): void;
  /** SIGKILL a process that ignored {@link stop}. */
  forceKill(): void;
}

/** Starts instances of one server; {@link ManagedServer} decides when. */
export interface ServerLauncher {
  /** What gets launched, for the log (`<command> <args>` and where it serves). */
  readonly description: string;
  /** Start one instance. Failures are reported through `observer.exited`, never thrown. */
  launch(observer: InstanceObserver): ServerInstance;
}

/** Construction options for {@link ManagedServer}. */
export interface ManagedServerOptions {
  name: string;
  launcher: ServerLauncher;
  logger: Logger;
  /** Called each time a (re)started instance is running. */
  onRunning?: () => void;
  /** Called after every status change. */
  onStatusChange?: (status: ServerStatus) => void;
  maxRestarts?: number;
  restartDelayMs?: number;
}

const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_RESTART_DELAY_MS = 1000;

/**
 * One MCP server: launches it, records its stderr as `lastError`, and restarts it (up to
 * `maxRestarts`, after `restartDelayMs`) when it exits unexpectedly.
 */
export class ManagedServer {
  status: ServerStatus = ServerStatus.Starting;
  restarts = 0;
  lastError: string | null = null;

  private instance: ServerInstance | null = null;
  private readonly maxRestarts: number;
  private readonly restartDelayMs: number;

  constructor(private readonly options: ManagedServerOptions) {
    this.maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
    this.restartDelayMs = options.restartDelayMs ?? DEFAULT_RESTART_DELAY_MS;
  }

  /** Launch an instance. Launch failures and exits are handled by the restart policy, never thrown. */
  start(): void {
    const { name, launcher, logger } = this.options;
    this.setStatus(ServerStatus.Starting);
    logger.info(`[gateway] Starting ${name}: ${launcher.description}`);

    let current = true;
    const instance = launcher.launch({
      running: () => {
        if (!current || this.status !== ServerStatus.Starting) return;
        this.setStatus(ServerStatus.Running);
        this.options.onRunning?.();
      },
      exited: (description) => {
        if (!current) return;
        current = false;
        this.instance = null;
        if (this.isFinal()) return;
        logger.error(`[gateway] ${name} ${description} (lastError=${this.lastError ?? "none"})`);
        this.handleExit();
      },
      stderr: (text) => {
        if (!current) return;
        logger.error(`[${name}] ${text}`);
        this.lastError = text;
      },
    });
    if (current) this.instance = instance;
  }

  /** Stop the instance and do not restart it. */
  stop(): void {
    this.setStatus(ServerStatus.Stopped);
    this.terminate();
  }

  /** Stop the instance for good because serving it is unsafe, recording `reason` as its last error. */
  refuse(reason: string): void {
    this.lastError = reason;
    this.setStatus(ServerStatus.Refused);
    this.terminate();
  }

  /** SIGKILL an instance that survived {@link stop}. */
  forceKill(): void {
    this.instance?.forceKill();
  }

  private terminate(): void {
    if (!this.instance) return;
    this.options.logger.info(`[gateway] Stopping ${this.options.name}`);
    this.instance.stop();
  }

  /** Whether the server was stopped on purpose, so an exit must not restart it. */
  private isFinal(): boolean {
    return this.status === ServerStatus.Stopped || this.status === ServerStatus.Refused;
  }

  private handleExit(): void {
    const { name, logger } = this.options;
    if (this.restarts >= this.maxRestarts) {
      logger.error(`[gateway] ${name} exceeded max restarts (${this.maxRestarts}), giving up`);
      this.setStatus(ServerStatus.Failed);
      return;
    }
    this.restarts++;
    this.setStatus(ServerStatus.Crashed);
    logger.info(
      `[gateway] Restarting ${name} in ${this.restartDelayMs}ms (attempt ${this.restarts}/${this.maxRestarts})`,
    );
    setTimeout(() => {
      if (!this.isFinal()) this.start();
    }, this.restartDelayMs);
  }

  private setStatus(status: ServerStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
