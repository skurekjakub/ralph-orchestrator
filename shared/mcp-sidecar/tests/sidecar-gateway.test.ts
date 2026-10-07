import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ProtocolErrorCode } from "@modelcontextprotocol/client";
import { parseGatewayConfig, UPSTREAM_PORT_OFFSET } from "../src/gateway-config";
import { ServerStatus } from "../src/managed-server";
import { SidecarGateway } from "../src/sidecar-gateway";
import {
  DriftStatus,
  ExposureStatus,
  findExposedAddresses,
  listUpstreamToolNames,
  nonLoopbackAddresses,
} from "../src/upstream-monitor";
import { waitForHealth } from "./helpers/gateway";
import { createRecordingLogger } from "./helpers/logger";
import { connectClient, postRaw } from "./helpers/mcp-client";
import { listen } from "./helpers/upstream";

const FIXTURE = fileURLToPath(new URL("./fixtures/custom-server.mjs", import.meta.url));
const NO_WAIT = (): Promise<void> => Promise.resolve();
const NEVER = (): Promise<void> => new Promise(() => undefined);
const IPV4_ADDRESSES = nonLoopbackAddresses().filter((address) => !address.includes(":"));

/** A free port whose upstream partner (`port + UPSTREAM_PORT_OFFSET`) is free too. */
async function freeServerPort(): Promise<number> {
  for (;;) {
    const port = await freePort();
    if (port + UPSTREAM_PORT_OFFSET <= 65535 && (await isFree(port + UPSTREAM_PORT_OFFSET))) return port;
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server, "127.0.0.1");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

describe("SidecarGateway", () => {
  const cleanups: (() => Promise<unknown>)[] = [];

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()!();
  });

  async function startGateway(serverOverrides: Record<string, unknown>, sleep = NO_WAIT) {
    const port = await freeServerPort();
    const healthPort = await freePort();
    const logger = createRecordingLogger();
    const config = parseGatewayConfig(
      {
        servers: [
          {
            name: "fixture",
            type: "custom",
            port,
            command: process.execPath,
            args: [FIXTURE],
            ...serverOverrides,
            env: { FIXTURE_TOOLS: "echo,secret", ...(serverOverrides.env as Record<string, string> | undefined) },
          },
        ],
      },
      healthPort,
    );
    const gateway = new SidecarGateway({
      config,
      logger,
      healthListen: { host: "127.0.0.1", port: healthPort },
      processOptions: { restartDelayMs: 1, startupGraceMs: 60000 },
      monitorOptions: { maxAttempts: 2, timeoutMs: 2000, sleep },
    });
    cleanups.push(() => gateway.stop());
    return { gateway, logger, port, healthPort, url: new URL(`http://127.0.0.1:${port}/mcp`) };
  }

  it("serves a server with an allowlist through the proxy and reports its tool-filter state", async () => {
    // Arrange
    const { gateway, port, healthPort, url } = await startGateway({ allowedTools: ["echo", "ghost"] });
    await gateway.start();
    await waitForHealth(gateway, (report) => report.healthy);
    const { client } = await connectClient(url);
    cleanups.push(() => client.close());

    // Act
    const listed = await client.listTools();
    const denied = client.callTool({ name: "secret", arguments: {} });

    // Assert
    expect(listed.tools.map((tool) => tool.name)).toEqual(["echo"]);
    await expect(denied).rejects.toMatchObject({ code: ProtocolErrorCode.InvalidParams });
    const response = await fetch(`http://127.0.0.1:${healthPort}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      healthy: true,
      servers: {
        fixture: {
          status: ServerStatus.Running,
          port,
          restarts: 0,
          lastError: null,
          toolFilter: {
            upstreamPort: port + UPSTREAM_PORT_OFFSET,
            allowedTools: ["echo", "ghost"],
            deniedCalls: 1,
            drift: expect.objectContaining({
              status: DriftStatus.Drift,
              missingTools: ["ghost"],
              upstreamToolCount: 2,
            }),
            exposure: expect.objectContaining({ status: ExposureStatus.LoopbackOnly, addresses: [] }),
          },
        },
      },
      warnings: ["fixture: allowlisted tools not exposed by the server: ghost"],
    });
  });

  it.skipIf(nonLoopbackAddresses().length === 0)(
    "runs a filtered server at its upstream port, reachable on loopback only",
    async () => {
      // Arrange
      const { gateway, port } = await startGateway({ allowedTools: ["echo"] });
      const upstreamPort = port + UPSTREAM_PORT_OFFSET;

      // Act
      await gateway.start();
      await waitForHealth(gateway, (report) => report.healthy);

      // Assert
      expect(await listUpstreamToolNames(new URL(`http://127.0.0.1:${upstreamPort}/mcp`), 2000)).toEqual([
        "echo",
        "secret",
      ]);
      expect(await findExposedAddresses(upstreamPort, 2000)).toEqual([]);
    },
  );

  it("runs a server without an allowlist directly on its agent-facing port", async () => {
    // Arrange
    const { gateway, url } = await startGateway({});
    await gateway.start();
    await waitForHealth(gateway, (report) => report.healthy);

    // Act
    const { client } = await connectClient(url);
    cleanups.push(() => client.close());

    // Assert
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["echo", "secret"]);
    expect(gateway.healthReport().servers.fixture).not.toHaveProperty("toolFilter");
  });

  it("reports a server whose proxy cannot listen as crashed and does not launch it", async () => {
    // Arrange
    const { gateway, logger, port } = await startGateway({ allowedTools: ["echo"] });
    const squatter: Server = createServer();
    await new Promise<void>((resolve) => squatter.listen(port, "0.0.0.0", () => resolve()));
    cleanups.push(() => new Promise<void>((resolve) => squatter.close(() => resolve())));

    // Act
    await gateway.start();
    const report = gateway.healthReport();

    // Assert
    expect(report.healthy).toBe(false);
    expect(report.servers.fixture).toMatchObject({
      status: ServerStatus.Crashed,
      lastError: expect.stringContaining(`tool-filter proxy failed to listen on port ${port}`),
    });
    expect(logger.messages("info").some((line) => line.startsWith("[gateway] Starting fixture"))).toBe(false);
  });

  describe("failing closed", () => {
    it("answers 503 while a running filtered server is not yet verified", async () => {
      // Arrange
      const { gateway, healthPort } = await startGateway(
        { allowedTools: ["echo"], env: { FIXTURE_MCP_STATUS: "500" } },
        NEVER,
      );

      // Act
      await gateway.start();
      const report = await waitForHealth(gateway, (r) => r.servers.fixture.status === ServerStatus.Running);
      const response = await fetch(`http://127.0.0.1:${healthPort}/health`);

      // Assert
      expect(report.servers.fixture.toolFilter?.exposure.status).toBe(ExposureStatus.Pending);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ healthy: false });
    });

    it("stays unhealthy when the server's tools cannot be listed through loopback", async () => {
      // Arrange
      const { gateway } = await startGateway({ allowedTools: ["echo"], env: { FIXTURE_MCP_STATUS: "500" } });

      // Act
      await gateway.start();
      const report = await waitForHealth(
        gateway,
        (r) => r.servers.fixture.toolFilter?.exposure.status === ExposureStatus.LoopbackOnly,
      );

      // Assert
      expect(report.healthy).toBe(false);
      expect(report.servers.fixture.toolFilter?.drift.status).toBe(DriftStatus.Error);
      expect(report.warnings).toEqual([expect.stringContaining("fixture: could not list the server's tools")]);
    });

    it.skipIf(nonLoopbackAddresses().length === 0)(
      "refuses a server whose upstream port is reachable off loopback and turns health to 503",
      async () => {
        // Arrange
        const { gateway, logger, port, healthPort, url } = await startGateway({
          allowedTools: ["echo"],
          env: { FIXTURE_BIND_HOST: "0.0.0.0" },
        });
        const upstreamPort = port + UPSTREAM_PORT_OFFSET;

        // Act
        await gateway.start();
        const report = await waitForHealth(gateway, (r) => r.servers.fixture.status === ServerStatus.Refused);
        const health = await fetch(`http://127.0.0.1:${healthPort}/health`);
        const call = await postRaw(url, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));

        // Assert
        expect(health.status).toBe(503);
        expect(report.servers.fixture.toolFilter?.exposure.status).toBe(ExposureStatus.Exposed);
        expect(report.servers.fixture.lastError).toContain(
          `refusing to serve fixture: its upstream port ${upstreamPort} accepts connections on`,
        );
        expect(logger.messages("error")).toContainEqual(
          expect.stringContaining("the server must bind only the --host address 127.0.0.1"),
        );
        expect(call.status).toBe(503);
        expect(await call.json()).toMatchObject({
          error: { code: ProtocolErrorCode.InternalError, message: expect.stringContaining("refusing to serve") },
        });
      },
    );

    it.skipIf(IPV4_ADDRESSES.length === 0)(
      "refuses a server bound only to a non-loopback address, naming why",
      async () => {
        // Arrange
        const { gateway } = await startGateway({
          allowedTools: ["echo"],
          env: { FIXTURE_BIND_HOST: IPV4_ADDRESSES[0] },
        });

        // Act
        await gateway.start();
        const report = await waitForHealth(gateway, (r) => r.servers.fixture.status === ServerStatus.Refused);

        // Assert
        expect(report.healthy).toBe(false);
        expect(report.servers.fixture.lastError).toContain("and it does not answer MCP on 127.0.0.1");
      },
    );
  });
});
