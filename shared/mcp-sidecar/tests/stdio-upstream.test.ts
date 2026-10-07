import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ProtocolErrorCode, type JSONRPCNotification } from "@modelcontextprotocol/client";
import { ServerType, type ServerConfig } from "../src/gateway-config";
import type { ServerInstance } from "../src/managed-server";
import { StdioUpstream, type UpstreamReply } from "../src/stdio-upstream";
import { createRecordingObserver } from "./helpers/lifecycle";
import { createRecordingLogger } from "./helpers/logger";

const FIXTURE = fileURLToPath(new URL("./fixtures/stdio-server.mjs", import.meta.url));

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    name: "stdio",
    type: ServerType.Npm,
    port: 9103,
    command: process.execPath,
    args: [FIXTURE],
    env: {},
    allowedTools: ["echo"],
    ...overrides,
  };
}

function textOf(reply: UpstreamReply): string {
  if ("error" in reply) throw new Error(`expected a result, got ${JSON.stringify(reply.error)}`);
  const { content } = reply.result as { content: { text: string }[] };
  return content[0].text;
}

describe("StdioUpstream", () => {
  const instances: ServerInstance[] = [];

  afterEach(() => {
    for (const instance of instances.splice(0)) instance.stop();
  });

  function launch(overrides: Partial<ServerConfig> = {}, handshakeTimeoutMs?: number) {
    const logger = createRecordingLogger();
    const upstream = new StdioUpstream({ config: config(overrides), logger, handshakeTimeoutMs });
    const recording = createRecordingObserver();
    instances.push(upstream.launch(recording.observer));
    return { upstream, logger, ...recording };
  }

  function callTool(upstream: StdioUpstream, name: string, options = {}): Promise<UpstreamReply> {
    return upstream.request("tools/call", { name, arguments: {} }, options);
  }

  describe("launch", () => {
    it("completes the handshake once and reports running", async () => {
      // Arrange
      const { upstream, running, logger } = launch();

      // Act
      await running;

      // Assert
      expect(upstream.handshake).toMatchObject({
        protocolVersion: expect.any(String),
        result: { serverInfo: { name: "stdio-fixture" }, capabilities: { tools: expect.any(Object) } },
      });
      expect(logger.messages("info")).toContainEqual(
        expect.stringContaining("[bridge] stdio: connected to stdio-fixture 1.0.0"),
      );
    });

    it("reports a command that cannot be spawned as exited", async () => {
      // Arrange
      const { exited } = launch({ command: "/nonexistent/mcp-server" });

      // Act
      const description = await exited;

      // Assert
      expect(description).toContain("failed to start");
    });

    it("fails the handshake when the server answers initialize with an error", async () => {
      // Arrange
      const answerWithError =
        "process.stdin.once('data', (d) => { const { id } = JSON.parse(d); " +
        "process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: 'no browser' } }) + '\\n'); " +
        "setInterval(() => {}, 1000); })";
      const { exited } = launch({ args: ["-e", answerWithError] });

      // Act
      const description = await exited;

      // Assert
      expect(description).toBe("failed to start: initialize failed: no browser");
    });

    it("fails the handshake when the server does not answer in time", async () => {
      // Arrange
      const { exited } = launch({ args: ["-e", "setInterval(() => {}, 1000)"] }, 1);

      // Act
      const description = await exited;

      // Assert
      expect(description).toContain("failed to start");
    });
  });

  describe("request", () => {
    it("keeps one process, and its state, across requests", async () => {
      // Arrange
      const { upstream, running } = launch();
      await running;

      // Act
      const first = await callTool(upstream, "count");
      const second = await callTool(upstream, "count");

      // Assert
      expect([textOf(first), textOf(second)]).toEqual(["1", "2"]);
    });

    it("relays progress notifications without the token it allocated", async () => {
      // Arrange
      const { upstream, running } = launch();
      await running;
      const progress: Record<string, unknown>[] = [];

      // Act
      const reply = await callTool(upstream, "progress", {
        onProgress: (params: Record<string, unknown>) => progress.push(params),
      });

      // Assert
      expect(textOf(reply)).toBe("done");
      expect(progress).toEqual([
        { progress: 1, total: 2 },
        { progress: 2, total: 2 },
      ]);
    });

    it("answers the server's ping requests", async () => {
      // Arrange
      const { upstream, running } = launch();
      await running;

      // Act
      const reply = await callTool(upstream, "ping_client");

      // Assert
      expect(textOf(reply)).toBe("pong");
    });

    it("sends notifications/cancelled to the server when a request is aborted", async () => {
      // Arrange
      const { upstream, running } = launch();
      await running;
      const controller = new AbortController();
      let markWaiting!: () => void;
      const serverWaiting = new Promise<void>((resolve) => (markWaiting = resolve));
      const waiting = callTool(upstream, "wait", { signal: controller.signal, onProgress: () => markWaiting() });
      await serverWaiting;

      // Act
      controller.abort(new Error("agent gave up"));

      // Assert
      await expect(waiting).rejects.toThrow("agent gave up");
      expect(textOf(await callTool(upstream, "cancellations"))).toBe("1");
    });

    it("hands other server notifications to listeners", async () => {
      // Arrange
      const { upstream, running } = launch();
      await running;
      const notifications: JSONRPCNotification[] = [];
      upstream.onNotification((notification) => notifications.push(notification));

      // Act
      await callTool(upstream, "announce");

      // Assert
      expect(notifications).toEqual([{ jsonrpc: "2.0", method: "notifications/tools/list_changed" }]);
    });

    it("logs a malformed message from the server and keeps serving", async () => {
      // Arrange
      const { upstream, running, logger } = launch();
      await running;

      // Act
      const reply = await callTool(upstream, "garbage");

      // Assert
      expect(textOf(reply)).toBe("after garbage");
      expect(logger.messages("warn")).toEqual([expect.stringMatching(/^\[bridge\] stdio: /)]);
    });

    it("answers in-flight requests with an error when the process exits, and reports the exit", async () => {
      // Arrange
      const { upstream, running, exited } = launch();
      await running;

      // Act
      const reply = await callTool(upstream, "crash");

      // Assert
      expect(reply).toEqual({
        error: { code: ProtocolErrorCode.InternalError, message: "MCP server stdio exited before answering" },
      });
      expect(await exited).toMatch(/^exited \(pid=\d+\)$/);
      expect(upstream.handshake).toBeUndefined();
    });

    it("answers with an error while no process is connected", async () => {
      // Arrange
      const upstream = new StdioUpstream({ config: config(), logger: createRecordingLogger() });

      // Act
      const reply = await callTool(upstream, "echo");

      // Assert
      expect(reply).toEqual({
        error: { code: ProtocolErrorCode.InternalError, message: "MCP server stdio is not running" },
      });
    });
  });

  describe("listToolNames", () => {
    it("lists every tool of the running process", async () => {
      // Arrange
      const { upstream, running } = launch({ env: { FIXTURE_TOOLS: "echo" } });
      await running;

      // Act
      const names = await upstream.listToolNames(2000);

      // Assert
      expect(names).toEqual([
        "echo",
        "count",
        "crash",
        "progress",
        "announce",
        "garbage",
        "wait",
        "cancellations",
        "ping_client",
      ]);
    });
  });
});
