import {
  Agent,
  request,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import { pipeline } from "node:stream";
import { ProtocolErrorCode } from "@modelcontextprotocol/client";
import type { ListenAddress } from "./http-listen";
import type { Logger } from "./logger";
import { SseEventFilter } from "./sse-filter";
import { McpHttpMethod, sendJson, type AcceptedRequest, type ProxyUpstream } from "./tool-filter-proxy";
import { errorPayload, filterListToolsResponse, responseIdKey, type ToolAllowlist } from "./tool-policy";

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

/** Construction options for {@link HttpUpstream}. */
export interface HttpUpstreamOptions {
  serverName: string;
  /** Loopback address the server listens on. */
  address: ListenAddress;
  allowlist: ToolAllowlist;
  logger: Logger;
}

/**
 * A server that serves Streamable HTTP on loopback. Accepted requests are relayed to it, and
 * responses to `tools/list` are filtered to the allowlist, in both JSON and SSE response modes and
 * on resumed GET streams of the same session. Everything else (other methods, notifications, session
 * and protocol headers, GET streams, DELETE) passes through unchanged.
 */
export class HttpUpstream implements ProxyUpstream {
  readonly description: string;
  private readonly agent = new Agent({ keepAlive: true });
  private readonly sessions = new SessionListRequests();

  constructor(private readonly options: HttpUpstreamOptions) {
    this.description = `${options.address.host}:${options.address.port}`;
  }

  async forward(req: IncomingMessage, res: ServerResponse, accepted: AcceptedRequest): Promise<void> {
    const { address, serverName, logger } = this.options;
    const { method, sessionId, body } = accepted;
    if (body && sessionId !== undefined) this.sessions.track(sessionId, body.listToolsIds);

    const upstreamReq = request({
      host: address.host,
      port: address.port,
      method,
      path: req.url,
      headers: upstreamRequestHeaders(req.headers, body?.serialized),
      agent: this.agent,
    });

    let clientGone = false;
    res.on("close", () => {
      if (res.writableFinished) return;
      clientGone = true;
      upstreamReq.destroy();
    });

    upstreamReq.on("response", (upRes) => this.relay(upRes, res, accepted));
    upstreamReq.on("error", (err) => {
      if (clientGone) return;
      if (res.headersSent) {
        res.destroy(err);
        return;
      }
      logger.error(`[proxy] ${serverName}: upstream ${address.host}:${address.port} failed: ${err.message}`);
      sendJson(
        res,
        502,
        errorPayload(body?.replyId ?? null, ProtocolErrorCode.InternalError, "Upstream MCP server unavailable"),
      );
    });
    upstreamReq.end(body?.serialized);
  }

  async close(): Promise<void> {
    this.agent.destroy();
  }

  private relay(upRes: IncomingMessage, res: ServerResponse, accepted: AcceptedRequest): void {
    const status = upRes.statusCode ?? 502;
    const headers = clientResponseHeaders(upRes.headers);
    if (accepted.method === McpHttpMethod.Delete && accepted.sessionId !== undefined && status >= 200 && status < 300) {
      this.sessions.forget(accepted.sessionId);
    }

    const contentType = String(upRes.headers["content-type"] ?? "").toLowerCase();
    const isEventStream = contentType.includes("text/event-stream");
    const rewrite = this.messageRewriter(accepted);

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
  private messageRewriter(accepted: AcceptedRequest): ((message: unknown) => unknown) | undefined {
    const { sessionId } = accepted;
    const listToolsIds = new Set(accepted.body?.listToolsIds ?? []);
    const resumable = accepted.method === McpHttpMethod.Get && sessionId !== undefined;
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
