import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeartbeatSender, HeartbeatStatus, type HeartbeatPayload } from "../../src/services/heartbeat";
import { createMockLogger } from "../helpers/mocks";
import type { Logger } from "../../src/logger";

function makePayload(overrides: Partial<HeartbeatPayload> = {}): HeartbeatPayload {
  return {
    agentId: "test-agent-id",
    status: HeartbeatStatus.Polling,
    queueSize: 0,
    currentTask: null,
    currentTaskStartedAt: null,
    profileId: null,
    totalProcessed: 0,
    lastCompletedTask: null,
    lastCompletedAt: null,
    ...overrides,
  };
}

function makeHeartbeat(url: string, secret: string, intervalMs: number, logger?: Logger) {
  return new HeartbeatSender({
    dashboardConfig: { enabled: true, url, secret, intervalMs },
    logger,
  });
}

describe("HeartbeatSender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends an immediate heartbeat on start", () => {
    const sender = makeHeartbeat("https://dashboard.test", "secret", 30000);
    const provider = () => makePayload();

    sender.start(provider);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://dashboard.test/api/heartbeat");
    expect(opts?.method).toBe("POST");
    expect(opts?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer secret",
      }),
    );

    sender.stop();
  });

  it("sends heartbeats on the configured interval", async () => {
    const sender = makeHeartbeat("https://dashboard.test", "secret", 5000);
    sender.start(() => makePayload());

    expect(fetch).toHaveBeenCalledTimes(1); // immediate

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(3);

    sender.stop();
  });

  it("stop() clears the interval", async () => {
    const sender = makeHeartbeat("https://dashboard.test", "secret", 5000);
    sender.start(() => makePayload());

    sender.stop();

    await vi.advanceTimersByTimeAsync(15000);
    expect(fetch).toHaveBeenCalledTimes(1); // only the immediate one
  });

  it("start() is idempotent — calling twice does not create duplicate timers", async () => {
    const sender = makeHeartbeat("https://dashboard.test", "secret", 5000);
    const provider = () => makePayload();

    sender.start(provider);
    sender.start(provider); // should be a no-op

    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(2); // not 3

    sender.stop();
  });

  it("logs warning on fetch failure (deduplicates same error)", async () => {
    const logger = createMockLogger();
    vi.mocked(fetch).mockRejectedValue(new Error("Network down"));

    const sender = makeHeartbeat("https://dashboard.test", "secret", 5000, logger);
    sender.start(() => makePayload());

    // Wait for the immediate send to complete
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain("Network down");

    // Same error on next interval — should NOT log again
    await vi.advanceTimersByTimeAsync(5000);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    sender.stop();
  });

  it("logs new error when error message changes", async () => {
    const logger = createMockLogger();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Timeout")).mockRejectedValueOnce(new Error("DNS failure"));

    const sender = makeHeartbeat("https://dashboard.test", "secret", 5000, logger);
    sender.start(() => makePayload());

    await vi.advanceTimersByTimeAsync(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logger.warn).mock.calls[1][0]).toContain("DNS failure");

    sender.stop();
  });

  it("logs restored message when heartbeat recovers after error", async () => {
    const logger = createMockLogger();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("Down"))
      .mockResolvedValueOnce({ ok: true } as Response);

    const sender = makeHeartbeat("https://dashboard.test", "secret", 5000, logger);
    sender.start(() => makePayload());

    await vi.advanceTimersByTimeAsync(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(logger.info).toHaveBeenCalledWith("Dashboard heartbeat restored");

    sender.stop();
  });

  it("strips trailing slash from dashboard URL", () => {
    const sender = makeHeartbeat("https://dashboard.test/", "secret", 5000);
    sender.start(() => makePayload());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://dashboard.test/api/heartbeat");

    sender.stop();
  });

  it("sends JSON payload with correct structure", () => {
    const payload = makePayload({
      status: HeartbeatStatus.Working,
      currentTask: "DOC-100",
      queueSize: 3,
    });
    const sender = makeHeartbeat("https://dashboard.test", "secret", 5000);
    sender.start(() => payload);

    const opts = vi.mocked(fetch).mock.calls[0][1];
    const body = JSON.parse(opts?.body as string);
    expect(body.status).toBe("working");
    expect(body.currentTask).toBe("DOC-100");
    expect(body.queueSize).toBe(3);

    sender.stop();
  });
});
