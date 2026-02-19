import { describe, it, expect } from "vitest";
import { StreamCapture } from "../../src/container/stream-capture.js";
import { createMockLogger } from "../helpers/mocks.js";
import { EventEmitter } from "node:events";

/** Create a fake process with EventEmitter-based stdout/stderr streams. */
function makeFakeProc() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  return { stdout, stderr } as any;
}

describe("StreamCapture", () => {
  it("captures stdout chunks and joins them", () => {
    const proc = makeFakeProc();
    const capture = new StreamCapture(proc, createMockLogger(), "test");

    proc.stdout.emit("data", "hello ");
    proc.stdout.emit("data", "world\n");

    expect(capture.stdout).toBe("hello world\n");
    expect(capture.stdoutChunks).toEqual(["hello ", "world\n"]);
  });

  it("captures stderr chunks and joins them", () => {
    const proc = makeFakeProc();
    const capture = new StreamCapture(proc, createMockLogger(), "test");

    proc.stderr.emit("data", "err1 ");
    proc.stderr.emit("data", "err2\n");

    expect(capture.stderr).toBe("err1 err2\n");
    expect(capture.stderrChunks).toEqual(["err1 ", "err2\n"]);
  });

  it("logs complete stdout lines to logger.info with tag prefix", () => {
    const proc = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "copilot");

    proc.stdout.emit("data", "line one\nline two\n");

    expect(logger.info).toHaveBeenCalledWith("[copilot] line one");
    expect(logger.info).toHaveBeenCalledWith("[copilot] line two");
  });

  it("logs complete stderr lines to logger.warn with tag prefix", () => {
    const proc = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "claude");

    proc.stderr.emit("data", "warning msg\n");

    expect(logger.warn).toHaveBeenCalledWith("[claude] warning msg");
  });

  it("buffers partial lines until newline arrives", () => {
    const proc = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "test");

    proc.stdout.emit("data", "partial");
    expect(logger.info).not.toHaveBeenCalled();

    proc.stdout.emit("data", " complete\n");
    expect(logger.info).toHaveBeenCalledWith("[test] partial complete");
  });

  it("handles multiple lines in a single chunk", () => {
    const proc = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "tag");

    proc.stdout.emit("data", "a\nb\nc\n");

    expect(logger.info).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledWith("[tag] a");
    expect(logger.info).toHaveBeenCalledWith("[tag] b");
    expect(logger.info).toHaveBeenCalledWith("[tag] c");
  });

  it("skips blank lines (does not log them)", () => {
    const proc = makeFakeProc();
    const logger = createMockLogger();
    new StreamCapture(proc, logger, "test");

    proc.stdout.emit("data", "line\n\n\nanother\n");

    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith("[test] line");
    expect(logger.info).toHaveBeenCalledWith("[test] another");
  });

  it("handles Buffer chunks", () => {
    const proc = makeFakeProc();
    const logger = createMockLogger();
    const capture = new StreamCapture(proc, logger, "buf");

    proc.stdout.emit("data", Buffer.from("buffered line\n"));

    expect(capture.stdout).toBe("buffered line\n");
    expect(logger.info).toHaveBeenCalledWith("[buf] buffered line");
  });

  it("handles process with no stdout/stderr", () => {
    const proc = { stdout: null, stderr: null } as any;

    // Should not throw
    const capture = new StreamCapture(proc, createMockLogger(), "test");
    expect(capture.stdout).toBe("");
    expect(capture.stderr).toBe("");
  });
});
