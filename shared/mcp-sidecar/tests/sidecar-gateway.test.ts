import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtocolErrorCode } from "@modelcontextprotocol/client";
import { parseGatewayConfig, UPSTREAM_PORT_OFFSET } from "../src/gateway-config";
import { ServerStatus } from "../src/managed-server";
import { SidecarGateway } from "../src/sidecar-gateway";
import { DriftStatus, ExposureStatus } from "../src/upstream-monitor";
import { createRecordingLogger } from "./helpers/logger";
import { connectClient } from "./helpers/mcp-client";
import { listen } from "./helpers/upstream";

const FIXTURE = fileURLToPath(new URL("./fixtures/custom-server.mjs", import.meta.url));
const WAIT = { timeout: 4000, interval: 25 };

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

  async function startGateway(serverOverrides: Record<string, unknown>) {
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
            env: { FIXTURE_TOOLS: "echo,secret" },
            ...serverOverrides,
          },
        ],
      },
      healthPort,
    );
    const gateway = new SidecarGateway({
      config,
      logger,
      healthListen: { host: "127.0.0.1", port: healthPort },
      processOptions: { restartDelayMs: 10 },
      monitorOptions: { maxAttempts: 20, retryDelayMs: 25, timeoutMs: 2000 },
    });
    cleanups.push(() => gateway.stop());
    return { gateway, logger, port, healthPort, url: new URL(`http://127.0.0.1:${port}/mcp`) };
  }

  it("serves a server with an allowlist through the proxy and reports its tool-filter state", async () => {
    const { gateway, port, healthPort, url } = await startGateway({ allowedTools: ["echo", "ghost"] });
    await gateway.start();
    await vi.waitFor(
      () => expect(gateway.healthReport().servers.fixture.toolFilter?.exposure.status).not.toBe(ExposureStatus.Pending),
      WAIT,
    );

    const { client } = await connectClient(url);
    cleanups.push(() => client.close());
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["echo"]);
    await expect(client.callTool({ name: "secret", arguments: {} })).rejects.toMatchObject({
      code: ProtocolErrorCode.InvalidParams,
    });

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

  it("launches a filtered server on loopback at its upstream port", async () => {
    const { gateway, logger, port } = await startGateway({ allowedTools: ["echo"] });
    await gateway.start();

    expect(logger.messages("info")).toContain(
      `[gateway] Starting fixture (custom) on 127.0.0.1:${port + UPSTREAM_PORT_OFFSET}: ${process.execPath} ${FIXTURE} --transport http --host 127.0.0.1 --port ${port + UPSTREAM_PORT_OFFSET}`,
    );
  });

  it("runs a server without an allowlist directly on its agent-facing port", async () => {
    const { gateway, url } = await startGateway({});
    await gateway.start();
    await vi.waitFor(() => expect(gateway.healthReport().healthy).toBe(true), WAIT);

    const { client } = await vi.waitFor(() => connectClient(url), WAIT);
    cleanups.push(() => client.close());

    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["echo", "secret"]);
    expect(gateway.healthReport().servers.fixture).not.toHaveProperty("toolFilter");
  });

  it("reports a server whose proxy cannot listen as crashed and does not launch it", async () => {
    const { gateway, logger, port } = await startGateway({ allowedTools: ["echo"] });
    const squatter: Server = createServer();
    await new Promise<void>((resolve) => squatter.listen(port, "0.0.0.0", () => resolve()));
    cleanups.push(() => new Promise<void>((resolve) => squatter.close(() => resolve())));

    await gateway.start();
    const report = gateway.healthReport();

    expect(report.healthy).toBe(false);
    expect(report.servers.fixture).toMatchObject({
      status: ServerStatus.Crashed,
      lastError: expect.stringContaining(`tool-filter proxy failed to listen on port ${port}`),
    });
    expect(logger.messages("info").some((line) => line.startsWith("[gateway] Starting fixture"))).toBe(false);
  });
});
