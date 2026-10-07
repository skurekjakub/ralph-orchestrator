import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerType, type ServerConfig } from "../src/gateway-config";
import { buildLaunchCommand, ManagedServer, ServerStatus, type ManagedServerOptions } from "../src/managed-server";
import { createRecordingLogger } from "./helpers/logger";

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    name: "srv",
    type: ServerType.Custom,
    port: 9101,
    command: "node",
    args: ["/opt/srv.js"],
    env: {},
    ...overrides,
  };
}

/** A server plus a promise that resolves the first time it reaches `status`. */
function serverReaching(status: ServerStatus, options: Omit<ManagedServerOptions, "onStatusChange">) {
  let reached!: () => void;
  const reachedStatus = new Promise<void>((resolve) => (reached = resolve));
  const server = new ManagedServer({
    ...options,
    onStatusChange: (next) => {
      if (next === status) reached();
    },
  });
  return { server, reachedStatus };
}

describe("ManagedServer", () => {
  const started: ManagedServer[] = [];

  afterEach(() => {
    for (const server of started.splice(0)) server.stop();
  });

  describe("buildLaunchCommand", () => {
    it("passes the listen host and port to a custom server", () => {
      // Act
      const launch = buildLaunchCommand(config(), { host: "127.0.0.1", port: 19101 });

      // Assert
      expect(launch).toEqual({
        command: "node",
        args: ["/opt/srv.js", "--transport", "http", "--host", "127.0.0.1", "--port", "19101"],
      });
    });

    it("wraps an npm server in supergateway on the listen port", () => {
      // Arrange
      const npm = config({ type: ServerType.Npm, command: "playwright-mcp", args: ["--headless"] });

      // Act
      const launch = buildLaunchCommand(npm, { host: "127.0.0.1", port: 19103 });

      // Assert
      expect(launch).toEqual({
        command: "supergateway",
        args: ["--stdio", "playwright-mcp --headless", "--outputTransport", "streamableHttp", "--port", "19103"],
      });
    });
  });

  describe("start", () => {
    it("marks the process running on a startup line and notifies onRunning", async () => {
      // Arrange
      const onRunning = vi.fn();
      const { server, reachedStatus } = serverReaching(ServerStatus.Running, {
        config: config({
          command: process.execPath,
          args: ["-e", "console.log('ready'); setInterval(() => {}, 1000)", "--"],
        }),
        listen: { host: "127.0.0.1", port: 1 },
        logger: createRecordingLogger(),
        onRunning,
        startupGraceMs: 60000,
      });
      started.push(server);

      // Act
      server.start();
      await reachedStatus;

      // Assert
      expect(server.status).toBe(ServerStatus.Running);
      expect(onRunning).toHaveBeenCalledTimes(1);
    });

    it("restarts a process that cannot be spawned up to maxRestarts, then fails", async () => {
      // Arrange
      const logger = createRecordingLogger();
      const { server, reachedStatus } = serverReaching(ServerStatus.Failed, {
        config: config({ command: "/nonexistent/mcp-server" }),
        listen: { host: "127.0.0.1", port: 1 },
        logger,
        maxRestarts: 2,
        restartDelayMs: 1,
      });
      started.push(server);

      // Act
      server.start();
      await reachedStatus;

      // Assert
      expect(server.restarts).toBe(2);
      expect(logger.messages("error")).toContain("[gateway] srv exceeded max restarts (2), giving up");
      expect(logger.messages("info").filter((line) => line.startsWith("[gateway] Restarting srv"))).toHaveLength(2);
    });

    it("does not restart a process stopped on purpose", async () => {
      // Arrange
      const logger = createRecordingLogger();
      const { server, reachedStatus } = serverReaching(ServerStatus.Running, {
        config: config({
          command: process.execPath,
          args: ["-e", "console.log('ready'); setInterval(() => {}, 1000)", "--"],
        }),
        listen: { host: "127.0.0.1", port: 1 },
        logger,
        restartDelayMs: 1,
        startupGraceMs: 60000,
      });
      server.start();
      await reachedStatus;

      // Act
      server.stop();

      // Assert
      expect(server.status).toBe(ServerStatus.Stopped);
      expect(server.restarts).toBe(0);
      expect(logger.messages("info")).toContain("[gateway] Stopping srv");
    });
  });

  describe("refuse", () => {
    it("stops the process for good and records why", async () => {
      // Arrange
      const { server, reachedStatus } = serverReaching(ServerStatus.Running, {
        config: config({
          command: process.execPath,
          args: ["-e", "console.log('ready'); setInterval(() => {}, 1000)", "--"],
        }),
        listen: { host: "127.0.0.1", port: 1 },
        logger: createRecordingLogger(),
        restartDelayMs: 1,
        startupGraceMs: 60000,
      });
      server.start();
      await reachedStatus;

      // Act
      server.refuse("upstream reachable off loopback");

      // Assert
      expect(server.status).toBe(ServerStatus.Refused);
      expect(server.lastError).toBe("upstream reachable off loopback");
      expect(server.restarts).toBe(0);
    });
  });
});
