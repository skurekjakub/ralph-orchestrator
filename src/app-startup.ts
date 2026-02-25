import type { Logger } from "./logger.js";
import { resolveAllProfileSetup } from "./container/setup/profile-setup.js";
import { buildCustomMcpServers } from "./container/setup/mcp-builder.js";
import { loadConfig } from "./config.js";
import type { IAppConfig } from "./config.js";
import { validatePrerequisites, printValidationResults } from "./validate/index.js";
import type { ValidationResult } from "./validate/index.js";

/** Injectable hooks for the startup pipeline steps. */
export interface AppStartupDeps {
  validate(logger?: Logger): Promise<ValidationResult>;
  printResults(result: ValidationResult): boolean;
  loadConfig(): IAppConfig;
  buildMcpServers(logger: Logger): Promise<void>;
  resolveMcpConfigs(logger?: Logger): void;
}

/** Public contract for the startup pipeline. */
export interface IAppStartup {
  /** Run the full startup pipeline: validate → load config → initialize profiles. */
  run(logger?: Logger): Promise<IAppConfig>;
}

/** Default production deps wired to the real implementations. */
function defaultDeps(): AppStartupDeps {
  return {
    validate: (logger) => validatePrerequisites(logger),
    printResults: printValidationResults,
    loadConfig,
    buildMcpServers: buildCustomMcpServers,
    resolveMcpConfigs: (logger) => resolveAllProfileSetup(undefined, logger),
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
