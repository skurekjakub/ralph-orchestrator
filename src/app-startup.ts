import type { Logger } from "./logger.js";
import { resolveAllProfileSetup } from "./container/setup/profile-setup.js";
import { buildCustomMcpServers } from "./container/setup/mcp-builder.js";
import { loadConfig } from "./config/loader.js";
import type { IAppConfig } from "./config/types.js";
import { validatePrerequisites, printValidationResults, type ValidationResult } from "./validate/index.js";
import { execa } from "execa";
import { resolve } from "node:path";

/**
 * Built-in plugin modules loaded before any user-specified plugins.
 * Each module self-registers via `registerDataSourceFactory()` on import.
 */
const BUILTIN_PLUGINS: readonly string[] = ["./datasource/connectors/jira/factory.js"];

/** Injectable hooks for the startup pipeline steps. */
export interface AppStartupDeps {
  validate(logger?: Logger): Promise<ValidationResult>;
  printResults(result: ValidationResult): boolean;
  loadConfig(): IAppConfig;
  loadPlugins(modules: readonly string[], logger: Logger): Promise<void>;
  buildMcpServers(logger: Logger): Promise<void>;
  resolveMcpConfigs(logger?: Logger): void;
  startRalphchives(logger: Logger): Promise<void>;
}

/** Public contract for the startup pipeline. */
export interface IAppStartup {
  /** Run the full startup pipeline: validate → load config → initialize profiles. */
  run(logger?: Logger): Promise<IAppConfig>;
}

/** Start the Ralphchives docker compose stack (NodeBB + Neo4j + sync). */
async function startRalphchivesStack(logger: Logger): Promise<void> {
  const composeFile = resolve("ralphchives/docker-compose.yml");
  logger.info("Starting Ralphchives stack");
  try {
    await execa("docker", ["compose", "-f", composeFile, "up", "-d"], {
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr;
    if (stderr) logger.error(`Ralphchives docker compose output:\n${stderr}`);
    throw err;
  }
  logger.info("Ralphchives stack started");
}

/**
 * Load plugin modules via dynamic import.
 *
 * Built-in plugins (e.g. JIRA connector) are loaded first, then any
 * user-specified plugins from `config.plugins`. Each module is expected
 * to self-register (e.g. call `registerDataSourceFactory()`) as a side effect.
 */
async function loadPluginModules(modules: readonly string[], logger: Logger): Promise<void> {
  for (const mod of modules) {
    try {
      await import(mod);
      logger.info(`Loaded plugin: ${mod}`);
    } catch (err) {
      throw new Error(`Failed to load plugin "${mod}": ${(err as Error).message}`);
    }
  }
}

/** Default production deps wired to the real implementations. */
function defaultDeps(): AppStartupDeps {
  return {
    validate: (logger) => validatePrerequisites(logger),
    printResults: printValidationResults,
    loadConfig,
    loadPlugins: loadPluginModules,
    buildMcpServers: buildCustomMcpServers,
    resolveMcpConfigs: (logger) => resolveAllProfileSetup(undefined, logger),
    startRalphchives: startRalphchivesStack,
  };
}

/**
 * Pre-orchestrator startup pipeline.
 *
 * Validates prerequisites, loads config, and prepares all profile
 * infrastructure (agent templates, MCP servers, squid configs)
 * before the orchestrator loop begins.
 */
export class AppStartup implements IAppStartup {
  private deps: AppStartupDeps;

  constructor(deps?: Partial<AppStartupDeps>) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  /**
   * Run the full startup pipeline: validate → load config → initialize profiles.
   *
   * Exits the process if validation fails.
   */
  async run(logger?: Logger): Promise<IAppConfig> {
    const log = logger ?? console;

    log.info("Starting prerequisite validation");
    const result = await this.deps.validate(log);
    if (!this.deps.printResults(result)) {
      process.exit(1);
    }
    log.info(`Validation passed (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})`);

    const config = this.deps.loadConfig();
    log.info("Loaded configuration");

    // Load built-in + user-specified plugins (data source factories, etc.)
    await this.deps.loadPlugins([...BUILTIN_PLUGINS, ...config.plugins], log);

    if (config.ralphchives?.enabled) {
      await this.deps.startRalphchives(log);
    }

    await this.initializeProfiles(log);
    return config;
  }

  /**
   * Build custom MCP servers and generate per-profile configs.
   *
   * Agent template rendering is deferred to task execution time (JIT)
   * so templates have access to runtime context like `isRevision`.
   */
  private async initializeProfiles(logger: Logger): Promise<void> {
    await this.deps.buildMcpServers(logger);
    logger.info("Built custom MCP servers");

    this.deps.resolveMcpConfigs(logger);
    logger.info("Resolved MCP server configs");
  }
}
