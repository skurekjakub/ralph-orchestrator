import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { ProtocolError, ProtocolErrorCode, Server, type Tool } from "@modelcontextprotocol/server";

/** Streamable HTTP flavours the sidecar's real servers use. */
export enum UpstreamMode {
  /** Fresh server + transport per request, JSON responses (`enableJsonResponse`). */
  StatelessJson = "stateless-json",
  /** Fresh server + transport per request, SSE responses: what the custom servers do. */
  StatelessSse = "stateless-sse",
  /** Session ids, one server per session, SSE responses and standalone GET streams. */
  Stateful = "stateful-sse",
}

/** Tool that emits two progress notifications before returning. */
export const PROGRESS_TOOL = "progress_tool";

export interface TestUpstream {
  port: number;
  url: URL;
  /** Names of the tools whose handler ran, in call order. */
  calls: string[];
  /** Session ids the server saw terminated (stateful mode). */
  closedSessions: string[];
  close(): Promise<void>;
}

export interface UpstreamOptions {
  mode: UpstreamMode;
  tools: string[];
  /** Split `tools/list` into pages of this size. */
  pageSize?: number;
  host?: string;
}

/** Start a real MCP SDK server on an ephemeral port. */
export async function startUpstream(options: UpstreamOptions): Promise<TestUpstream> {
  const calls: string[] = [];
  const closedSessions: string[] = [];
  const sessions = new Map<string, NodeStreamableHTTPServerTransport>();
  const createMcpServer = (): Server => buildServer(options, calls);

  const http = createServer((req, res) => {
    const handle =
      options.mode === UpstreamMode.Stateful
        ? handleStateful(req, res, sessions, closedSessions, createMcpServer)
        : handleStateless(req, res, options.mode === UpstreamMode.StatelessJson, createMcpServer);
    handle.catch((err: unknown) => {
      if (!res.headersSent) res.writeHead(500).end(String(err));
    });
  });
  const port = await listen(http, options.host ?? "127.0.0.1");

  return {
    port,
    url: new URL(`http://127.0.0.1:${port}/mcp`),
    calls,
    closedSessions,
    close: async () => {
      await Promise.all([...sessions.values()].map((t) => t.close()));
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}

/** Listen on an ephemeral port and return it. */
export async function listen(server: HttpServer, host: string): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve());
  });
  return (server.address() as AddressInfo).port;
}

function buildServer(options: UpstreamOptions, calls: string[]): Server {
  const server = new Server({ name: "test-upstream", version: "1.0.0" }, { capabilities: { tools: {} } });
  const tools: Tool[] = options.tools.map((name) => ({
    name,
    description: `The ${name} tool`,
    inputSchema: { type: "object" },
  }));

  server.setRequestHandler("tools/list", async (request) => {
    if (!options.pageSize) return { tools };
    const start = request.params?.cursor ? Number(request.params.cursor) : 0;
    const end = start + options.pageSize;
    return { tools: tools.slice(start, end), ...(end < tools.length ? { nextCursor: String(end) } : {}) };
  });

  server.setRequestHandler("tools/call", async (request, ctx) => {
    const { name } = request.params;
    if (!options.tools.includes(name))
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Tool ${name} not found`);
    calls.push(name);
    const progressToken = request.params._meta?.progressToken;
    if (name === PROGRESS_TOOL && progressToken !== undefined) {
      for (const progress of [1, 2]) {
        await ctx.mcpReq.notify({
          method: "notifications/progress",
          params: { progressToken, progress, total: 2 },
        });
      }
    }
    return { content: [{ type: "text", text: `called ${name}` }] };
  });

  return server;
}

async function handleStateless(
  req: IncomingMessage,
  res: ServerResponse,
  enableJsonResponse: boolean,
  createMcpServer: () => Server,
): Promise<void> {
  const server = createMcpServer();
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

async function handleStateful(
  req: IncomingMessage,
  res: ServerResponse,
  sessions: Map<string, NodeStreamableHTTPServerTransport>,
  closedSessions: string[],
  createMcpServer: () => Server,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"];
  if (typeof sessionId === "string") {
    const existing = sessions.get(sessionId);
    if (!existing) {
      res.writeHead(404).end();
      return;
    }
    await existing.handleRequest(req, res);
    return;
  }

  const transport: NodeStreamableHTTPServerTransport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
      closedSessions.push(id);
    },
  });
  await createMcpServer().connect(transport);
  await transport.handleRequest(req, res);
}
