import { describe, expect, it } from "vitest";
import { isServerReady, type ServerHealth, type ToolFilterHealth } from "../src/health";
import { ServerStatus } from "../src/managed-server";
import { DriftStatus, ExposureStatus } from "../src/upstream-monitor";

function filter(drift: DriftStatus, exposure: ExposureStatus): ToolFilterHealth {
  return {
    upstreamPort: 19100,
    allowedTools: ["echo"],
    deniedCalls: 0,
    drift: { status: drift, missingTools: [], upstreamToolCount: 1, checkedAt: null, error: null },
    exposure: { status: exposure, addresses: [], checkedAt: null },
  };
}

function server(status: ServerStatus, toolFilter?: ToolFilterHealth): ServerHealth {
  return { status, port: 9100, restarts: 0, lastError: null, ...(toolFilter ? { toolFilter } : {}) };
}

describe("isServerReady", () => {
  it("accepts a running server without a tool filter", () => {
    // Act & Assert
    expect(isServerReady(server(ServerStatus.Running))).toBe(true);
  });

  it.each([
    ServerStatus.Starting,
    ServerStatus.Crashed,
    ServerStatus.Failed,
    ServerStatus.Refused,
    ServerStatus.Stopped,
  ])("rejects a %s server", (status) => {
    // Act & Assert
    expect(isServerReady(server(status, filter(DriftStatus.Ok, ExposureStatus.LoopbackOnly)))).toBe(false);
  });

  it.each([DriftStatus.Ok, DriftStatus.Drift])(
    "accepts a filtered server whose tools were listed (%s) and whose upstream is loopback-only",
    (drift) => {
      // Act & Assert
      expect(isServerReady(server(ServerStatus.Running, filter(drift, ExposureStatus.LoopbackOnly)))).toBe(true);
    },
  );

  it.each([
    ["the exposure check is pending", DriftStatus.Ok, ExposureStatus.Pending],
    ["the upstream is exposed", DriftStatus.Ok, ExposureStatus.Exposed],
    ["the tool listing is pending", DriftStatus.Pending, ExposureStatus.LoopbackOnly],
    ["the tools could not be listed", DriftStatus.Error, ExposureStatus.LoopbackOnly],
  ])("rejects a running filtered server when %s", (_label, drift, exposure) => {
    // Act & Assert
    expect(isServerReady(server(ServerStatus.Running, filter(drift, exposure)))).toBe(false);
  });
});
