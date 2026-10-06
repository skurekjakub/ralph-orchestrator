import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppStartup, userPluginModule } from "../src/app-startup";
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
        loadPlugins: vi.fn().mockImplementation(async () => callOrder.push("loadPlugins")),
        buildMcpServers: vi.fn().mockImplementation(async () => callOrder.push("buildMcpServers")),
        resolveMcpConfigs: vi.fn().mockImplementation(() => callOrder.push("resolveMcpConfigs")),
      });

      const startup = new AppStartup(deps);
      await startup.run(createMockLogger());

      expect(callOrder).toEqual([
        "validate",
        "printResults",
        "loadConfig",
        "loadPlugins",
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

    it("loads the built-in plugins first, then the configured plugins in config order", async () => {
      // Arrange
      const config = { ...makeConfig(), plugins: ["./local-plugin.mjs", "some-plugin-package"] };
      const deps = createMockStartupDeps({ loadConfig: vi.fn().mockReturnValue(config) });

      // Act
      await new AppStartup(deps).run(createMockLogger());

      // Assert
      const [plugins] = vi.mocked(deps.loadPlugins).mock.calls[0];
      expect(plugins.map((plugin) => plugin.name)).toEqual(["jira", "./local-plugin.mjs", "some-plugin-package"]);
    });

    it("registers the built-in JIRA data source factory through the default plugin loader", async () => {
      // Arrange
      const { loadPlugins: _defaultLoader, ...deps } = createMockStartupDeps();
      const logger = createMockLogger();

      // Act
      await new AppStartup(deps).run(logger);

      // Assert
      expect(logger.info).toHaveBeenCalledWith("Loaded plugin: jira");
      expect(() => registerDataSourceFactory("jira", vi.fn())).toThrow('already registered for type "jira"');
    });

    it("fails with the plugin name when a configured plugin cannot be imported", async () => {
      // Arrange
      const config = { ...makeConfig(), plugins: ["./no-such-plugin.mjs"] };
      const { loadPlugins: _defaultLoader, ...deps } = createMockStartupDeps({
        loadConfig: vi.fn().mockReturnValue(config),
      });

      // Act & Assert
      await expect(new AppStartup(deps).run(createMockLogger())).rejects.toThrow(
        'Failed to load plugin "./no-such-plugin.mjs"',
      );
    });
  });
});

describe("userPluginModule", () => {
  let pluginDir: string;

  beforeEach(() => {
    pluginDir = mkdtempSync(join(tmpdir(), "plugin-module-"));
    writeFileSync(join(pluginDir, "plugin.mjs"), 'export const marker = "loaded";\n');
  });

  afterEach(() => {
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it("imports a relative path from the given working directory", async () => {
    // Arrange
    const plugin = userPluginModule("./plugin.mjs", pluginDir);

    // Act
    const loaded = (await plugin.load()) as { marker: string };

    // Assert
    expect(plugin.name).toBe("./plugin.mjs");
    expect(loaded.marker).toBe("loaded");
  });

  it("imports an absolute path as given", async () => {
    // Arrange
    const plugin = userPluginModule(join(pluginDir, "plugin.mjs"), "/nonexistent-cwd");

    // Act
    const loaded = (await plugin.load()) as { marker: string };

    // Assert
    expect(loaded.marker).toBe("loaded");
  });

  it("leaves a package specifier for Node to resolve", async () => {
    // Arrange
    const plugin = userPluginModule("node:path", pluginDir);

    // Act
    const loaded = (await plugin.load()) as { join: unknown };

    // Assert
    expect(loaded.join).toBe(join);
  });

  it("rejects when a relative path does not exist under the working directory", async () => {
    // Arrange
    const plugin = userPluginModule("./missing.mjs", pluginDir);

    // Act & Assert
    await expect(plugin.load()).rejects.toThrow(/missing\.mjs/);
  });
});
