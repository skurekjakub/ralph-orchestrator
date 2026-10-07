import type { Logger } from "./logger";
import { resolveAllProfileSetup } from "./container/setup/profile-setup";
import { buildCustomMcpServers } from "./container/setup/mcp-builder";
import { loadConfig } from "./config/loader";
import type { IAppConfig } from "./config/types";
import { validatePrerequisites, printValidationResults, type ValidationResult } from "./validate/index";
import { execa } from "execa";
import { resolve } from "node:path";

/** A built-in data-source connector module whose factory calls `registerDataSourceFactory()` when imported. */
export interface DataSourceConnectorModule {
  /** Name shown in logs and load errors. */
  readonly name: string;
  /** Imports the module, which runs its self-registration. */
  load(): Promise<unknown>;
}

/**
 * Built-in data-source connector modules.
 * Each `import()` names its module literally so the bundle includes it.
 */
const DATA_SOURCE_CONNECTORS: readonly DataSourceConnectorModule[] = [
  { name: "jira", load: () => import("./datasource/connectors/jira/factory") },
];

/** Injectable hooks for the startup pipeline steps. */
export interface AppStartupDeps {
  validate(logger?: Logger): Promise<ValidationResult>;
  printResults(result: ValidationResult): boolean;
  loadConfig(): IAppConfig;
  loadDataSourceConnectors(connectors: readonly DataSourceConnectorModule[], logger: Logger): Promise<void>;
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
 * Import data-source connector modules in order, so each factory self-registers as a side effect.
 *
 * @throws Error naming the connector when its import fails
 */
export async function loadDataSourceConnectorModules(
  connectors: readonly DataSourceConnectorModule[],
  logger: Logger,
): Promise<void> {
  for (const connector of connectors) {
    try {
      await connector.load();
      logger.info(`Loaded data-source connector: ${connector.name}`);
    } catch (err) {
      throw new Error(`Failed to load data-source connector "${connector.name}": ${(err as Error).message}`);
    }
  }
}

/** Default production deps wired to the real implementations. */
function defaultDeps(): AppStartupDeps {
  return {
    validate: (logger) => validatePrerequisites(logger),
    printResults: printValidationResults,
    loadConfig,
    loadDataSourceConnectors: loadDataSourceConnectorModules,
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

    await this.deps.loadDataSourceConnectors(DATA_SOURCE_CONNECTORS, log);

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
