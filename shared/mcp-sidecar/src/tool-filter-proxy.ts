import {
  Agent,
  createServer,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream";
import { ErrorCode, type RequestId } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "./logger.js";
import type { ListenAddress } from "./managed-server.js";
import { SseEventFilter } from "./sse-filter.js";
import {
  errorPayload,
  filterListToolsResponse,
  inspectInbound,
  responseIdKey,
  type JsonRpcErrorPayload,
  type ToolAllowlist,
} from "./tool-policy.js";

/** Path of the Streamable HTTP endpoint, on both the proxy and the upstream server. */
export const MCP_PATH = "/mcp";

/** The SDK's `MAXIMUM_MESSAGE_SIZE`; the proxy buffers whole POST bodies to inspect them. */
const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_LOGGED_NAME_LENGTH = 200;
const MAX_TRACKED_SESSIONS = 256;
const MAX_TRACKED_IDS_PER_SESSION = 256;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** The proxy re-serialises POST bodies and must read upstream bodies uncompressed. */
const REPLACED_REQUEST_HEADERS = new Set(["host", "content-length", "content-encoding", "accept-encoding", "expect"]);

/** Construction options for {@link ToolFilterProxy}. */
export interface ToolFilterProxyOptions {
  serverName: string;
  /** Agent-facing address (`0.0.0.0:<sidecarPort>` in the sidecar; port 0 picks a free port). */
  listen: ListenAddress;
  /** Loopback address of the real server. */
  upstream: ListenAddress;
  allowlist: ToolAllowlist;
  logger: Logger;
  maxBodyBytes?: number;
}

interface ForwardContext {
  method: string;
  sessionId: string | undefined;
  /** Keys of the `tools/list` requests carried by this HTTP request. */
  listToolsIds: ReadonlySet<string>;
  /** Re-serialised POST body; `undefined` for GET and DELETE. */
  body?: string;
  replyId: RequestId | null;
}

/**
 * Streamable HTTP reverse proxy that enforces a server's tool allowlist.
 *
 * Every POST body is parsed and checked before anything reaches the server: a `tools/call` for a tool
 * outside the allowlist is answered by the proxy with a JSON-RPC error (see `inspectInbound`).
 * Responses to `tools/list` are filtered to the allowlist, in both JSON and SSE response modes and on
 * resumed GET streams of the same session. Everything else (other methods, notifications, session and
 * protocol headers, GET streams, DELETE) passes through unchanged.
 */
export class ToolFilterProxy {
  private readonly server: Server;
  private readonly agent = new Agent({ keepAlive: true });
  private readonly sessions = new SessionListRequests();
  private readonly maxBodyBytes: number;
  private denied = 0;

  constructor(private readonly options: ToolFilterProxyOptions) {
    this.maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => this.failRequest(res, err));
    });
  }

  /** Number of `tools/call` messages denied since start. */
  get deniedCalls(): number {
    return this.denied;
  }

  /**
   * Start listening.
   *
   * @returns The bound port.
   * @throws If the listen address is unavailable.
   */
  async start(): Promise<number> {
    const { listen, upstream, allowlist, serverName, logger } = this.options;
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(listen.port, listen.host, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    const port = (this.server.address() as AddressInfo).port;
    logger.info(
      `[proxy] ${serverName}: ${listen.host}:${port} -> ${upstream.host}:${upstream.port} (${allowlist.toArray().length} allowlisted tools)`,
    );
    return port;
  }

  /** Stop listening and drop open connections, including long-lived SSE streams. */
  async stop(): Promise<void> {
    if (!this.server.listening) return;
    const closed = new Promise<void>((resolve) => this.server.close(() => resolve()));
    this.server.closeAllConnections();
    await closed;
    this.agent.destroy();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "").split("?")[0];
    if (path !== MCP_PATH) {
      res.writeHead(404).end();
      return;
    }

    const sessionId = singleHeader(req.headers["mcp-session-id"]);
    const method = req.method ?? "";
    switch (method) {
      case "POST":
        await this.handlePost(req, res, sessionId);
        return;
      case "GET":
      case "DELETE":
        this.forward(req, res, { method, sessionId, listToolsIds: new Set(), replyId: null });
        return;
      default:
        res.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
    }
  }

  private async handlePost(req: IncomingMessage, res: ServerResponse, sessionId: string | undefined): Promise<void> {
    const { allowlist, serverName, logger } = this.options;
    const body = await readBody(req, this.maxBodyBytes);
    if (body === undefined) {
      sendJson(
        res,
        413,
        errorPayload(null, ErrorCode.InvalidRequest, `Payload too large: the limit is ${this.maxBodyBytes} bytes`),
      );
      return;
    }

    const verdict = inspectInbound(body, allowlist);
    if (verdict.kind === "reject") {
      if (verdict.deniedTools.length > 0) {
        this.denied += verdict.deniedTools.length;
        logger.warn(
          `[guard] ${serverName}: denied tools/call for ${verdict.deniedTools.map(loggableName).join(", ")} (not in the allowlist)`,
        );
      }
      sendJson(res, verdict.httpStatus, verdict.payload);
      return;
    }

    if (sessionId !== undefined) this.sessions.track(sessionId, verdict.listToolsIds);
    this.forward(req, res, {
      method: "POST",
      sessionId,
      listToolsIds: new Set(verdict.listToolsIds),
      body: verdict.body,
      replyId: verdict.replyId,
    });
  }

  private forward(req: IncomingMessage, res: ServerResponse, ctx: ForwardContext): void {
    const { upstream, serverName, logger } = this.options;
    const upstreamReq = request({
      host: upstream.host,
      port: upstream.port,
      method: ctx.method,
      path: req.url,
      headers: upstreamRequestHeaders(req.headers, ctx.body),
      agent: this.agent,
    });

    let clientGone = false;
    res.on("close", () => {
      if (res.writableFinished) return;
      clientGone = true;
      upstreamReq.destroy();
    });

    upstreamReq.on("response", (upRes) => this.relay(upRes, res, ctx));
    upstreamReq.on("error", (err) => {
      if (clientGone) return;
      if (res.headersSent) {
        res.destroy(err);
        return;
      }
      logger.error(`[proxy] ${serverName}: upstream ${upstream.host}:${upstream.port} failed: ${err.message}`);
      sendJson(res, 502, errorPayload(ctx.replyId, ErrorCode.InternalError, "Upstream MCP server unavailable"));
    });
    upstreamReq.end(ctx.body);
  }

  private relay(upRes: IncomingMessage, res: ServerResponse, ctx: ForwardContext): void {
    const status = upRes.statusCode ?? 502;
    const headers = clientResponseHeaders(upRes.headers);
    if (ctx.method === "DELETE" && ctx.sessionId !== undefined && status >= 200 && status < 300) {
      this.sessions.forget(ctx.sessionId);
    }

    const contentType = String(upRes.headers["content-type"] ?? "").toLowerCase();
    const isEventStream = contentType.includes("text/event-stream");
    const rewrite = this.messageRewriter(ctx);

    if (rewrite && contentType.includes("application/json")) {
      const chunks: Buffer[] = [];
      upRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      upRes.on("error", (err) => res.destroy(err));
      upRes.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const body = rewriteJson(text, rewrite) ?? text;
        headers["content-length"] = Buffer.byteLength(body);
        res.writeHead(status, upRes.statusMessage, headers);
        res.end(body);
      });
      return;
    }

    if (rewrite && isEventStream) {
      delete headers["content-length"];
      res.writeHead(status, upRes.statusMessage, headers);
      res.flushHeaders();
      pipeline(upRes, new SseEventFilter((data) => rewriteJson(data, rewrite)), res, (err) => this.onStreamEnd(err));
      return;
    }

    res.writeHead(status, upRes.statusMessage, headers);
    if (isEventStream) res.flushHeaders();
    pipeline(upRes, res, (err) => this.onStreamEnd(err));
  }

  /** Returns how to rewrite response messages for this request, or `undefined` when nothing can need it. */
  private messageRewriter(ctx: ForwardContext): ((message: unknown) => unknown) | undefined {
    const { sessionId, listToolsIds } = ctx;
    const resumable = ctx.method === "GET" && sessionId !== undefined;
    if (listToolsIds.size === 0 && !resumable) return undefined;

    return (message) => {
      const key = responseIdKey(message);
      if (key === undefined) return undefined;
      const tracked = listToolsIds.has(key) || (sessionId !== undefined && this.sessions.has(sessionId, key));
      return tracked ? filterListToolsResponse(message, this.options.allowlist) : undefined;
    };
  }

  private onStreamEnd(err: NodeJS.ErrnoException | null): void {
    // Client or upstream closing a stream early is routine (aborted requests, closed SSE streams).
    if (!err || err.code === "ERR_STREAM_PREMATURE_CLOSE" || err.code === "ECONNRESET") return;
    this.options.logger.warn(`[proxy] ${this.options.serverName}: stream error: ${err.message}`);
  }

  private failRequest(res: ServerResponse, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.options.logger.error(`[proxy] ${this.options.serverName}: request failed: ${message}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendJson(res, 500, errorPayload(null, ErrorCode.InternalError, "Internal error in the tool-filter proxy"));
  }
}

/**
 * `tools/list` request ids per MCP session. A response can be replayed on a resumed GET stream
 * after its POST stream broke, so ids stay tracked until the session ends or is evicted.
 */
class SessionListRequests {
  private readonly sessions = new Map<string, Set<string>>();

  track(sessionId: string, keys: readonly string[]): void {
    if (keys.length === 0) return;
    const ids = this.sessions.get(sessionId) ?? new Set<string>();
    // Re-insert so Map order tracks recency and eviction drops the least recently used session.
    this.sessions.delete(sessionId);
    this.sessions.set(sessionId, ids);
    for (const key of keys) {
      ids.delete(key);
      ids.add(key);
    }
    for (const oldest of ids) {
      if (ids.size <= MAX_TRACKED_IDS_PER_SESSION) break;
      ids.delete(oldest);
    }
    for (const oldest of this.sessions.keys()) {
      if (this.sessions.size <= MAX_TRACKED_SESSIONS) break;
      this.sessions.delete(oldest);
    }
  }

  has(sessionId: string, key: string): boolean {
    return this.sessions.get(sessionId)?.has(key) ?? false;
  }

  forget(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

/**
 * Apply `rewrite` to a JSON message or batch.
 *
 * @returns The re-serialised JSON when any message changed, otherwise `undefined` (also for non-JSON text).
 */
function rewriteJson(text: string, rewrite: (message: unknown) => unknown): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (Array.isArray(parsed)) {
    let changed = false;
    const messages = parsed.map((message: unknown) => {
      const replaced = rewrite(message);
      if (replaced === undefined) return message;
      changed = true;
      return replaced;
    });
    return changed ? JSON.stringify(messages) : undefined;
  }
  const replaced = rewrite(parsed);
  return replaced === undefined ? undefined : JSON.stringify(replaced);
}

/**
 * Read a request body.
 *
 * @returns The body, or `undefined` when it exceeds `limit` bytes (the rest is drained and discarded).
 */
function readBody(req: IncomingMessage, limit: number): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(tooLarge ? undefined : Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function upstreamRequestHeaders(incoming: IncomingHttpHeaders, body: string | undefined): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name) && !REPLACED_REQUEST_HEADERS.has(name)) {
      headers[name] = value;
    }
  }
  headers["accept-encoding"] = "identity";
  if (body !== undefined) headers["content-length"] = Buffer.byteLength(body);
  return headers;
}

function clientResponseHeaders(incoming: IncomingHttpHeaders): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name)) headers[name] = value;
  }
  return headers;
}

function sendJson(res: ServerResponse, status: number, payload: JsonRpcErrorPayload | JsonRpcErrorPayload[]): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

/** Quote and cap a client-supplied tool name so it cannot forge or flood log lines. */
function loggableName(name: string): string {
  return JSON.stringify(name.length > MAX_LOGGED_NAME_LENGTH ? `${name.slice(0, MAX_LOGGED_NAME_LENGTH)}...` : name);
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
