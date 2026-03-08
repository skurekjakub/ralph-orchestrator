import { describe, it, expect, vi } from "vitest";
import { ExecaError, type ResultPromise } from "execa";
import { createMockCompose, createMockLogger } from "../../helpers/mocks.js";

vi.mock("../../../src/container/stream-capture.js", () => ({
  StreamCapture: class MockStreamCapture {
    readonly stdout = "captured-stdout";
    readonly stderr = "captured-stderr";
    readonly resultBlockDetected = new Promise<void>(() => {});
    constructor(_proc: unknown, _logger: unknown, _tag: string) {}
  },
}));

const { executeCliCommand, killActiveProcess } = await import(
  "../../../src/container/cli-executors/shared-exec.js"
);

function makeExecaError(overrides: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
} = {}): ExecaError {
  const err = Object.create(ExecaError.prototype) as ExecaError & Record<string, unknown>;
  err.message = "Command failed";
  err.exitCode = overrides.exitCode ?? 1;
  err.stdout = overrides.stdout ?? "";
  err.stderr = overrides.stderr ?? "";
  err.timedOut = overrides.timedOut ?? false;
  return err;
}

// ── executeCliCommand ────────────────────────────────────────────────────────

describe("executeCliCommand", () => {
  it("returns result on success", async () => {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const tracker = { activeProcess: null as ResultPromise | null };

    vi.mocked(compose.execWithTimeout).mockReturnValue(
      Promise.resolve({ exitCode: 0, stdout: "ok", stderr: "" }) as unknown as ResultPromise,
    );

    const result = await executeCliCommand(
      compose, ["--user", "vscode", "app", "test"], 60000, logger, "test", tracker,
    );

    expect(result).toEqual({
      exitCode: 0,
      stdout: "captured-stdout",
      stderr: "captured-stderr",
      timedOut: false,
    });
  });

  it("handles ExecaError without rethrowing", async () => {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const tracker = { activeProcess: null as ResultPromise | null };
    const error = makeExecaError({ exitCode: 42, timedOut: true });

    vi.mocked(compose.execWithTimeout).mockReturnValue(
      Promise.reject(error) as unknown as ResultPromise,
    );

    const result = await executeCliCommand(
      compose, ["arg"], 60000, logger, "test", tracker,
    );

    expect(result.exitCode).toBe(42);
    expect(result.timedOut).toBe(true);
  });

  it("rethrows non-ExecaError errors", async () => {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const tracker = { activeProcess: null as ResultPromise | null };

    vi.mocked(compose.execWithTimeout).mockReturnValue(
      Promise.reject(new Error("network failure")) as unknown as ResultPromise,
    );

    await expect(
      executeCliCommand(compose, ["arg"], 60000, logger, "test", tracker),
    ).rejects.toThrow("network failure");
  });

  it("clears activeProcess after success", async () => {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const tracker = { activeProcess: null as ResultPromise | null };

    vi.mocked(compose.execWithTimeout).mockReturnValue(
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }) as unknown as ResultPromise,
    );

    await executeCliCommand(compose, ["arg"], 60000, logger, "test", tracker);

    expect(tracker.activeProcess).toBeNull();
  });

  it("clears activeProcess after ExecaError", async () => {
    const { compose } = createMockCompose();
    const logger = createMockLogger();
    const tracker = { activeProcess: null as ResultPromise | null };

    vi.mocked(compose.execWithTimeout).mockReturnValue(
      Promise.reject(makeExecaError()) as unknown as ResultPromise,
    );

    await executeCliCommand(compose, ["arg"], 60000, logger, "test", tracker);

    expect(tracker.activeProcess).toBeNull();
  });
});

// ── killActiveProcess ────────────────────────────────────────────────────────

describe("killActiveProcess", () => {
  it("sends SIGTERM when process exists", () => {
    const mockProcess = { kill: vi.fn() } as unknown as ResultPromise;
    const tracker = { activeProcess: mockProcess };

    killActiveProcess(tracker);

    expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    expect(tracker.activeProcess).toBeNull();
  });

  it("is a no-op when activeProcess is null", () => {
    const tracker = { activeProcess: null as ResultPromise | null };

    killActiveProcess(tracker);

    expect(tracker.activeProcess).toBeNull();
  });

  it("handles already-terminated process gracefully", () => {
    const mockProcess = {
      kill: vi.fn().mockImplementation(() => { throw new Error("Process already terminated"); }),
    } as unknown as ResultPromise;
    const tracker = { activeProcess: mockProcess };

    expect(() => killActiveProcess(tracker)).not.toThrow();
    expect(tracker.activeProcess).toBeNull();
  });
});
