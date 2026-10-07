import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolAllowlist } from "../src/tool-policy";
import {
  DriftStatus,
  ExposureStatus,
  listUpstreamToolNames,
  nonLoopbackAddresses,
  UpstreamMonitor,
} from "../src/upstream-monitor";
import { createRecordingLogger } from "./helpers/logger";
import { listen, startUpstream, UpstreamMode, type UpstreamOptions } from "./helpers/upstream";

const FAST = { maxAttempts: 2, timeoutMs: 2000, sleep: () => Promise.resolve() };

describe("UpstreamMonitor", () => {
  const cleanups: (() => Promise<unknown>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  async function upstream(options: Partial<UpstreamOptions> = {}) {
    const started = await startUpstream({
      mode: UpstreamMode.StatelessSse,
      tools: ["echo", "search", "secret"],
      ...options,
    });
    cleanups.push(() => started.close());
    return started;
  }

  function monitorFor(port: number, allowed: string[]) {
    const logger = createRecordingLogger();
    const url = new URL(`http://127.0.0.1:${port}/mcp`);
    const monitor = new UpstreamMonitor({
      ...FAST,
      serverName: "test",
      listToolNames: (timeoutMs) => listUpstreamToolNames(url, timeoutMs),
      exposurePort: port,
      allowlist: new ToolAllowlist(allowed),
      logger,
    });
    return { monitor, logger };
  }

  async function deadPort(): Promise<number> {
    const server = createServer();
    const port = await listen(server, "127.0.0.1");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
  }

  describe("drift", () => {
    it("reports ok when the server exposes every allowlisted tool", async () => {
      const { port } = await upstream();
      const { monitor, logger } = monitorFor(port, ["echo", "search"]);

      await monitor.check();

      expect(monitor.drift).toMatchObject({
        status: DriftStatus.Ok,
        missingTools: [],
        upstreamToolCount: 3,
        error: null,
      });
      expect(monitor.drift.checkedAt).toEqual(expect.any(String));
      expect(logger.messages("info")).toContain("[proxy] test: upstream exposes 3 tool(s); 2 allowlisted, 1 hidden");
      expect(logger.messages("warn")).toEqual([]);
    });

    it("reports allowlisted tools the server does not expose", async () => {
      const { port } = await upstream();
      const { monitor, logger } = monitorFor(port, ["echo", "ghost", "phantom"]);

      await monitor.check();

      expect(monitor.drift).toMatchObject({ status: DriftStatus.Drift, missingTools: ["ghost", "phantom"] });
      expect(logger.messages("warn")).toEqual([
        expect.stringContaining("[guard] test: allowlist drift: ghost, phantom"),
      ]);
    });

    it("follows tools/list pagination", async () => {
      const { port } = await upstream({ pageSize: 1 });
      const { monitor } = monitorFor(port, ["secret"]);

      await monitor.check();

      expect(monitor.drift).toMatchObject({ status: DriftStatus.Ok, upstreamToolCount: 3 });
    });

    it("reports an error once every attempt to reach the server failed, and still probes exposure", async () => {
      // Arrange
      const { monitor, logger } = monitorFor(await deadPort(), ["echo"]);

      // Act
      await monitor.check();

      // Assert
      expect(monitor.drift).toMatchObject({ status: DriftStatus.Error, error: expect.any(String) });
      expect(monitor.exposure.status).toBe(ExposureStatus.LoopbackOnly);
      expect(logger.messages("warn")).toEqual([
        expect.stringContaining("[guard] test: could not list upstream tools after 2 attempts"),
      ]);
    });

    it("leaves the state pending when a round is cancelled", async () => {
      const { monitor } = monitorFor(await deadPort(), ["echo"]);

      const round = monitor.check();
      monitor.cancel();
      await round;

      expect(monitor.drift.status).toBe(DriftStatus.Pending);
    });
  });

  describe("exposure", () => {
    it("reports a server bound to loopback as loopback-only", async () => {
      const { port } = await upstream();
      const { monitor } = monitorFor(port, ["echo"]);

      await monitor.check();

      expect(monitor.exposure).toMatchObject({ status: ExposureStatus.LoopbackOnly, addresses: [] });
    });

    it.skipIf(nonLoopbackAddresses().length === 0)(
      "reports a server bound to every interface as exposed, naming the addresses",
      async () => {
        const { port } = await upstream({ host: "0.0.0.0" });
        const { monitor, logger } = monitorFor(port, ["echo"]);

        await monitor.check();

        expect(monitor.exposure.status).toBe(ExposureStatus.Exposed);
        expect(monitor.exposure.addresses.length).toBeGreaterThan(0);
        expect(logger.messages("error")).toEqual([
          expect.stringContaining(`[guard] test: upstream port ${port} accepts connections on`),
        ]);
      },
    );
  });

  describe("stdio servers", () => {
    it("lists through the given function and reports that there is no listener to probe", async () => {
      // Arrange
      const monitor = new UpstreamMonitor({
        ...FAST,
        serverName: "test",
        listToolNames: async () => ["echo"],
        exposurePort: null,
        allowlist: new ToolAllowlist(["echo"]),
        logger: createRecordingLogger(),
      });

      // Act
      await monitor.check();

      // Assert
      expect(monitor.drift).toMatchObject({ status: DriftStatus.Ok, upstreamToolCount: 1 });
      expect(monitor.exposure).toMatchObject({ status: ExposureStatus.NoListener, addresses: [] });
    });

    it("retries a failing listing up to maxAttempts", async () => {
      // Arrange
      const listToolNames = vi.fn(async () => {
        throw new Error("not connected");
      });
      const monitor = new UpstreamMonitor({
        ...FAST,
        serverName: "test",
        listToolNames,
        exposurePort: null,
        allowlist: new ToolAllowlist(["echo"]),
        logger: createRecordingLogger(),
      });

      // Act
      await monitor.check();

      // Assert
      expect(listToolNames).toHaveBeenCalledTimes(FAST.maxAttempts);
      expect(monitor.drift).toMatchObject({ status: DriftStatus.Error, error: "not connected" });
    });
  });

  describe("listUpstreamToolNames", () => {
    it("ends the session it opened on a stateful server", async () => {
      const { url, closedSessions } = await upstream({ mode: UpstreamMode.Stateful });

      expect(await listUpstreamToolNames(url, 2000)).toEqual(["echo", "search", "secret"]);
      expect(closedSessions).toHaveLength(1);
    });
  });
});
