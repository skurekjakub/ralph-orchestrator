import { describe, expect, it } from "vitest";
import { ServerType, type ServerConfig } from "../src/gateway-config";
import { buildLaunchCommand, HttpServerLauncher } from "../src/http-launcher";
import { createRecordingObserver } from "./helpers/lifecycle";
import { createRecordingLogger } from "./helpers/logger";

const LISTEN = { host: "127.0.0.1", port: 19101 };

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

/** A `node -e` script; the trailing `--` keeps the appended launch flags away from node's own options. */
function nodeScript(script: string): Partial<ServerConfig> {
  return { command: process.execPath, args: ["-e", script, "--"] };
}

function launch(overrides: Partial<ServerConfig>) {
  const logger = createRecordingLogger();
  const launcher = new HttpServerLauncher({ config: config(overrides), listen: LISTEN, logger, startupGraceMs: 60000 });
  const recording = createRecordingObserver();
  const instance = launcher.launch(recording.observer);
  return { ...recording, instance, logger };
}

describe("HttpServerLauncher", () => {
  describe("buildLaunchCommand", () => {
    it("appends the transport, host and port to the server's own command", () => {
      // Act
      const command = buildLaunchCommand(config(), LISTEN);

      // Assert
      expect(command).toEqual({
        command: "node",
        args: ["/opt/srv.js", "--transport", "http", "--host", "127.0.0.1", "--port", "19101"],
      });
    });
  });

  describe("launch", () => {
    it("reports running on a startup line and passes the launch flags to the process", async () => {
      // Arrange & Act
      const { running, instance, logger } = launch(
        nodeScript("console.log('listening ' + process.argv.slice(1).join(' ')); setInterval(() => {}, 1000)"),
      );
      await running;
      instance.stop();

      // Assert
      expect(logger.messages("info")).toContain("[srv] listening --transport http --host 127.0.0.1 --port 19101");
    });

    it("reports stderr output and the exit of a process that dies", async () => {
      // Arrange & Act
      const { exited, stderr } = launch(nodeScript("console.error('no credentials'); process.exit(3)"));
      const description = await exited;

      // Assert
      expect(stderr).toEqual(["no credentials"]);
      expect(description).toMatch(/^exited \(pid=\d+, code=3, signal=null\)$/);
    });

    it("reports a process that cannot be spawned as exited", async () => {
      // Arrange & Act
      const { exited } = launch({ command: "/nonexistent/mcp-server" });

      // Assert
      expect(await exited).toContain("failed to spawn");
    });

    it("ends the process with SIGTERM on stop", async () => {
      // Arrange
      const { running, exited, instance } = launch(nodeScript("console.log('ready'); setInterval(() => {}, 1000)"));
      await running;

      // Act
      instance.stop();

      // Assert
      expect(await exited).toContain("signal=SIGTERM");
    });
  });
});
