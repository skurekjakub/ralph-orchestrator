import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildPackage,
  listToolNames,
  manifestTools,
  nonLoopbackIPv4Addresses,
  reachableNonLoopbackAddresses,
  runBuiltServerToExit,
  startBuiltServer,
  type RunningServer,
} from "../../common/testing/built-server";

const PACKAGE_DIR = resolve(import.meta.dirname, "..");
/** Placeholder values that let the server start without reaching any external service. */
const ENV: Record<string, string> = {
  NODEBB_API_URL: "http://127.0.0.1:9",
  NODEBB_API_TOKEN: "test-token",
  NODEBB_CATEGORY_ID: "1",
};
const BUILD_TIMEOUT_MS = 60_000;

describe("built ralphchives-read server", () => {
  const running: RunningServer[] = [];

  beforeAll(() => buildPackage(PACKAGE_DIR), BUILD_TIMEOUT_MS);

  afterEach(async () => {
    await Promise.all(running.splice(0).map((server) => server.stop()));
  });

  it("serves the manifest's tools over Streamable HTTP", async () => {
    // Arrange
    const server = await startBuiltServer(PACKAGE_DIR, { host: "127.0.0.1", env: ENV });
    running.push(server);

    // Act
    const tools = await listToolNames(server.baseUrl);

    // Assert
    expect(tools.toSorted()).toEqual((await manifestTools(PACKAGE_DIR)).toSorted());
  });

  it("listens only on the --host address", async () => {
    // Arrange
    const server = await startBuiltServer(PACKAGE_DIR, { host: "127.0.0.1", env: ENV });
    running.push(server);

    // Act
    const exposed = await reachableNonLoopbackAddresses(server.port);

    // Assert
    expect(server.host).toBe("127.0.0.1");
    expect(exposed).toEqual([]);
  });

  it.skipIf(nonLoopbackIPv4Addresses().length === 0)("listens on every interface without --host", async () => {
    // Arrange
    const server = await startBuiltServer(PACKAGE_DIR, { env: ENV });
    running.push(server);

    // Act
    const exposed = await reachableNonLoopbackAddresses(server.port);

    // Assert
    expect(server.host).toBe("0.0.0.0");
    expect(exposed).toEqual(nonLoopbackIPv4Addresses());
  });

  it("exits with an error for an invalid --port", async () => {
    // Act
    const { code, stderr } = await runBuiltServerToExit(PACKAGE_DIR, ["--port", "http"], { env: ENV });

    // Assert
    expect(code).toBe(1);
    expect(stderr).toContain("Invalid --port value: http");
  });
});
