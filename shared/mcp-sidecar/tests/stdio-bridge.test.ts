import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ProtocolErrorCode } from "@modelcontextprotocol/client";
import { ServerType, type ServerConfig } from "../src/gateway-config";
import { ManagedServer, ServerStatus } from "../src/managed-server";
import { StdioBridge } from "../src/stdio-bridge";
import { StdioUpstream } from "../src/stdio-upstream";
import { ToolFilterProxy } from "../src/tool-filter-proxy";
import { ToolAllowlist } from "../src/tool-policy";
import { createStatusRecorder } from "./helpers/lifecycle";
import { createRecordingLogger } from "./helpers/logger";
import { connectClient, postRaw, type ConnectedClient } from "./helpers/mcp-client";

const FIXTURE = fileURLToPath(new URL("./fixtures/stdio-server.mjs", import.meta.url));
const ALLOWED = ["echo", "count", "crash", "progress", "announce", "wait", "cancellations"];
const INITIALIZE = {
  jsonrpc: "2.0",
  id: 0,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "1" } },
};

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    name: "stdio",
    type: ServerType.Npm,
    port: 9103,
    command: process.execPath,
    args: [FIXTURE],
    env: {},
    allowedTools: ALLOWED,
    ...overrides,
  };
}

function textOf(result: unknown): string {
  return (result as { content: { text: string }[] }).content[0].text;
}

describe("StdioBridge", () => {
  const cleanups: (() => Promise<unknown>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  async function startBridge(
    options: { maxSessions?: number; overrides?: Partial<ServerConfig>; wait?: boolean } = {},
  ) {
    const logger = createRecordingLogger();
    const statuses = createStatusRecorder();
    const allowlist = new ToolAllowlist(ALLOWED);
    const upstream = new StdioUpstream({ config: config(options.overrides), logger });
    const managed = new ManagedServer({
      name: "stdio",
      launcher: upstream,
      logger,
      restartDelayMs: 1,
      onStatusChange: statuses.onStatusChange,
    });
    const bridge = new StdioBridge({
      serverName: "stdio",
      upstream,
      allowlist,
      logger,
      maxSessions: options.maxSessions,
    });
    const proxy = new ToolFilterProxy({
      serverName: "stdio",
      listen: { host: "127.0.0.1", port: 0 },
      upstream: bridge,
      allowlist,
      logger,
    });
    const port = await proxy.start();
    managed.start();
    cleanups.push(async () => {
      managed.stop();
      await proxy.stop();
    });
    if (options.wait !== false) await statuses.reached(ServerStatus.Running);
    return { logger, statuses, managed, url: new URL(`http://127.0.0.1:${port}/mcp`) };
  }

  async function connect(url: URL): Promise<ConnectedClient> {
    const connected = await connectClient(url);
    cleanups.push(() => connected.client.close());
    return connected;
  }

  describe("tools", () => {
    it("lists only the allowlisted tools and refuses the others", async () => {
      // Arrange
      const { url } = await startBridge();
      const { client } = await connect(url);

      // Act
      const { tools } = await client.listTools();
      const denied = client.callTool({ name: "secret", arguments: {} });

      // Assert
      expect(tools.map((tool) => tool.name)).toEqual(ALLOWED);
      await expect(denied).rejects.toMatchObject({ code: ProtocolErrorCode.InvalidParams });
    });

    it("keeps the server's state across calls and across sessions", async () => {
      // Arrange
      const { url } = await startBridge();
      const first = await connect(url);
      const second = await connect(url);

      // Act
      const counts = [
        await first.client.callTool({ name: "count", arguments: {} }),
        await first.client.callTool({ name: "count", arguments: {} }),
        await second.client.callTool({ name: "count", arguments: {} }),
      ];

      // Assert
      expect(counts.map(textOf)).toEqual(["1", "2", "3"]);
      expect(first.transport.sessionId).not.toBe(second.transport.sessionId);
    });
  });

  describe("notifications", () => {
    it("relays progress notifications to the calling client under its own token", async () => {
      // Arrange
      const { url } = await startBridge();
      const { client } = await connect(url);
      const progress: number[] = [];

      // Act
      const result = await client.callTool(
        { name: "progress", arguments: {} },
        { onprogress: (update) => progress.push(update.progress) },
      );

      // Assert
      expect(textOf(result)).toBe("done");
      expect(progress).toEqual([1, 2]);
    });

    it("broadcasts the server's other notifications to every session's GET stream", async () => {
      // Arrange
      const { url } = await startBridge();
      const watcher = await connect(url);
      const caller = await connect(url);
      const announced = new Promise<void>((resolve) =>
        watcher.client.setNotificationHandler("notifications/tools/list_changed", () => resolve()),
      );

      // Act
      await caller.client.callTool({ name: "announce", arguments: {} });

      // Assert
      await expect(announced).resolves.toBeUndefined();
    });
  });

  describe("cancellation", () => {
    it("cancels the server's request when the client cancels its call", async () => {
      // Arrange
      const { url } = await startBridge();
      const { client } = await connect(url);
      const controller = new AbortController();
      const serverCancelled = new Promise<unknown>((resolve) =>
        client.setNotificationHandler("notifications/message", (notification) => resolve(notification.params.data)),
      );
      let markWaiting!: () => void;
      const serverWaiting = new Promise<void>((resolve) => (markWaiting = resolve));
      const waiting = client.callTool(
        { name: "wait", arguments: {} },
        { signal: controller.signal, onprogress: () => markWaiting() },
      );
      await serverWaiting;

      // Act
      controller.abort();

      // Assert
      await expect(waiting).rejects.toThrow();
      expect(await serverCancelled).toBe("wait cancelled");
    });

    it("cancels the server's request when the client hangs up before the answer", async () => {
      // Arrange
      const { url } = await startBridge();
      const watcher = await connect(url);
      const caller = await connect(url);
      const serverCancelled = new Promise<unknown>((resolve) =>
        watcher.client.setNotificationHandler("notifications/message", (notification) =>
          resolve(notification.params.data),
        ),
      );
      const call = JSON.stringify({
        jsonrpc: "2.0",
        id: 77,
        method: "tools/call",
        params: { name: "wait", arguments: {}, _meta: { progressToken: "t" } },
      });
      const response = await postRaw(url, call, {
        "mcp-session-id": caller.transport.sessionId!,
        "mcp-protocol-version": "2025-11-25",
      });
      const reader = response.body!.getReader();
      await reader.read();

      // Act
      await reader.cancel();

      // Assert
      expect(await serverCancelled).toBe("wait cancelled");
    });
  });

  describe("crashes", () => {
    it("fails the call in flight, restarts the server and serves the same session again", async () => {
      // Arrange
      const { url, statuses, managed } = await startBridge();
      const { client } = await connect(url);
      await client.callTool({ name: "count", arguments: {} });

      // Act
      const crashed = client.callTool({ name: "crash", arguments: {} });
      await expect(crashed).rejects.toMatchObject({
        code: ProtocolErrorCode.InternalError,
        message: expect.stringContaining("MCP server stdio exited before answering"),
      });
      await statuses.reached(ServerStatus.Running, 2);
      const afterRestart = await client.callTool({ name: "count", arguments: {} });

      // Assert
      expect(textOf(afterRestart)).toBe("1");
      expect(managed.restarts).toBe(1);
    });
  });

  describe("sessions", () => {
    it("answers 400 without a session id and 404 for an unknown one", async () => {
      // Arrange
      const { url } = await startBridge();
      const list = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

      // Act
      const missing = await postRaw(url, list);
      const unknown = await postRaw(url, list, { "mcp-session-id": "no-such-session" });

      // Assert
      expect(missing.status).toBe(400);
      expect(unknown.status).toBe(404);
    });

    it("answers initialize with 503 while the server is not running", async () => {
      // Arrange
      const { url } = await startBridge({ overrides: { args: ["-e", "setInterval(() => {}, 1000)"] }, wait: false });

      // Act
      const response = await postRaw(url, JSON.stringify(INITIALIZE));

      // Assert
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: ProtocolErrorCode.InternalError, message: "MCP server stdio is not running" },
      });
    });

    it("closes the least recently used session beyond the limit", async () => {
      // Arrange
      const { url, logger } = await startBridge({ maxSessions: 1 });
      const first = await connect(url);

      // Act
      await connect(url);
      const evicted = await postRaw(url, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), {
        "mcp-session-id": first.transport.sessionId!,
        "mcp-protocol-version": "2025-11-25",
      });

      // Assert
      expect(evicted.status).toBe(404);
      expect(logger.messages("info")).toContainEqual(
        expect.stringContaining("[bridge] stdio: closing least recently used session"),
      );
    });

    it("ends a session on DELETE", async () => {
      // Arrange
      const { url } = await startBridge();
      const { transport } = await connect(url);
      const sessionId = transport.sessionId!;

      // Act
      await transport.terminateSession();
      const after = await postRaw(url, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), {
        "mcp-session-id": sessionId,
      });

      // Assert
      expect(after.status).toBe(404);
    });
  });
});
