import { createServer, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import bodyParser from "body-parser";
import { listen } from "./upstream";

/** One request as the upstream received it. */
export interface ReceivedRequest {
  headers: IncomingHttpHeaders;
  contentType: string | undefined;
  /** The body bytes, before decoding. */
  raw: Buffer;
  /** The body as `express.json()` parsed it. */
  body: { id?: unknown; params?: { name?: unknown } };
}

export interface ExpressJsonUpstream {
  port: number;
  url: URL;
  received: ReceivedRequest[];
  close(): Promise<void>;
}

/**
 * An MCP endpoint that parses bodies with `express.json()` (body-parser), which decodes them in the
 * charset the request's Content-Type names, UTF-7 included. It answers each request with a
 * `tools/call` result naming the tool it parsed.
 */
export async function startExpressJsonUpstream(): Promise<ExpressJsonUpstream> {
  const received: ReceivedRequest[] = [];
  const raws = new WeakMap<IncomingMessage, Buffer>();
  const parse = bodyParser.json({ verify: (req, _res, buf) => raws.set(req, Buffer.from(buf)) });
  const server = createServer((req, res) => {
    parse(req, res, (err?: { status?: number }) => {
      if (err) {
        res.writeHead(err.status ?? 400).end();
        return;
      }
      const body = (req as IncomingMessage & { body: ReceivedRequest["body"] }).body;
      received.push({
        headers: req.headers,
        contentType: req.headers["content-type"],
        raw: raws.get(req) ?? Buffer.alloc(0),
        body,
      });
      const answer = { content: [{ type: "text", text: `called ${String(body.params?.name)}` }] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id ?? null, result: answer }));
    });
  });
  const port = await listen(server, "127.0.0.1");
  return {
    port,
    url: new URL(`http://127.0.0.1:${port}/mcp`),
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
