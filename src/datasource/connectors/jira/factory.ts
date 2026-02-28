/**
 * Jira data source factory.
 *
 * Creates a {@link JiraConnector} and {@link JiraWorkItemPoller} from config.
 * Self-registers with the data source registry at import time — the same
 * pattern available to third-party integrations.
 */

import type { IDataSourceConfig, IJiraConnectionConfig, IAgentProfile } from "../../../config/types.js";
import type { IDataSourceConnector } from "../../connector.js";
import type { IWorkItemPoller } from "../../poller.js";
import { registerDataSourceFactory } from "../../registry.js";
import { JiraClient } from "./jira-client.js";
import { JiraConnector } from "./jira-connector.js";
import { JiraWorkItemPoller } from "./jira-poller.js";
import { buildJqlFromProfiles } from "./jql-builder.js";

/**
 * Creates Jira connector + poller for a single data source entry.
 *
 * @param sourceKey - Key from `config.dataSources` map
 * @param dsConfig - Data source config (connection validated by Zod at load time)
 * @param profiles - All profiles (filtered internally to those referencing this source)
 * @param logger - Optional logger for startup messages
 */
export function createJiraDataSource(
  sourceKey: string,
  dsConfig: IDataSourceConfig,
  profiles: readonly IAgentProfile[],
  logger?: { info: (msg: string) => void },
): { connector: IDataSourceConnector; poller: IWorkItemPoller } {
  const conn = dsConfig.connection as unknown as IJiraConnectionConfig;
  const client = new JiraClient({ connection: conn });
  const connector = new JiraConnector(sourceKey, client, [...conn.excludeFields], conn.allowedUsers);

  const sourceProfiles = profiles.filter((p) => p.dataSource === sourceKey);
  const queries = buildJqlFromProfiles(sourceProfiles);

  const poller = new JiraWorkItemPoller(connector, queries, dsConfig.pollIntervalMs);

  logger?.info(`Data source "${sourceKey}" (JIRA): ${queries.length} queries, poll ${dsConfig.pollIntervalMs / 1000}s`);

  return { connector, poller };
}

// Self-register — imported as side-effect in app-startup.ts
registerDataSourceFactory("jira", createJiraDataSource);
