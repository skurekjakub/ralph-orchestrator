import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  isInitializeRequest,
  isJSONRPCNotification,
  isJSONRPCRequest,
  LATEST_PROTOCOL_VERSION,
  ProtocolErrorCode,
  SUPPORTED_PROTOCOL_VERSIONS,
  type JSONRPCMessage,
  type JSONRPCNotification,
  type JSONRPCRequest,
  type RequestId,
} from "@modelcontextprotocol/client";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { Logger } from "./logger";
import type { StdioUpstream } from "./stdio-upstream";
import { McpHttpMethod, sendJson, type AcceptedRequest, type ProxyUpstream } from "./tool-filter-proxy";
import {
  denialFor,
  errorPayload,
  filterListToolsResponse,
  requestIdKey,
  type JsonRpcErrorPayload,
  type ToolAllowlist,
} from "./tool-policy";

/** Construction options for {@link StdioBridge}. */
export interface StdioBridgeOptions {
  serverName: string;
  upstream: StdioUpstream;
  allowlist: ToolAllowlist;
  logger: Logger;
  /** Open agent sessions kept at most; opening one more closes the least recently used. */
  maxSessions?: number;
}

/** One agent session: its Streamable HTTP transport and its requests the server has not answered yet. */
interface BridgeSession {
  transport: NodeStreamableHTTPServerTransport;
  inFlight: Map<string, AbortController>;
}

const DEFAULT_MAX_SESSIONS = 64;
const SESSION_REQUIRED = "Bad Request: Mcp-Session-Id header is required";
const SESSION_NOT_FOUND = -32001;

/**
 * Serves a {@link StdioUpstream} over Streamable HTTP behind the tool-filter proxy, in the gateway
 * process and without a listener of its own.
 *
 * Each agent session gets its own SDK transport (stateful, with a session id), while every session
 * shares the upstream's one stdio connection. The bridge answers `initialize` from the upstream's
 * handshake, relays requests and their progress notifications, turns `notifications/cancelled` and
 * dropped connections into cancellations at the server, broadcasts the server's other notifications
 * to every session's GET stream, and filters `tools/list` results to the allowlist.
 */
export class StdioBridge implements ProxyUpstream {
  readonly description: string;
  private readonly sessions = new Map<string, BridgeSession>();
  private readonly maxSessions: number;
  private readonly stopListening: () => void;

  constructor(private readonly options: StdioBridgeOptions) {
    this.description = options.upstream.description;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.stopListening = options.upstream.onNotification((notification) => this.broadcast(notification));
  }

  async forward(req: IncomingMessage, res: ServerResponse, accepted: AcceptedRequest): Promise<void> {
    const { method, sessionId, body } = accepted;
    if (sessionId === undefined) {
      if (method === McpHttpMethod.Post && body && containsInitialize(body.parsed)) {
        await this.openSession(req, res, body.parsed);
        return;
      }
      req.resume();
      sendJson(res, 400, errorPayload(null, ProtocolErrorCode.InvalidRequest, SESSION_REQUIRED));
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      req.resume();
      sendJson(res, 404, errorPayload(null, SESSION_NOT_FOUND, "Session not found"));
      return;
    }
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, session);
    if (body) this.cancelOnDisconnect(session, res, requestIds(body.parsed));
    await session.transport.handleRequest(req, res, body?.parsed);
  }

  async close(): Promise<void> {
    this.stopListening();
    await Promise.all([...this.sessions.values()].map((session) => session.transport.close()));
  }

  private async openSession(req: IncomingMessage, res: ServerResponse, parsed: unknown): Promise<void> {
    const { serverName, upstream, logger } = this.options;
    if (!upstream.handshake) {
      sendJson(
        res,
        503,
        errorPayload(null, ProtocolErrorCode.InternalError, `MCP server ${serverName} is not running`),
      );
      return;
    }
    for (const [oldestId, oldest] of this.sessions) {
      if (this.sessions.size < this.maxSessions) break;
      logger.info(
        `[bridge] ${serverName}: closing least recently used session ${oldestId} (limit ${this.maxSessions})`,
      );
      await oldest.transport.close();
    }

    const session: BridgeSession = {
      transport: new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          this.sessions.set(id, session);
        },
      }),
      inFlight: new Map(),
    };
    session.transport.onmessage = (message) => this.receive(session, message);
    session.transport.onclose = () => this.endSession(session);
    await session.transport.start();
    await session.transport.handleRequest(req, res, parsed);
  }

  private endSession(session: BridgeSession): void {
    const id = session.transport.sessionId;
    if (id !== undefined && this.sessions.get(id) === session) this.sessions.delete(id);
    for (const controller of session.inFlight.values()) controller.abort(new Error("session closed"));
    session.inFlight.clear();
  }

  private receive(session: BridgeSession, message: JSONRPCMessage): void {
    if (isJSONRPCRequest(message)) {
      if (message.method === "initialize") this.answerInitialize(session, message);
      else void this.relayRequest(session, message);
    } else if (isJSONRPCNotification(message)) {
      this.relayNotification(session, message);
    }
  }

  private answerInitialize(session: BridgeSession, request: JSONRPCRequest): void {
    const handshake = this.options.upstream.handshake;
    if (!handshake) {
      this.send(
        session,
        errorPayload(
          request.id,
          ProtocolErrorCode.InternalError,
          `MCP server ${this.options.serverName} is not running`,
        ),
      );
      return;
    }
    const requested = request.params?.protocolVersion;
    const protocolVersion =
      typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION;
    this.send(session, { jsonrpc: "2.0", id: request.id, result: { ...handshake.result, protocolVersion } });
  }

  private async relayRequest(session: BridgeSession, request: JSONRPCRequest): Promise<void> {
    const { upstream, allowlist } = this.options;
    const { id, method, params } = request;
    if (method === "tools/call" && !allowlist.allows(params?.name)) {
      this.send(session, denialFor(request));
      return;
    }

    const key = requestIdKey(id);
    const controller = new AbortController();
    session.inFlight.set(key, controller);
    const token = progressTokenOf(params);
    const onProgress =
      token === undefined
        ? undefined
        : (progress: Record<string, unknown>) =>
            this.send(
              session,
              { jsonrpc: "2.0", method: "notifications/progress", params: { ...progress, progressToken: token } },
              id,
            );
    try {
      const reply = await upstream.request(method, params, { signal: controller.signal, onProgress });
      const response = { jsonrpc: "2.0", id, ...reply } as JSONRPCMessage;
      const filtered = method === "tools/list" ? filterListToolsResponse(response, allowlist) : undefined;
      this.send(session, (filtered as JSONRPCMessage | undefined) ?? response);
    } catch {
      // Only cancellation rejects, and a cancelled request gets no response.
    } finally {
      if (session.inFlight.get(key) === controller) session.inFlight.delete(key);
    }
  }

  private relayNotification(session: BridgeSession, notification: JSONRPCNotification): void {
    switch (notification.method) {
      case "notifications/cancelled": {
        const requestId = notification.params?.requestId;
        if (typeof requestId === "string" || typeof requestId === "number") {
          session.inFlight.get(requestIdKey(requestId))?.abort(new Error("cancelled by the client"));
        }
        return;
      }
      // The bridge completed the handshake itself, and it declares no roots capability.
      case "notifications/initialized":
      case "notifications/roots/list_changed":
        return;
      default:
        this.options.upstream.notify(notification.method, notification.params);
    }
  }

  private broadcast(notification: JSONRPCNotification): void {
    for (const session of this.sessions.values()) this.send(session, notification);
  }

  /** Abort the requests of a POST whose client hung up before they were answered. */
  private cancelOnDisconnect(session: BridgeSession, res: ServerResponse, ids: RequestId[]): void {
    if (ids.length === 0) return;
    res.on("close", () => {
      if (res.writableFinished) return;
      for (const id of ids) session.inFlight.get(requestIdKey(id))?.abort(new Error("client disconnected"));
    });
  }

  private send(
    session: BridgeSession,
    message: JSONRPCMessage | JsonRpcErrorPayload,
    relatedRequestId?: RequestId,
  ): void {
    session.transport
      .send(message as JSONRPCMessage, relatedRequestId === undefined ? undefined : { relatedRequestId })
      // A client that has gone away cannot be answered.
      .catch(() => undefined);
  }
}

function messagesOf(parsed: unknown): unknown[] {
  return Array.isArray(parsed) ? parsed : [parsed];
}

function containsInitialize(parsed: unknown): boolean {
  return messagesOf(parsed).some((message) => isInitializeRequest(message));
}

function requestIds(parsed: unknown): RequestId[] {
  return messagesOf(parsed)
    .filter((message): message is JSONRPCRequest => isJSONRPCRequest(message))
    .map((message) => message.id);
}

function progressTokenOf(params: Record<string, unknown> | undefined): string | number | undefined {
  const meta = params?._meta;
  if (typeof meta !== "object" || meta === null) return undefined;
  const token = (meta as Record<string, unknown>).progressToken;
  return typeof token === "string" || typeof token === "number" ? token : undefined;
}
