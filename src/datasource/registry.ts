/**
 * Data source factory registry.
 *
 * Registers data source connector/poller factories.
 * Each data source type (e.g. `"jira"`, `"github"`) registers a factory
 * via {@link registerDataSourceFactory}; {@link buildDataSourceMaps} builds
 * the connectors from config through those factories, so the registry never
 * imports connector-specific code.
 *
 * To add a new data source:
 * 1. Create `src/datasource/connectors/<name>/factory.ts` that calls {@link registerDataSourceFactory}
 * 2. Add it to `DATA_SOURCE_CONNECTORS` in `app-startup.ts` with a literal `import()`,
 *    so the bundle includes it
 * 3. See `docs/dev-doc/data-source-registration.md` for the full guide
 */

import type { AwilixContainer } from "awilix";
import type { IAppConfig } from "../config/types";
import type { DataSourceCradle, OrchestratorCradle } from "../awilix-cradle-types";
import { asValues } from "../di/registration";
import type { IDataSourceConnector } from "./connector";
import type { IWorkItemPoller } from "./poller";

/**
 * Builds the connector and poller of one data source entry. It registers its own classes in `scope`, the
 * entry's awilix scope, every one `.scoped()`, and resolves them there.
 */
export type DataSourceFactory = (scope: AwilixContainer<DataSourceCradle>) => {
  connector: IDataSourceConnector;
  poller: IWorkItemPoller;
};

/** Mutable factory map — populated via {@link registerDataSourceFactory}. */
const factories = new Map<string, DataSourceFactory>();

/**
 * Register a factory for a data source type.
 *
 * Called at module load time by each connector implementation.
 * Must be called before {@link buildDataSourceMaps} (i.e. before `createRootContainer()`).
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
 * Each data source entry gets its own scope of `container`, holding the entry's `sourceKey` and
 * `dataSourceConfig`, in which the registered factory for its type builds the connector and poller. Call it
 * outside any resolution of `container`: awilix refuses a scope's scoped registrations while a root singleton
 * resolves.
 *
 * @param container The root container; each scope resolves its root tokens (e.g. `profiles`) from it.
 * @returns The connectors and pollers keyed by data source name.
 * @throws Error if a data source type has no registered factory; whatever a factory throws, unchanged.
 */
export function buildDataSourceMaps(
  container: AwilixContainer<OrchestratorCradle>,
  config: IAppConfig,
): { connectors: Map<string, IDataSourceConnector>; pollers: Map<string, IWorkItemPoller> } {
  const connectors = new Map<string, IDataSourceConnector>();
  const pollers = new Map<string, IWorkItemPoller>();

  for (const [sourceKey, dataSourceConfig] of Object.entries(config.dataSources)) {
    const factory = factories.get(dataSourceConfig.type);
    if (!factory) {
      throw new Error(
        `No factory registered for data source type "${dataSourceConfig.type}". ` +
          `Call registerDataSourceFactory("${dataSourceConfig.type}", factory) before startup.`,
      );
    }

    const values: Omit<DataSourceCradle, keyof OrchestratorCradle> = { sourceKey, dataSourceConfig };
    const { connector, poller } = factory(container.createScope().register(asValues(values)));
    connectors.set(sourceKey, connector);
    pollers.set(sourceKey, poller);
  }

  return { connectors, pollers };
}
