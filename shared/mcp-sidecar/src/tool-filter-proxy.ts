import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ProtocolErrorCode, type RequestId } from "@modelcontextprotocol/client";
import { listenOn, type ListenAddress } from "./http-listen";
import type { Logger } from "./logger";
import { errorPayload, inspectInbound, type JsonRpcErrorPayload, type ToolAllowlist } from "./tool-policy";

/** Path of the Streamable HTTP endpoint, on the proxy and on HTTP upstream servers. */
export const MCP_PATH = "/mcp";

/** The SDK's `DEFAULT_MAX_REQUEST_BODY_SIZE`; the proxy buffers whole POST bodies to inspect them. */
const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_LOGGED_NAME_LENGTH = 200;

/** HTTP methods of the Streamable HTTP transport. */
export enum McpHttpMethod {
  Get = "GET",
  Post = "POST",
  Delete = "DELETE",
}

/** A validated POST body. */
export interface AcceptedBody {
  /** The parsed JSON-RPC message or batch. */
  parsed: unknown;
  /** The parsed value re-serialised, so an HTTP upstream parses exactly what was inspected. */
  serialized: string;
  /** Keys (`requestIdKey`) of the `tools/list` requests in the body, whose responses must be filtered. */
  listToolsIds: readonly string[];
  /** Id to answer with when the body is a single request and the upstream fails; otherwise `null`. */
  replyId: RequestId | null;
}

/** A request the proxy accepted, to be served by its {@link ProxyUpstream}. */
export interface AcceptedRequest {
  method: McpHttpMethod;
  sessionId: string | undefined;
  /** Present for POST; GET and DELETE carry no body. */
  body?: AcceptedBody;
}

/**
 * Serves the requests a {@link ToolFilterProxy} accepted: an HTTP server on loopback, or a stdio
 * server the gateway bridges in process. It must keep `tools/list` responses within the allowlist.
 */
export interface ProxyUpstream {
  /** Where requests go, for the log. */
  readonly description: string;
  /** Answer one accepted request on `res`. The request body, if any, has been consumed already. */
  forward(req: IncomingMessage, res: ServerResponse, accepted: AcceptedRequest): Promise<void>;
  /** Release connections and sessions. */
  close(): Promise<void>;
}

/** Construction options for {@link ToolFilterProxy}. */
export interface ToolFilterProxyOptions {
  serverName: string;
  /** Agent-facing address (`0.0.0.0:<sidecarPort>` in the sidecar; port 0 picks a free port). */
  listen: ListenAddress;
  upstream: ProxyUpstream;
  allowlist: ToolAllowlist;
  logger: Logger;
  maxBodyBytes?: number;
}

/**
 * Streamable HTTP front of a server with a tool allowlist.
 *
 * Every POST body is parsed and checked before anything reaches the server: a `tools/call` for a tool
 * outside the allowlist is answered by the proxy with a JSON-RPC error (see `inspectInbound`). Accepted
 * requests, and GET and DELETE, go to the {@link ProxyUpstream}, which filters `tools/list` responses.
 */
export class ToolFilterProxy {
  private readonly server: Server;
  private readonly maxBodyBytes: number;
  private denied = 0;
  private refusal: string | null = null;

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
    const port = await listenOn(this.server, listen);
    logger.info(
      `[proxy] ${serverName}: ${listen.host}:${port} -> ${upstream.description} (${allowlist.toArray().length} allowlisted tools)`,
    );
    return port;
  }

  /**
   * Stop serving the server: from now on every request is answered with HTTP 503 and a JSON-RPC
   * error carrying `reason`, and open connections are dropped.
   */
  refuse(reason: string): void {
    this.refusal = reason;
    this.server.closeAllConnections();
  }

  /** Stop listening, drop open connections (including long-lived SSE streams) and close the upstream. */
  async stop(): Promise<void> {
    if (this.server.listening) {
      const closed = new Promise<void>((resolve) => this.server.close(() => resolve()));
      this.server.closeAllConnections();
      await closed;
    }
    await this.options.upstream.close();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "").split("?")[0];
    if (path !== MCP_PATH) {
      res.writeHead(404).end();
      return;
    }
    if (this.refusal !== null) {
      req.resume();
      sendJson(res, 503, errorPayload(null, ProtocolErrorCode.InternalError, this.refusal));
      return;
    }

    const sessionId = singleHeader(req.headers["mcp-session-id"]);
    switch (req.method) {
      case McpHttpMethod.Post:
        await this.handlePost(req, res, sessionId);
        return;
      case McpHttpMethod.Get:
      case McpHttpMethod.Delete:
        await this.options.upstream.forward(req, res, { method: req.method, sessionId });
        return;
      default:
        req.resume();
        res.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
    }
  }

  private async handlePost(req: IncomingMessage, res: ServerResponse, sessionId: string | undefined): Promise<void> {
    const { allowlist, serverName, logger, upstream } = this.options;
    const body = await readBody(req, this.maxBodyBytes);
    if (body === undefined) {
      sendJson(
        res,
        413,
        errorPayload(
          null,
          ProtocolErrorCode.InvalidRequest,
          `Payload too large: the limit is ${this.maxBodyBytes} bytes`,
        ),
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

    await upstream.forward(req, res, {
      method: McpHttpMethod.Post,
      sessionId,
      body: {
        parsed: verdict.parsed,
        serialized: verdict.body,
        listToolsIds: verdict.listToolsIds,
        replyId: verdict.replyId,
      },
    });
  }

  private failRequest(res: ServerResponse, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.options.logger.error(`[proxy] ${this.options.serverName}: request failed: ${message}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    sendJson(res, 500, errorPayload(null, ProtocolErrorCode.InternalError, "Internal error in the tool-filter proxy"));
  }
}

/** Answer with a JSON body of JSON-RPC errors. */
export function sendJson(
  res: ServerResponse,
  status: number,
  payload: JsonRpcErrorPayload | JsonRpcErrorPayload[],
): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
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

/** Quote and cap a client-supplied tool name so it cannot forge or flood log lines. */
function loggableName(name: string): string {
  return JSON.stringify(name.length > MAX_LOGGED_NAME_LENGTH ? `${name.slice(0, MAX_LOGGED_NAME_LENGTH)}...` : name);
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
