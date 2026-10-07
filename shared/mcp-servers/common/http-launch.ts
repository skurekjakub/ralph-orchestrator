import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** Transport a custom MCP server is started with. */
export enum LaunchTransport {
  Stdio = "stdio",
  Http = "http",
}

/** How the server was asked to run, parsed from its command-line arguments. */
export type LaunchOptions =
  { transport: LaunchTransport.Stdio } | { transport: LaunchTransport.Http; host: string; port: number };

/** Address bound when `--host` is absent: every interface. */
const DEFAULT_HTTP_HOST = "0.0.0.0";

const MAX_PORT = 65535;

/**
 * Parse the sidecar launch contract: `--transport http --port <port> [--host <address>]` serves
 * Streamable HTTP on that address, and no `--transport` (or `--transport stdio`) serves stdio.
 * `--port 0` binds a free port.
 *
 * @param argv The arguments after the script path (`process.argv.slice(2)`).
 * @throws If `--transport` has no value or names another transport, `--port` is missing or not an
 *   integer between 0 and 65535, or `--host` has no value.
 */
export function parseLaunchArgs(argv: readonly string[]): LaunchOptions {
  const transport = argv.includes("--transport") ? flagValue(argv, "--transport") : LaunchTransport.Stdio;
  if (transport === LaunchTransport.Stdio) return { transport: LaunchTransport.Stdio };
  if (transport !== LaunchTransport.Http) throw new Error(`Unsupported --transport value: ${transport ?? "(missing)"}`);

  const rawPort = flagValue(argv, "--port");
  const port = Number(rawPort);
  if (rawPort === undefined || !/^\d+$/.test(rawPort) || port > MAX_PORT) {
    throw new Error(`Invalid --port value: ${rawPort ?? "(missing)"}`);
  }

  const host = argv.includes("--host") ? flagValue(argv, "--host") : DEFAULT_HTTP_HOST;
  if (host === undefined || host === "") throw new Error("--host needs an address");

  return { transport: LaunchTransport.Http, host, port };
}

/** The part of an SDK Streamable HTTP server transport that {@link serveStatelessHttp} drives. */
export interface HttpRequestTransport {
  handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
  close(): Promise<void>;
}

/**
 * Factories for the MCP server and transport that answer one HTTP request. `T` is the transport
 * class `createTransport` returns; the server must accept it in `connect`.
 */
export interface StatelessMcpEndpoint<T extends HttpRequestTransport> {
  createServer(): { connect(transport: NoInfer<T>): Promise<void>; close(): Promise<void> };
  createTransport(): T;
}

/**
 * Serve stateless Streamable HTTP on `/mcp` and a liveness probe on `/health`. Every MCP request gets a
 * fresh server and transport, so a gateway restart is invisible to clients. Logs
 * `<name> MCP HTTP server listening on <host>:<port>`, the line the gateway treats as started.
 *
 * @returns The listening HTTP server.
 * @throws If the address cannot be bound.
 */
export async function serveStatelessHttp<T extends HttpRequestTransport>(
  listen: { host: string; port: number },
  name: string,
  endpoint: StatelessMcpEndpoint<T>,
): Promise<Server> {
  const httpServer = createServer((req, res) => {
    handleRequest(req, res, endpoint).catch((err: unknown) => {
      console.error(`${name} MCP request failed:`, err);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal error" }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(listen.port, listen.host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  const { address, port } = httpServer.address() as AddressInfo;
  console.log(`${name} MCP HTTP server listening on ${address}:${port}`);
  return httpServer;
}

async function handleRequest<T extends HttpRequestTransport>(
  req: IncomingMessage,
  res: ServerResponse,
  endpoint: StatelessMcpEndpoint<T>,
): Promise<void> {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url !== "/mcp") {
    res.writeHead(404);
    res.end();
    return;
  }

  let body: unknown;
  if (req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
  }

  const mcpServer = endpoint.createServer();
  const transport = endpoint.createTransport();
  res.on("close", () => {
    void transport.close();
    void mcpServer.close();
  });
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}
