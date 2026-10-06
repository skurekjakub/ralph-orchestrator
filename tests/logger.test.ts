import { describe, it, expect, vi } from "vitest";
import { consoleLogger, type Logger } from "../src/logger";

describe("Logger", () => {
  it("consoleLogger.info calls console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleLogger.info("hello");
    expect(spy).toHaveBeenCalledWith("hello");
    spy.mockRestore();
  });

  it("consoleLogger.warn calls console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleLogger.warn("warning");
    expect(spy).toHaveBeenCalledWith("warning");
    spy.mockRestore();
  });

  it("consoleLogger.error calls console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLogger.error("err");
    expect(spy).toHaveBeenCalledWith("err");
    spy.mockRestore();
  });

  it("Logger interface can be implemented as a mock", () => {
    const mockLogger: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockLogger.info("test info");
    mockLogger.warn("test warn");
    mockLogger.error("test error");

    expect(mockLogger.info).toHaveBeenCalledWith("test info");
    expect(mockLogger.warn).toHaveBeenCalledWith("test warn");
    expect(mockLogger.error).toHaveBeenCalledWith("test error");
  });
});
