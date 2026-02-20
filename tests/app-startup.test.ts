import { describe, it, expect, vi } from "vitest";
import { AppStartup } from "../src/app-startup.js";
import { makeConfig } from "./helpers/factories.js";
import { createMockLogger, createMockStartupDeps } from "./helpers/mocks.js";

describe("AppStartup", () => {
  describe("run", () => {
    it("executes the full startup pipeline in order", async () => {
      const callOrder: string[] = [];
      const deps = createMockStartupDeps({
        validate: vi.fn().mockImplementation(async () => {
          callOrder.push("validate");
          return { ok: true, errors: [], warnings: [] };
        }),
        printResults: vi.fn().mockImplementation(() => {
          callOrder.push("printResults");
          return true;
        }),
        loadConfig: vi.fn().mockImplementation(() => {
          callOrder.push("loadConfig");
          return makeConfig();
        }),
        resolveIncludes: vi.fn().mockImplementation(() => callOrder.push("resolveIncludes")),
        buildMcpServers: vi.fn().mockImplementation(async () => callOrder.push("buildMcpServers")),
        resolveMcpConfigs: vi.fn().mockImplementation(() => callOrder.push("resolveMcpConfigs")),
      });

      const startup = new AppStartup(deps);
      await startup.run(createMockLogger());

      expect(callOrder).toEqual([
        "validate",
        "printResults",
        "loadConfig",
        "buildMcpServers",
        "resolveMcpConfigs",
        "resolveIncludes",
      ]);
    });

    it("returns the loaded config", async () => {
      const config = makeConfig();
      const deps = createMockStartupDeps({ loadConfig: vi.fn().mockReturnValue(config) });

      const startup = new AppStartup(deps);
      const result = await startup.run(createMockLogger());

      expect(result).toBe(config);
    });

    it("exits process when validation fails", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });

      const deps = createMockStartupDeps({
        validate: vi.fn().mockResolvedValue({ ok: false, errors: ["bad"], warnings: [] }),
        printResults: vi.fn().mockReturnValue(false),
      });

      const startup = new AppStartup(deps);
      await expect(startup.run(createMockLogger())).rejects.toThrow("process.exit called");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(deps.loadConfig).not.toHaveBeenCalled();
      exitSpy.mockRestore();
    });

    it("passes logger to buildMcpServers", async () => {
      const deps = createMockStartupDeps();
      const logger = createMockLogger();

      const startup = new AppStartup(deps);
      await startup.run(logger);

      expect(deps.buildMcpServers).toHaveBeenCalledWith(logger);
    });

    it("passes logger to resolveIncludes and resolveMcpConfigs", async () => {
      const deps = createMockStartupDeps();
      const logger = createMockLogger();

      const startup = new AppStartup(deps);
      await startup.run(logger);

      expect(deps.resolveIncludes).toHaveBeenCalledWith(logger);
      expect(deps.resolveMcpConfigs).toHaveBeenCalledWith(logger);
    });

    it("passes logger to validate", async () => {
      const deps = createMockStartupDeps();
      const logger = createMockLogger();

      const startup = new AppStartup(deps);
      await startup.run(logger);

      expect(deps.validate).toHaveBeenCalledWith(logger);
    });

    it("logs progress for each initialization step", async () => {
      const deps = createMockStartupDeps();
      const logger = createMockLogger();

      const startup = new AppStartup(deps);
      await startup.run(logger);

      expect(logger.info).toHaveBeenCalledWith("Starting prerequisite validation");
      expect(logger.info).toHaveBeenCalledWith("Validation passed (0 warnings)");
      expect(logger.info).toHaveBeenCalledWith("Loaded configuration");
      expect(logger.info).toHaveBeenCalledWith("Resolved agent include markers");
      expect(logger.info).toHaveBeenCalledWith("Built custom MCP servers");
      expect(logger.info).toHaveBeenCalledWith("Resolved MCP server configs");
    });

    it("falls back to console when no logger provided", async () => {
      const deps = createMockStartupDeps();
      const startup = new AppStartup(deps);
      await startup.run();

      expect(deps.resolveIncludes).toHaveBeenCalled();
      expect(deps.buildMcpServers).toHaveBeenCalled();
      expect(deps.resolveMcpConfigs).toHaveBeenCalled();
    });
  });
});
