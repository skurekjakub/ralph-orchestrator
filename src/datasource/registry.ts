/**
 * Data source registry — composition root for connector/poller implementations.
 *
 * Each data source type registers a factory function here. The awilix cradle
 * calls {@link buildDataSourceMaps} without importing any connector internals,
 * keeping the DI container decoupled from specific data source implementations.
 *
 * To add a new data source:
 * 1. Create `src/datasource/connectors/<type>/factory.ts` exporting a {@link DataSourceFactory}
 * 2. Import the factory here and add it to the `factories` map
 * 3. Add the type to {@link DataSourceType} enum in `config/types.ts`
 */

import { DataSourceType, type IAppConfig, type IAgentProfile, type IDataSourceConfig } from "../config/types.js";
import type { IDataSourceConnector } from "./connector.js";
import type { IWorkItemPoller } from "./poller.js";
import { createJiraDataSource } from "./connectors/jira/factory.js";

/** Factory function that creates a connector + poller for a single data source entry. */
export type DataSourceFactory = (
  sourceKey: string,
  dsConfig: IDataSourceConfig,
  profiles: readonly IAgentProfile[],
  logger?: { info: (msg: string) => void },
) => { connector: IDataSourceConnector; poller: IWorkItemPoller };

/** Registered factories by data source type. */
const factories: ReadonlyMap<DataSourceType, DataSourceFactory> = new Map([
  [DataSourceType.Jira, createJiraDataSource],
]);

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
      throw new Error(`No factory registered for data source type "${ds.type}". Register one in src/datasource/registry.ts`);
    }

    const { connector, poller } = factory(key, ds, config.profiles, logger);
    connectors.set(key, connector);
    pollers.set(key, poller);
  }

  return { connectors, pollers };
}
