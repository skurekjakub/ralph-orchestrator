import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerType, type ServerConfig } from "../src/gateway-config.js";
import { buildLaunchCommand, ManagedServer, ServerStatus } from "../src/managed-server.js";
import { createRecordingLogger } from "./helpers/logger.js";

const WAIT = { timeout: 4000, interval: 10 };

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

describe("ManagedServer", () => {
  const started: ManagedServer[] = [];

  afterEach(() => {
    for (const server of started.splice(0)) server.stop();
  });

  describe("buildLaunchCommand", () => {
    it("passes the listen host and port to a custom server", () => {
      expect(buildLaunchCommand(config(), { host: "127.0.0.1", port: 19101 })).toEqual({
        command: "node",
        args: ["/opt/srv.js", "--transport", "http", "--host", "127.0.0.1", "--port", "19101"],
      });
    });

    it("wraps an npm server in supergateway on the listen port", () => {
      const npm = config({ type: ServerType.Npm, command: "playwright-mcp", args: ["--headless"] });

      expect(buildLaunchCommand(npm, { host: "127.0.0.1", port: 19103 })).toEqual({
        command: "supergateway",
        args: ["--stdio", "playwright-mcp --headless", "--outputTransport", "streamableHttp", "--port", "19103"],
      });
    });
  });

  describe("start", () => {
    it("marks the process running on a startup line and notifies onRunning", async () => {
      const onRunning = vi.fn();
      const server = new ManagedServer({
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

      server.start();

      await vi.waitFor(() => expect(server.status).toBe(ServerStatus.Running), WAIT);
      expect(onRunning).toHaveBeenCalledTimes(1);
    });

    it("restarts a process that cannot be spawned up to maxRestarts, then gives up", async () => {
      const logger = createRecordingLogger();
      const server = new ManagedServer({
        config: config({ command: "/nonexistent/mcp-server" }),
        listen: { host: "127.0.0.1", port: 1 },
        logger,
        maxRestarts: 2,
        restartDelayMs: 1,
      });
      started.push(server);

      server.start();

      await vi.waitFor(
        () => expect(logger.messages("error")).toContain("[gateway] srv exceeded max restarts (2), giving up"),
        WAIT,
      );
      expect(server.status).toBe(ServerStatus.Crashed);
      expect(server.restarts).toBe(2);
      expect(logger.messages("info").filter((line) => line.startsWith("[gateway] Restarting srv"))).toHaveLength(2);
    });

    it("does not restart a process stopped on purpose", async () => {
      const logger = createRecordingLogger();
      const server = new ManagedServer({
        config: config({ command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)", "--"] }),
        listen: { host: "127.0.0.1", port: 1 },
        logger,
        restartDelayMs: 1,
      });

      server.start();
      server.stop();

      await vi.waitFor(() => expect(logger.messages("info")).toContain("[gateway] Stopping srv"), WAIT);
      expect(server.status).toBe(ServerStatus.Stopped);
      expect(server.restarts).toBe(0);
    });
  });
});
