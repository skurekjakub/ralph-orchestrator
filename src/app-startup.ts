import type { Logger } from "./logger";
import { resolveAllProfileSetup } from "./container/setup/profile-setup";
import { buildCustomMcpServers } from "./container/setup/mcp-builder";
import { loadConfig } from "./config/loader";
import type { IAppConfig } from "./config/types";
import { validatePrerequisites, printValidationResults, type ValidationResult } from "./validate/index";
import { execa } from "execa";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** A plugin module that self-registers (e.g. calls `registerDataSourceFactory()`) when imported. */
export interface PluginModule {
  /** Name shown in logs and load errors. */
  readonly name: string;
  /** Imports the module, which runs its self-registration. */
  load(): Promise<unknown>;
}

/**
 * Built-in plugin modules, loaded before any user-specified plugins.
 * Each `import()` names its module literally so the bundle includes it.
 */
const BUILTIN_PLUGINS: readonly PluginModule[] = [
  { name: "jira", load: () => import("./datasource/connectors/jira/factory") },
];

/**
 * Build the runtime import for one `config.plugins` entry.
 *
 * A relative or absolute path resolves against `cwd` and is imported by file URL.
 * Any other entry is a package specifier that Node resolves from `node_modules`.
 */
export function userPluginModule(specifier: string, cwd: string = process.cwd()): PluginModule {
  const isPath = specifier.startsWith("./") || specifier.startsWith("../") || isAbsolute(specifier);
  const target = isPath ? pathToFileURL(resolve(cwd, specifier)).href : specifier;
  return { name: specifier, load: () => import(target) };
}

/** Injectable hooks for the startup pipeline steps. */
export interface AppStartupDeps {
  validate(logger?: Logger): Promise<ValidationResult>;
  printResults(result: ValidationResult): boolean;
  loadConfig(): IAppConfig;
  loadPlugins(plugins: readonly PluginModule[], logger: Logger): Promise<void>;
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
 * Import plugin modules in order, so each one self-registers as a side effect.
 *
 * @throws Error naming the plugin when its import fails
 */
async function loadPluginModules(plugins: readonly PluginModule[], logger: Logger): Promise<void> {
  for (const plugin of plugins) {
    try {
      await plugin.load();
      logger.info(`Loaded plugin: ${plugin.name}`);
    } catch (err) {
      throw new Error(`Failed to load plugin "${plugin.name}": ${(err as Error).message}`);
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

    const userPlugins = config.plugins.map((specifier) => userPluginModule(specifier));
    await this.deps.loadPlugins([...BUILTIN_PLUGINS, ...userPlugins], log);

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
