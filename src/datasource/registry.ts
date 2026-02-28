/**
 * Data source factory registry.
 *
 * Public API for registering data source connector/poller factories.
 * Each data source type (e.g. `"jira"`, `"github"`) registers a factory
 * via {@link registerDataSourceFactory}. The awilix cradle calls
 * {@link buildDataSourceMaps} to instantiate connectors from config —
 * it never imports connector-specific code directly.
 *
 * To add a new data source:
 * 1. Create a factory module that calls {@link registerDataSourceFactory}
 * 2. Ensure the module is imported before orchestrator startup
 *    (built-ins are imported in `app-startup.ts`)
 */

import type { IAppConfig, IAgentProfile, IDataSourceConfig } from "../config/types.js";
import type { IDataSourceConnector } from "./connector.js";
import type { IWorkItemPoller } from "./poller.js";

/** Factory function that creates a connector + poller for a single data source entry. */
export type DataSourceFactory = (
  sourceKey: string,
  dsConfig: IDataSourceConfig,
  profiles: readonly IAgentProfile[],
  logger?: { info: (msg: string) => void },
) => { connector: IDataSourceConnector; poller: IWorkItemPoller };

/** Mutable factory map — populated via {@link registerDataSourceFactory}. */
const factories = new Map<string, DataSourceFactory>();

/**
 * Register a factory for a data source type.
 *
 * Called at module load time by each connector implementation.
 * Must be called before {@link buildDataSourceMaps} (i.e. before `createCradle()`).
 *
 * @param type - Data source type string (must match `dataSources.<key>.type` in config)
 * @param factory - Factory that creates connector + poller from config
 * @throws Error if a factory is already registered for this type
 */
export function registerDataSourceFactory(type: string, factory: DataSourceFactory): void {
  if (factories.has(type)) {
    throw new Error(`Data source factory already registered for type "${type}"`);
  }
  factories.set(type, factory);
}

/**
 * Build per-data-source connectors and pollers from the config.
 *
 * Each data source entry gets its own connector + poller instance keyed by source name.
 * Delegates creation to the registered factory for each data source type.
 *
 * @throws Error if a data source type has no registered factory
 */
export function buildDataSourceMaps(
  config: IAppConfig,
  logger?: { info: (msg: string) => void },
): { connectors: Map<string, IDataSourceConnector>; pollers: Map<string, IWorkItemPoller> } {
  const connectors = new Map<string, IDataSourceConnector>();
  const pollers = new Map<string, IWorkItemPoller>();

  for (const [key, ds] of Object.entries(config.dataSources)) {
    const factory = factories.get(ds.type);
    if (!factory) {
      throw new Error(
        `No factory registered for data source type "${ds.type}". ` +
        `Call registerDataSourceFactory("${ds.type}", factory) before startup.`,
      );
    }

    const { connector, poller } = factory(key, ds, config.profiles, logger);
    connectors.set(key, connector);
    pollers.set(key, poller);
  }

  return { connectors, pollers };
}
