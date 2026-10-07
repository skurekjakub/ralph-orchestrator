import { describe, it, expect, vi } from "vitest";
import { AppStartup, loadDataSourceConnectorModules } from "../src/app-startup";
import { registerDataSourceFactory } from "../src/datasource/registry";
import { makeConfig } from "./helpers/factories";
import { createMockLogger, createMockStartupDeps } from "./helpers/mocks";

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
        loadDataSourceConnectors: vi.fn().mockImplementation(async () => callOrder.push("loadDataSourceConnectors")),
        buildMcpServers: vi.fn().mockImplementation(async () => callOrder.push("buildMcpServers")),
        resolveMcpConfigs: vi.fn().mockImplementation(() => callOrder.push("resolveMcpConfigs")),
      });

      const startup = new AppStartup(deps);
      await startup.run(createMockLogger());

      expect(callOrder).toEqual([
        "validate",
        "printResults",
        "loadConfig",
        "loadDataSourceConnectors",
        "buildMcpServers",
        "resolveMcpConfigs",
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

    it("passes logger to resolveMcpConfigs", async () => {
      const deps = createMockStartupDeps();
      const logger = createMockLogger();

      const startup = new AppStartup(deps);
      await startup.run(logger);

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
      expect(logger.info).toHaveBeenCalledWith("Built custom MCP servers");
      expect(logger.info).toHaveBeenCalledWith("Resolved MCP server configs");
    });

    it("falls back to console when no logger provided", async () => {
      const deps = createMockStartupDeps();
      const startup = new AppStartup(deps);
      await startup.run();

      expect(deps.buildMcpServers).toHaveBeenCalled();
      expect(deps.resolveMcpConfigs).toHaveBeenCalled();
    });

    it("starts Ralphchives stack when enabled", async () => {
      const config = { ...makeConfig(), ralphchives: { enabled: true, nodebbApiUrl: "", neo4jUri: "", neo4jUser: "" } };
      const deps = createMockStartupDeps({ loadConfig: vi.fn().mockReturnValue(config) });
      const logger = createMockLogger();

      const startup = new AppStartup(deps);
      await startup.run(logger);

      expect(deps.startRalphchives).toHaveBeenCalledWith(logger);
    });

    it("skips Ralphchives stack when disabled", async () => {
      const deps = createMockStartupDeps({ loadConfig: vi.fn().mockReturnValue(makeConfig()) });

      const startup = new AppStartup(deps);
      await startup.run(createMockLogger());

      expect(deps.startRalphchives).not.toHaveBeenCalled();
    });

    it("hands the built-in data-source connector modules to the loader", async () => {
      // Arrange
      const deps = createMockStartupDeps();

      // Act
      await new AppStartup(deps).run(createMockLogger());

      // Assert
      const [connectors] = vi.mocked(deps.loadDataSourceConnectors).mock.calls[0];
      expect(connectors.map((connector) => connector.name)).toEqual(["jira"]);
    });

    it("registers the built-in JIRA data source factory through the default connector loader", async () => {
      // Arrange
      const { loadDataSourceConnectors: _defaultLoader, ...deps } = createMockStartupDeps();
      const logger = createMockLogger();

      // Act
      await new AppStartup(deps).run(logger);

      // Assert
      expect(logger.info).toHaveBeenCalledWith("Loaded data-source connector: jira");
      expect(() => registerDataSourceFactory("jira", vi.fn())).toThrow('already registered for type "jira"');
    });
  });
});

describe("loadDataSourceConnectorModules", () => {
  it("fails with the connector name and loads none after it when a module cannot be imported", async () => {
    // Arrange
    const broken = { name: "broken", load: vi.fn().mockRejectedValue(new Error("module not found")) };
    const next = { name: "next", load: vi.fn().mockResolvedValue({}) };

    // Act
    const loading = loadDataSourceConnectorModules([broken, next], createMockLogger());

    // Assert
    await expect(loading).rejects.toThrow('Failed to load data-source connector "broken": module not found');
    expect(next.load).not.toHaveBeenCalled();
  });
});
