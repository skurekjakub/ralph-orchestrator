import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCradle } from "../src/awilix-cradle.js";
import { makeConfig } from "./helpers/factories.js";

/**
 * Verifies that awilix resolves all cradle services without errors.
 *
 * This catches strict-mode proxy failures when a constructor destructures
 * an optional param that is not registered in the cradle (e.g. `maxLines`,
 * `retryOptions`, `fetchComments`).
 */
describe("createCradle", () => {
  beforeEach(() => {
    // Suppress console output from logger/activity-log initialization
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("resolves all cradle services without AwilixResolutionError", () => {
    const config = makeConfig();
    const cradle = createCradle(config);

    expect(cradle.activityLog).toBeDefined();
    expect(cradle.pollers).toBeDefined();
    expect(cradle.connectors).toBeDefined();
    expect(cradle.router).toBeDefined();
    expect(cradle.issueManager).toBeDefined();
    expect(cradle.resources).toBeDefined();
    expect(cradle.taskRunner).toBeDefined();
    expect(cradle.triggerScanner).toBeDefined();
    expect(cradle.ledger).toBeDefined();
    expect(cradle.logger).toBeDefined();
  });

  it("returns dataSources and profiles from the config", () => {
    const config = makeConfig();
    const cradle = createCradle(config);

    expect(cradle.dataSources).toBe(config.dataSources);
    expect(cradle.profiles).toBe(config.profiles);
  });

  it("returns null heartbeat when dashboard is disabled", () => {
    const config = makeConfig();
    const cradle = createCradle(config);

    expect(cradle.heartbeat).toBeNull();
  });
});
