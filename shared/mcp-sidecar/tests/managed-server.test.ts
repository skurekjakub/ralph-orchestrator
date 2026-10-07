import { describe, expect, it, vi } from "vitest";
import {
  ManagedServer,
  ServerStatus,
  type InstanceObserver,
  type ManagedServerOptions,
  type ServerLauncher,
} from "../src/managed-server";
import { createStatusRecorder } from "./helpers/lifecycle";
import { createRecordingLogger } from "./helpers/logger";

/** A launcher whose instances the test drives by hand. */
function fakeLauncher() {
  const launched: {
    observer: InstanceObserver;
    stop: ReturnType<typeof vi.fn>;
    forceKill: ReturnType<typeof vi.fn>;
  }[] = [];
  const launcher: ServerLauncher = {
    description: "fake-server --flag",
    launch: (observer) => {
      const instance = { observer, stop: vi.fn(), forceKill: vi.fn() };
      launched.push(instance);
      return instance;
    },
  };
  return { launcher, launched, latest: () => launched[launched.length - 1] };
}

function managedServer(overrides: Partial<ManagedServerOptions> = {}) {
  const fake = fakeLauncher();
  const logger = createRecordingLogger();
  const statuses = createStatusRecorder();
  const server = new ManagedServer({
    name: "srv",
    launcher: fake.launcher,
    logger,
    restartDelayMs: 1,
    onStatusChange: statuses.onStatusChange,
    ...overrides,
  });
  return { server, logger, statuses, ...fake };
}

describe("ManagedServer", () => {
  describe("start", () => {
    it("logs what it launches and becomes running when the instance says so", () => {
      // Arrange
      const onRunning = vi.fn();
      const { server, logger, latest, statuses } = managedServer({ onRunning });

      // Act
      server.start();
      latest().observer.running();

      // Assert
      expect(server.status).toBe(ServerStatus.Running);
      expect(statuses.history).toEqual([ServerStatus.Starting, ServerStatus.Running]);
      expect(onRunning).toHaveBeenCalledTimes(1);
      expect(logger.messages("info")).toContain("[gateway] Starting srv: fake-server --flag");
    });

    it("records stderr as the last error", () => {
      // Arrange
      const { server, logger, latest } = managedServer();
      server.start();

      // Act
      latest().observer.stderr("bind failed");

      // Assert
      expect(server.lastError).toBe("bind failed");
      expect(logger.messages("error")).toContain("[srv] bind failed");
    });
  });

  describe("restarts", () => {
    it("restarts an instance that exits unexpectedly", async () => {
      // Arrange
      const { server, launched, logger, statuses } = managedServer();
      server.start();
      launched[0].observer.running();

      // Act
      launched[0].observer.exited("exited (pid=1, code=1, signal=null)");
      await statuses.reached(ServerStatus.Starting, 2);

      // Assert
      expect(launched).toHaveLength(2);
      expect(server.restarts).toBe(1);
      expect(logger.messages("error")).toContain("[gateway] srv exited (pid=1, code=1, signal=null) (lastError=none)");
    });

    it("fails once maxRestarts restarts are used up", async () => {
      // Arrange
      const { server, launched, logger, statuses } = managedServer({ maxRestarts: 2 });
      server.start();

      // Act
      launched[0].observer.exited("failed to spawn: ENOENT");
      await statuses.reached(ServerStatus.Starting, 2);
      launched[1].observer.exited("failed to spawn: ENOENT");
      await statuses.reached(ServerStatus.Starting, 3);
      launched[2].observer.exited("failed to spawn: ENOENT");

      // Assert
      expect(server.status).toBe(ServerStatus.Failed);
      expect(server.restarts).toBe(2);
      expect(logger.messages("error")).toContain("[gateway] srv exceeded max restarts (2), giving up");
    });

    it("ignores reports from an instance it has replaced", async () => {
      // Arrange
      const { server, launched, statuses } = managedServer();
      server.start();
      launched[0].observer.exited("exited");
      await statuses.reached(ServerStatus.Starting, 2);

      // Act
      launched[0].observer.running();
      launched[0].observer.exited("exited again");

      // Assert
      expect(server.status).toBe(ServerStatus.Starting);
      expect(server.restarts).toBe(1);
    });
  });

  describe("stop", () => {
    it("stops the instance and does not restart it when it exits", () => {
      // Arrange
      const { server, launched } = managedServer();
      server.start();
      launched[0].observer.running();

      // Act
      server.stop();
      launched[0].observer.exited("exited (signal=SIGTERM)");

      // Assert
      expect(launched[0].stop).toHaveBeenCalledTimes(1);
      expect(server.status).toBe(ServerStatus.Stopped);
      expect(server.restarts).toBe(0);
      expect(launched).toHaveLength(1);
    });

    it("forwards forceKill to the running instance", () => {
      // Arrange
      const { server, launched } = managedServer();
      server.start();

      // Act
      server.forceKill();

      // Assert
      expect(launched[0].forceKill).toHaveBeenCalledTimes(1);
    });
  });

  describe("refuse", () => {
    it("stops the instance for good and records why", () => {
      // Arrange
      const { server, launched } = managedServer();
      server.start();
      launched[0].observer.running();

      // Act
      server.refuse("upstream reachable off loopback");
      launched[0].observer.exited("exited (signal=SIGTERM)");

      // Assert
      expect(server.status).toBe(ServerStatus.Refused);
      expect(server.lastError).toBe("upstream reachable off loopback");
      expect(server.restarts).toBe(0);
      expect(launched).toHaveLength(1);
    });
  });
});
