import {
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  LATEST_PROTOCOL_VERSION,
  ProtocolErrorCode,
  SUPPORTED_PROTOCOL_VERSIONS,
  type JSONRPCMessage,
  type JSONRPCNotification,
  type JSONRPCRequest,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { ServerConfig } from "./gateway-config";
import { MAX_MESSAGE_BYTES } from "./limits";
import type { Logger } from "./logger";
import type { InstanceObserver, ServerInstance, ServerLauncher } from "./managed-server";

/** The `error` member of a JSON-RPC error response. */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** How the stdio server answered a request: the `result` or `error` member of its response. */
export type UpstreamReply = { result: Record<string, unknown> } | { error: JsonRpcError };

/** Outcome of the `initialize` handshake with a running server. */
export interface UpstreamHandshake {
  /** Protocol version the server agreed to. */
  protocolVersion: string;
  /** The server's whole `initialize` result (capabilities, serverInfo, instructions, ...). */
  result: Record<string, unknown>;
}

/** Per-request options for {@link StdioUpstream.request}. */
export interface UpstreamRequestOptions {
  /**
   * Receives the params of each progress notification the server sends for this request, without
   * the progress token. When set, the request carries a progress token the upstream allocates.
   */
  onProgress?: (params: Record<string, unknown>) => void;
  /** Aborting sends `notifications/cancelled` to the server and rejects with the abort reason. */
  signal?: AbortSignal;
}

/** Construction options for {@link StdioUpstream}. */
export interface StdioUpstreamOptions {
  config: ServerConfig;
  logger: Logger;
  /** How long a new process may take to answer `initialize`. */
  handshakeTimeoutMs?: number;
  /**
   * Longest message the server may write; a longer one ends the connection (and so restarts the
   * server). Defaults to {@link MAX_MESSAGE_BYTES}.
   */
  maxMessageBytes?: number;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 60_000;
const MAX_LIST_PAGES = 100;
const CLIENT_INFO = { name: "ralph-mcp-sidecar", version: "1.0.0" };

/**
 * A stdio MCP server run by the gateway itself. Each launch spawns one process through the SDK's
 * {@link StdioClientTransport} and completes the `initialize` handshake once; every request from
 * every agent session is then sent over that one persistent connection, so server-side state
 * (a browser page, an open repository) survives across calls until the process exits.
 *
 * The upstream speaks for the agents: it allocates its own request ids and progress tokens, answers
 * the server's `ping` requests and refuses its other requests (it declares no client capabilities),
 * and hands every other server notification to {@link onNotification} listeners.
 */
export class StdioUpstream implements ServerLauncher {
  readonly description: string;
  private connection: StdioConnection | null = null;
  private readonly listeners = new Set<(notification: JSONRPCNotification) => void>();

  constructor(private readonly options: StdioUpstreamOptions) {
    const { command, args } = options.config;
    this.description = `${[command, ...args].join(" ")} (stdio, bridged by the gateway)`;
  }

  /** Handshake of the running process; `undefined` while no process is connected. */
  get handshake(): UpstreamHandshake | undefined {
    return this.connection?.handshake;
  }

  launch(observer: InstanceObserver): ServerInstance {
    const { config, logger } = this.options;
    const connection = new StdioConnection({
      config,
      logger,
      maxMessageBytes: this.options.maxMessageBytes ?? MAX_MESSAGE_BYTES,
      onNotification: (notification) => {
        for (const listener of this.listeners) listener(notification);
      },
      onStderr: (text) => observer.stderr(text),
      onEnd: (description) => {
        if (this.connection === connection) this.connection = null;
        observer.exited(description);
      },
    });
    connection.open(this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS).then(
      (handshake) => {
        if (!connection.isOpen()) return;
        this.connection = connection;
        const serverInfo = handshake.result.serverInfo as { name?: unknown; version?: unknown } | undefined;
        logger.info(
          `[bridge] ${config.name}: connected to ${String(serverInfo?.name)} ${String(serverInfo?.version)} (protocol ${handshake.protocolVersion})`,
        );
        observer.running();
      },
      (err: unknown) => connection.fail(`failed to start: ${err instanceof Error ? err.message : String(err)}`),
    );
    return connection;
  }

  /**
   * Send a request to the running process.
   *
   * @returns The server's answer; an `InternalError` reply when no process is running or the
   *   process exits before answering.
   * @throws The abort reason when `options.signal` aborts before the answer arrives.
   */
  request(
    method: string,
    params: Record<string, unknown> | undefined,
    options: UpstreamRequestOptions = {},
  ): Promise<UpstreamReply> {
    const connection = this.connection;
    if (!connection) {
      return Promise.resolve(internalError(`MCP server ${this.options.config.name} is not running`));
    }
    return connection.request(method, params, options);
  }

  /** Send a notification to the running process; dropped when none is running. */
  notify(method: string, params?: Record<string, unknown>): void {
    this.connection?.notify(method, params);
  }

  /**
   * Receive the server's notifications other than progress and cancellation.
   *
   * @returns A function that removes the listener.
   */
  onNotification(listener: (notification: JSONRPCNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * List every tool name the running process exposes, following pagination.
   *
   * @param timeoutMs Timeout of each `tools/list` page request.
   * @throws If no process is running, a page request fails or times out, or the listing does not
   *   end within {@link MAX_LIST_PAGES} pages.
   */
  async listToolNames(timeoutMs: number): Promise<string[]> {
    const names: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const reply = await this.request("tools/list", cursor === undefined ? undefined : { cursor }, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ("error" in reply) throw new Error(`tools/list failed: ${reply.error.message}`);
      const { tools, nextCursor } = reply.result;
      if (!Array.isArray(tools)) throw new Error("tools/list result has no tools array");
      for (const tool of tools) {
        if (isRecord(tool) && typeof tool.name === "string") names.push(tool.name);
      }
      if (typeof nextCursor !== "string") return names;
      cursor = nextCursor;
    }
    throw new Error(`tools/list did not end within ${MAX_LIST_PAGES} pages`);
  }
}

interface StdioConnectionOptions {
  config: ServerConfig;
  logger: Logger;
  maxMessageBytes: number;
  onNotification: (notification: JSONRPCNotification) => void;
  onStderr: (text: string) => void;
  /** Called once when the connection ends, whether the process exited or the handshake failed. */
  onEnd: (description: string) => void;
}

interface PendingRequest {
  settle: (reply: UpstreamReply) => void;
  onProgress?: (params: Record<string, unknown>) => void;
}

/** One spawned process and the JSON-RPC exchange with it. */
class StdioConnection implements ServerInstance {
  handshake: UpstreamHandshake | undefined;
  private readonly transport: StdioClientTransport;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private pid: number | null = null;
  private ended = false;

  constructor(private readonly options: StdioConnectionOptions) {
    const { config, logger, maxMessageBytes } = options;
    this.transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...inheritedEnv(), ...config.env },
      stderr: "pipe",
      maxBufferSize: maxMessageBytes,
    });
    this.transport.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) options.onStderr(text);
    });
    this.transport.onmessage = (message) => this.receive(message);
    this.transport.onerror = (err) => logger.warn(`[bridge] ${config.name}: ${err.message}`);
    this.transport.onclose = () => this.end(`exited (pid=${this.pid})`);
  }

  /** Spawn the process and complete the handshake. */
  async open(handshakeTimeoutMs: number): Promise<UpstreamHandshake> {
    await this.transport.start();
    this.pid = this.transport.pid;
    this.options.logger.info(`[gateway] ${this.options.config.name} spawned (pid=${this.pid})`);
    const reply = await this.request(
      "initialize",
      { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
      { signal: AbortSignal.timeout(handshakeTimeoutMs) },
    );
    if ("error" in reply) throw new Error(`initialize failed: ${reply.error.message}`);
    const { protocolVersion } = reply.result;
    if (typeof protocolVersion !== "string" || !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
      throw new Error(`initialize answered with an unsupported protocol version: ${String(protocolVersion)}`);
    }
    this.notify("notifications/initialized");
    this.handshake = { protocolVersion, result: reply.result };
    return this.handshake;
  }

  isOpen(): boolean {
    return !this.ended;
  }

  /** End the connection because it cannot be used, reporting `description`, and end the process. */
  fail(description: string): void {
    this.end(description);
    void this.transport.close();
  }

  request(
    method: string,
    params: Record<string, unknown> | undefined,
    { onProgress, signal }: UpstreamRequestOptions,
  ): Promise<UpstreamReply> {
    if (this.ended) return Promise.resolve(internalError(`MCP server ${this.options.config.name} is not running`));
    if (signal?.aborted) return Promise.reject(signal.reason);

    const id = this.nextId++;
    return new Promise<UpstreamReply>((resolve, reject) => {
      const onAbort = (): void => {
        if (!this.pending.delete(id)) return;
        this.notify("notifications/cancelled", { requestId: id, reason: String(signal?.reason) });
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, {
        onProgress,
        settle: (reply) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(reply);
        },
      });
      const request: JSONRPCRequest = { jsonrpc: "2.0", id, method };
      const outgoing = withProgressToken(params, onProgress ? id : undefined);
      if (outgoing !== undefined) request.params = outgoing;
      this.transport.send(request).catch((err: unknown) => {
        this.settle(id, internalError(`could not write to MCP server ${this.options.config.name}: ${String(err)}`));
      });
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    if (this.ended) return;
    const notification: JSONRPCNotification = { jsonrpc: "2.0", method, ...(params ? { params } : {}) };
    this.transport.send(notification).catch(() => undefined);
  }

  stop(): void {
    void this.transport.close();
  }

  forceKill(): void {
    if (this.pid === null) return;
    try {
      process.kill(this.pid, "SIGKILL");
    } catch {
      // The process is already gone.
    }
  }

  private receive(message: JSONRPCMessage): void {
    if (isJSONRPCResultResponse(message)) {
      this.answer(message.id, { result: message.result as Record<string, unknown> });
    } else if (isJSONRPCErrorResponse(message)) {
      this.answer(message.id, { error: message.error });
    } else if (isJSONRPCRequest(message)) {
      this.answerServerRequest(message);
    } else if (isJSONRPCNotification(message)) {
      this.dispatchNotification(message);
    }
  }

  private answer(id: unknown, reply: UpstreamReply): void {
    if (typeof id === "number" && this.pending.has(id)) {
      this.settle(id, reply);
      return;
    }
    const detail = "error" in reply ? `: ${reply.error.message}` : "";
    this.options.logger.info(
      `[bridge] ${this.options.config.name}: dropped an answer to request ${JSON.stringify(id)}, which is not pending${detail}`,
    );
  }

  private settle(id: number, reply: UpstreamReply): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    pending.settle(reply);
  }

  private answerServerRequest(request: JSONRPCRequest): void {
    const response: JSONRPCMessage =
      request.method === "ping"
        ? { jsonrpc: "2.0", id: request.id, result: {} }
        : {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: ProtocolErrorCode.MethodNotFound,
              message: `${request.method} is not supported by the MCP sidecar`,
            },
          };
    this.transport.send(response).catch(() => undefined);
  }

  private dispatchNotification(notification: JSONRPCNotification): void {
    if (notification.method === "notifications/progress") {
      const { progressToken, ...progress } = notification.params ?? {};
      if (typeof progressToken === "number") this.pending.get(progressToken)?.onProgress?.(progress);
      return;
    }
    // A server cancels only its own requests, and the upstream answers those at once.
    if (notification.method === "notifications/cancelled") return;
    this.options.onNotification(notification);
  }

  private end(description: string): void {
    if (this.ended) return;
    this.ended = true;
    const exited = internalError(`MCP server ${this.options.config.name} exited before answering`);
    for (const id of [...this.pending.keys()]) this.settle(id, exited);
    this.options.onEnd(description);
  }
}

/** `params` with `_meta.progressToken` set to `token`, or removed when `token` is undefined. */
function withProgressToken(
  params: Record<string, unknown> | undefined,
  token: number | undefined,
): Record<string, unknown> | undefined {
  const meta = isRecord(params?._meta) ? params._meta : undefined;
  if (token === undefined && meta?.progressToken === undefined) return params;
  const { progressToken: _dropped, ...rest } = meta ?? {};
  const nextMeta = token === undefined ? rest : { ...rest, progressToken: token };
  const { _meta: _old, ...others } = params ?? {};
  return Object.keys(nextMeta).length > 0 ? { ...others, _meta: nextMeta } : others;
}

function internalError(message: string): UpstreamReply {
  return { error: { code: ProtocolErrorCode.InternalError, message } };
}

/** The gateway's own environment, which a stdio server inherits like a custom server does. */
function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
