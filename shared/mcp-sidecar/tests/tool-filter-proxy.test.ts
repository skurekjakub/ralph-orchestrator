import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ProtocolErrorCode } from "@modelcontextprotocol/client";
import { HttpUpstream } from "../src/http-upstream";
import { ToolFilterProxy } from "../src/tool-filter-proxy";
import { ToolAllowlist } from "../src/tool-policy";
import { startExpressJsonUpstream } from "./helpers/express-json-upstream";
import { createRecordingLogger, type RecordingLogger } from "./helpers/logger";
import { connectClient, postBytes, postRaw, readMessages, type ConnectedClient } from "./helpers/mcp-client";
import { listen, PROGRESS_TOOL, startUpstream, UpstreamMode, type TestUpstream } from "./helpers/upstream";

const ALLOWED = ["echo", PROGRESS_TOOL];
/** Calls `echo` read as UTF-8, and `secret_tool` read as UTF-7 (`+ACIALAAi-` is `","`, `+ACIAOgAi-` is `":"`). */
const UTF7_SMUGGLED_CALL = String.raw`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","x":"+ACIALAAi-name+ACIAOgAi-secret_tool"}}`;
const UPSTREAM_TOOLS = ["echo", PROGRESS_TOOL, "secret_tool"];

interface Harness {
  upstream: TestUpstream;
  proxy: ToolFilterProxy;
  logger: RecordingLogger;
  url: URL;
}

function toolNames(message: unknown): string[] {
  const { result } = message as { result: { tools: { name: string }[] } };
  return result.tools.map((tool) => tool.name);
}

function byId(messages: unknown[], id: number): Record<string, unknown> {
  const found = messages.find((m) => (m as { id?: unknown }).id === id);
  if (!found) throw new Error(`no message with id ${id} in ${JSON.stringify(messages)}`);
  return found as Record<string, unknown>;
}

describe("ToolFilterProxy", () => {
  const cleanups: (() => Promise<unknown>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  async function startProxy(upstreamPort: number, options: { maxBodyBytes?: number } = {}) {
    const logger = createRecordingLogger();
    const allowlist = new ToolAllowlist(ALLOWED);
    const proxy = new ToolFilterProxy({
      serverName: "test",
      listen: { host: "127.0.0.1", port: 0 },
      upstream: new HttpUpstream({
        serverName: "test",
        address: { host: "127.0.0.1", port: upstreamPort },
        allowlist,
        logger,
      }),
      allowlist,
      logger,
      maxBodyBytes: options.maxBodyBytes,
    });
    const port = await proxy.start();
    cleanups.push(() => proxy.stop());
    return { proxy, logger, url: new URL(`http://127.0.0.1:${port}/mcp`) };
  }

  async function startHarness(mode: UpstreamMode, options: { maxBodyBytes?: number } = {}): Promise<Harness> {
    const upstream = await startUpstream({ mode, tools: UPSTREAM_TOOLS });
    cleanups.push(() => upstream.close());
    return { upstream, ...(await startProxy(upstream.port, options)) };
  }

  async function connect(url: URL): Promise<ConnectedClient> {
    const connected = await connectClient(url);
    cleanups.push(() => connected.client.close());
    return connected;
  }

  describe.each([UpstreamMode.StatelessJson, UpstreamMode.StatelessSse, UpstreamMode.Stateful])(
    "in front of a %s server",
    (mode) => {
      it("lists only the allowlisted tools", async () => {
        const { url } = await startHarness(mode);
        const { client } = await connect(url);

        const { tools } = await client.listTools();

        expect(tools.map((tool) => tool.name)).toEqual(ALLOWED);
        expect(tools[0]).toMatchObject({ name: "echo", description: "The echo tool" });
      });

      it("forwards calls to allowlisted tools", async () => {
        const { url, upstream } = await startHarness(mode);
        const { client } = await connect(url);

        const result = await client.callTool({ name: "echo", arguments: {} });

        expect(result.content).toEqual([{ type: "text", text: "called echo" }]);
        expect(upstream.calls).toEqual(["echo"]);
      });

      it("refuses calls to tools outside the allowlist without reaching the server", async () => {
        const { url, upstream, proxy, logger } = await startHarness(mode);
        const { client } = await connect(url);

        await expect(client.callTool({ name: "secret_tool", arguments: {} })).rejects.toMatchObject({
          code: ProtocolErrorCode.InvalidParams,
          message: expect.stringContaining("Unknown tool: secret_tool"),
        });

        expect(upstream.calls).toEqual([]);
        expect(proxy.deniedCalls).toBe(1);
        expect(logger.messages("warn")).toEqual([
          expect.stringContaining('[guard] test: denied tools/call for "secret_tool"'),
        ]);
      });
    },
  );

  describe("streaming", () => {
    it("relays progress notifications of an allowlisted tool call as they arrive", async () => {
      const { url } = await startHarness(UpstreamMode.StatelessSse);
      const { client } = await connect(url);
      const progress: number[] = [];

      const result = await client.callTool(
        { name: PROGRESS_TOOL, arguments: {} },
        { onprogress: (update) => progress.push(update.progress) },
      );

      expect(progress).toEqual([1, 2]);
      expect(result.content).toEqual([{ type: "text", text: `called ${PROGRESS_TOOL}` }]);
    });
  });

  describe("sessions", () => {
    it("passes the server's session id through and ends the session on DELETE", async () => {
      const { url, upstream } = await startHarness(UpstreamMode.Stateful);
      const { client, transport } = await connect(url);
      const sessionId = transport.sessionId;

      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(ALLOWED);

      await transport.terminateSession();

      expect(upstream.closedSessions).toEqual([sessionId]);
    });
  });

  describe("batches", () => {
    const listAndCall = JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "echo", arguments: {} } },
    ]);

    it.each([UpstreamMode.StatelessJson, UpstreamMode.StatelessSse])(
      "filters tools/list inside a %s batch response and passes the other responses through",
      async (mode) => {
        const { url, upstream } = await startHarness(mode);

        const response = await postRaw(url, listAndCall);
        const messages = await readMessages(response);

        expect(response.status).toBe(200);
        expect(toolNames(byId(messages, 1))).toEqual(ALLOWED);
        expect(byId(messages, 2)).toMatchObject({ result: { content: [{ type: "text", text: "called echo" }] } });
        expect(upstream.calls).toEqual(["echo"]);
      },
    );

    it("rejects a whole batch that calls a tool outside the allowlist", async () => {
      const { url, upstream, proxy } = await startHarness(UpstreamMode.StatelessJson);
      const body = JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: {} } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "secret_tool", arguments: {} } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ]);

      const response = await postRaw(url, body);
      const messages = await readMessages(response);

      expect(response.status).toBe(200);
      expect(messages).toEqual([
        expect.objectContaining({ id: 1, error: expect.objectContaining({ code: ProtocolErrorCode.InvalidRequest }) }),
        expect.objectContaining({
          id: 2,
          error: { code: ProtocolErrorCode.InvalidParams, message: "Unknown tool: secret_tool" },
        }),
      ]);
      expect(upstream.calls).toEqual([]);
      expect(proxy.deniedCalls).toBe(1);
    });
  });

  describe("notifications", () => {
    it("passes client notifications through to the server", async () => {
      const { url } = await startHarness(UpstreamMode.StatelessSse);

      const response = await postRaw(url, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));

      expect(response.status).toBe(202);
    });

    it("rejects tools/call sent as a notification", async () => {
      const { url, upstream } = await startHarness(UpstreamMode.StatelessSse);
      const body = JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name: "echo" } });

      const response = await postRaw(url, body);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: ProtocolErrorCode.InvalidRequest } });
      expect(upstream.calls).toEqual([]);
    });
  });

  describe("malformed requests", () => {
    it.each([
      ["not JSON", "{", ProtocolErrorCode.ParseError],
      ["not a JSON-RPC message", JSON.stringify({ hello: "world" }), ProtocolErrorCode.InvalidRequest],
      [
        "a JSON-RPC message with an unknown member",
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", x: 1 }),
        ProtocolErrorCode.InvalidRequest,
      ],
      ["an empty batch", "[]", ProtocolErrorCode.InvalidRequest],
    ])("rejects a body that is %s with HTTP 400", async (_label, body, code) => {
      const { url } = await startHarness(UpstreamMode.StatelessSse);

      const response = await postRaw(url, body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ jsonrpc: "2.0", id: null, error: expect.objectContaining({ code }) });
    });

    it("refuses tools/call without a tool name", async () => {
      const { url, upstream } = await startHarness(UpstreamMode.StatelessSse);
      const body = JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { arguments: {} } });

      const response = await postRaw(url, body);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ id: 9, error: { code: ProtocolErrorCode.InvalidParams } });
      expect(upstream.calls).toEqual([]);
    });

    it("logs a denied tool name quoted, so a name with line breaks cannot forge log lines", async () => {
      const { url, logger } = await startHarness(UpstreamMode.StatelessSse);
      const forged = "x\n2026-01-01T00:00:00.000Z [gateway] all good";
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: forged } });

      await postRaw(url, body);

      expect(logger.messages("warn")).toEqual([
        `[guard] test: denied tools/call for ${JSON.stringify(forged)} (not in the allowlist)`,
      ]);
      expect(logger.messages("warn")[0]).not.toContain("\n");
    });

    it("rejects a body over the size limit with HTTP 413", async () => {
      const { url } = await startHarness(UpstreamMode.StatelessSse, { maxBodyBytes: 64 });
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: { pad: "x".repeat(100) } },
      });

      const response = await postRaw(url, body);

      expect(response.status).toBe(413);
    });

    it("answers 404 outside the MCP endpoint and 405 for unsupported methods", async () => {
      const { url } = await startHarness(UpstreamMode.StatelessSse);

      expect((await fetch(new URL("/health", url))).status).toBe(404);
      expect((await fetch(url, { method: "PUT", body: "{}" })).status).toBe(405);
    });
  });

  describe("request bodies", () => {
    async function startCharsetHonouringHarness() {
      const upstream = await startExpressJsonUpstream();
      cleanups.push(() => upstream.close());
      return { upstream, ...(await startProxy(upstream.port)) };
    }

    it("is needed: a server that honours the charset reads the UTF-7 body as a call to another tool", async () => {
      // Arrange
      const { upstream } = await startCharsetHonouringHarness();

      // Act
      const response = await postRaw(upstream.url, UTF7_SMUGGLED_CALL, {
        "content-type": "application/json; charset=utf-7",
      });

      // Assert
      expect(await response.json()).toMatchObject({ result: { content: [{ text: "called secret_tool" }] } });
    });

    it.each(["utf-7", "UTF-16", '"latin1"'])(
      "rejects charset %s with HTTP 415 before anything reaches the server",
      async (charset) => {
        // Arrange
        const { url, upstream } = await startCharsetHonouringHarness();

        // Act
        const response = await postRaw(url, UTF7_SMUGGLED_CALL, {
          "content-type": `application/json; charset=${charset}`,
        });

        // Assert
        expect(response.status).toBe(415);
        expect(await response.json()).toMatchObject({
          id: null,
          error: { code: ProtocolErrorCode.InvalidRequest, message: expect.stringContaining("is not UTF-8") },
        });
        expect(upstream.received).toEqual([]);
      },
    );

    it.each([
      ["text/plain", { "content-type": "text/plain" }],
      ["a missing content type", {}],
    ])("rejects %s with HTTP 415", async (_label, headers: Record<string, string>) => {
      // Arrange
      const { url, upstream } = await startCharsetHonouringHarness();

      // Act
      const response = await postBytes(url, Buffer.from(UTF7_SMUGGLED_CALL), headers);

      // Assert
      expect(response.status).toBe(415);
      expect(upstream.received).toEqual([]);
    });

    it("forwards an accepted body byte for byte, declared as plain application/json", async () => {
      // Arrange
      const { url, upstream } = await startCharsetHonouringHarness();
      const body =
        '{ "jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": { "name": "echo", "arguments": { "ticket": 12345678901234567890, "ratio": 0.10000000000000001 } } }';

      // Act
      const response = await postRaw(url, body, { "content-type": "Application/JSON; Charset=UTF-8" });

      // Assert
      expect(response.status).toBe(200);
      expect(upstream.received).toEqual([
        { contentType: "application/json", raw: Buffer.from(body), body: expect.objectContaining({ id: 4 }) },
      ]);
    });

    it("rejects a request id beyond the safe integer range, as the MCP SDK's JSON-RPC schema does", async () => {
      // Arrange
      const { url, upstream } = await startCharsetHonouringHarness();

      // Act
      const response = await postRaw(url, '{"jsonrpc":"2.0","id":9007199254740993,"method":"tools/list"}');

      // Assert
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: ProtocolErrorCode.InvalidRequest } });
      expect(upstream.received).toEqual([]);
    });

    it.each([
      [
        "invalid UTF-8",
        Buffer.concat([
          Buffer.from('{"jsonrpc":"2.0","id":1,"method":"tools/list","x":"'),
          Buffer.from([0xc3, 0x28]),
          Buffer.from('"}'),
        ]),
      ],
      [
        "a byte order mark",
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"jsonrpc":"2.0","id":1,"method":"tools/list"}')]),
      ],
    ])("rejects a body with %s as a parse error", async (_label, body) => {
      // Arrange
      const { url, upstream } = await startCharsetHonouringHarness();

      // Act
      const response = await postBytes(url, body, { "content-type": "application/json" });

      // Assert
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: ProtocolErrorCode.ParseError } });
      expect(upstream.received).toEqual([]);
    });

    it("rejects a body whose object repeats a key, whichever repeat names an allowlisted tool", async () => {
      // Arrange
      const { url, upstream } = await startCharsetHonouringHarness();
      const bodies = [
        '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"secret_tool","name":"echo"}}',
        '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","na\\u006de":"secret_tool"}}',
      ];

      // Act
      const responses = await Promise.all(bodies.map((body) => postRaw(url, body)));

      // Assert
      expect(responses.map((response) => response.status)).toEqual([400, 400]);
      expect(upstream.received).toEqual([]);
    });
  });

  describe("upstream failures", () => {
    it("answers 502 with a JSON-RPC error carrying the request id when the server is down", async () => {
      const unused = createServer();
      const deadPort = await listen(unused, "127.0.0.1");
      await new Promise<void>((resolve) => unused.close(() => resolve()));
      const { url, logger } = await startProxy(deadPort);

      const response = await postRaw(url, JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/list" }));

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        id: 5,
        error: { code: ProtocolErrorCode.InternalError, message: "Upstream MCP server unavailable" },
      });
      expect(logger.messages("error")).toEqual([expect.stringContaining("[proxy] test: upstream 127.0.0.1:")]);
    });
  });

  describe("resumed GET streams", () => {
    const listResponse = (id: number) =>
      JSON.stringify({ jsonrpc: "2.0", id, result: { tools: [{ name: "echo" }, { name: "secret_tool" }] } });

    async function startReplayingUpstream(): Promise<number> {
      // A server that answers POSTs later, on the session's GET stream, as it does when replaying after a reconnect.
      const server = createServer((req, res) => {
        if (req.method === "POST") {
          req.resume();
          req.on("end", () => res.writeHead(202).end());
          return;
        }
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`id: e1\nevent: message\ndata: ${listResponse(7)}\n\n`);
        res.end(`id: e2\nevent: message\ndata: ${listResponse(8)}\n\n`);
      });
      const port = await listen(server, "127.0.0.1");
      cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
      return port;
    }

    it("filters tools/list responses replayed on the same session's GET stream", async () => {
      const { url } = await startProxy(await startReplayingUpstream());
      const session = { "mcp-session-id": "session-1" };
      await postRaw(url, JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }), session);

      const response = await fetch(url, { headers: { accept: "text/event-stream", ...session } });
      const text = await response.text();

      expect(text).toBe(
        `id: e1\nevent: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 7, result: { tools: [{ name: "echo" }] } })}\n\n` +
          `id: e2\nevent: message\ndata: ${listResponse(8)}\n\n`,
      );
    });

    it("leaves GET streams of other sessions untouched", async () => {
      const { url } = await startProxy(await startReplayingUpstream());
      await postRaw(url, JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }), { "mcp-session-id": "a" });

      const response = await fetch(url, { headers: { accept: "text/event-stream", "mcp-session-id": "b" } });

      expect(await response.text()).toContain(`data: ${listResponse(7)}\n`);
    });
  });
});
