import { describe, it, expect } from "vitest";
import { StreamCapture } from "../../src/container/stream-capture.js";
import { createMockLogger } from "../helpers/mocks.js";
import type { ResultPromise } from "execa";
import { EventEmitter } from "node:events";

/** Create a fake process with EventEmitter-based stdout/stderr streams. */
function makeFakeProc() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  return { proc: { stdout, stderr } as unknown as ResultPromise, stdout, stderr };
}

describe("StreamCapture", () => {
  it("captures stdout chunks and joins them", () => {
    const { proc, stdout } = makeFakeProc();
    const capture = new StreamCapture(proc, createMockLogger(), "test");

    stdout.emit("data", "hello ");
    stdout.emit("data", "world\n");

    expect(capture.stdout).toBe("hello world\n");
    expect(capture.stdoutChunks).toEqual(["hello ", "world\n"]);
  });

  it("captures stderr chunks and joins them", () => {
    const { proc, stderr } = makeFakeProc();
    const capture = new StreamCapture(proc, createMockLogger(), "test");

    stderr.emit("data", "err1 ");
    stderr.emit("data", "err2\n");

    expect(capture.stderr).toBe("err1 err2\n");
    expect(capture.stderrChunks).toEqual(["err1 ", "err2\n"]);
  });

  it("logs complete stdout lines to logger.info with tag prefix", () => {
    const { proc, stdout } = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "copilot");

    stdout.emit("data", "line one\nline two\n");

    expect(logger.info).toHaveBeenCalledWith("[copilot] line one");
    expect(logger.info).toHaveBeenCalledWith("[copilot] line two");
  });

  it("logs complete stderr lines to logger.warn with tag prefix", () => {
    const { proc, stderr } = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "claude");

    stderr.emit("data", "warning msg\n");

    expect(logger.warn).toHaveBeenCalledWith("[claude] warning msg");
  });

  it("buffers partial lines until newline arrives", () => {
    const { proc, stdout } = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "test");

    stdout.emit("data", "partial");
    expect(logger.info).not.toHaveBeenCalled();

    stdout.emit("data", " complete\n");
    expect(logger.info).toHaveBeenCalledWith("[test] partial complete");
  });

  it("handles multiple lines in a single chunk", () => {
    const { proc, stdout } = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "tag");

    stdout.emit("data", "a\nb\nc\n");

    expect(logger.info).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledWith("[tag] a");
    expect(logger.info).toHaveBeenCalledWith("[tag] b");
    expect(logger.info).toHaveBeenCalledWith("[tag] c");
  });

  it("skips blank lines (does not log them)", () => {
    const { proc, stdout } = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "test");

    stdout.emit("data", "line\n\n\nanother\n");

    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith("[test] line");
    expect(logger.info).toHaveBeenCalledWith("[test] another");
  });

  it("handles Buffer chunks", () => {
    const { proc, stdout } = makeFakeProc();
    const logger = createMockLogger();
    const capture = new StreamCapture(proc, logger, "buf");

    stdout.emit("data", Buffer.from("buffered line\n"));

    expect(capture.stdout).toBe("buffered line\n");
    expect(logger.info).toHaveBeenCalledWith("[buf] buffered line");
  });

  it("handles process with no stdout/stderr", () => {
    const proc = { stdout: null, stderr: null } as unknown as ResultPromise;

    // Should not throw
    const capture = new StreamCapture(proc, createMockLogger(), "test");
    expect(capture.stdout).toBe("");
    expect(capture.stderr).toBe("");
  });

  it("resolves resultBlockDetected when RALPH_RESULT_END marker appears in stdout", async () => {
    const { proc, stdout } = makeFakeProc();
    const capture = new StreamCapture(proc, createMockLogger(), "test");

    let resolved = false;
    capture.resultBlockDetected.then(() => { resolved = true; });

    stdout.emit("data", "===RALPH_RESULT_START===\nSTATUS: completed\n===RALPH_RESULT_END===\n");

    // Let microtask queue flush
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("resolves resultBlockDetected even when marker is wrapped in code fences", async () => {
    const { proc, stdout } = makeFakeProc();
    const capture = new StreamCapture(proc, createMockLogger(), "test");

    let resolved = false;
    capture.resultBlockDetected.then(() => { resolved = true; });

    stdout.emit("data", "```\n===RALPH_RESULT_START===\nSTATUS: completed\n===RALPH_RESULT_END===\n```\n");

    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it("resultBlockDetected stays pending when marker is absent", async () => {
    const { proc, stdout } = makeFakeProc();
    const capture = new StreamCapture(proc, createMockLogger(), "test");

    let resolved = false;
    capture.resultBlockDetected.then(() => { resolved = true; });

    stdout.emit("data", "some normal output\nno result block here\n");

    await Promise.resolve();
    expect(resolved).toBe(false);
  });

  it("resolves resultBlockDetected only once even with multiple markers", async () => {
    const { proc, stdout } = makeFakeProc();
    const capture = new StreamCapture(proc, createMockLogger(), "test");

    let resolveCount = 0;
    capture.resultBlockDetected.then(() => { resolveCount++; });

    stdout.emit("data", "===RALPH_RESULT_END===\n");
    stdout.emit("data", "===RALPH_RESULT_END===\n");

    await Promise.resolve();
    expect(resolveCount).toBe(1);
  });
});
