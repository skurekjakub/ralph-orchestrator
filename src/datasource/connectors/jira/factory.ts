/**
 * Jira data source factory.
 *
 * Creates a {@link JiraConnector} and {@link JiraWorkItemPoller} from config.
 * Self-registers with the data source registry at import time.
 */

import type { IDataSourceConfig, IJiraConnectionConfig, IAgentProfile } from "../../../config/types";
import type { IDataSourceConnector } from "../../connector";
import type { IWorkItemPoller } from "../../poller";
import { registerDataSourceFactory } from "../../registry";
import { jiraConnectionSchema } from "../../../config/schemas";
import { JiraClient } from "./jira-client";
import { JiraConnector } from "./jira-connector";
import { JiraWorkItemPoller } from "./jira-poller";
import { buildJqlFromProfiles } from "./jql-builder";

/**
 * Resolve JIRA credentials from environment variables.
 *
 * Convention: `JIRA_PAT_<KEY>` and `JIRA_EMAIL_<KEY>` where `<KEY>` is the
 * data source key uppercased with dashes replaced by underscores.
 *
 * @throws if either env var is missing
 */
function resolveJiraCredentials(sourceKey: string): { email: string; apiToken: string } {
  const envKey = sourceKey.toUpperCase().replace(/-/g, "_");
  const apiToken = process.env[`JIRA_PAT_${envKey}`];
  const email = process.env[`JIRA_EMAIL_${envKey}`];
  if (!apiToken || !email) {
    throw new Error(`JIRA_PAT_${envKey} and JIRA_EMAIL_${envKey} must be set in .env for data source "${sourceKey}"`);
  }
  return { email, apiToken };
}

/**
 * Creates Jira connector + poller for a single data source entry.
 *
 * Validates the connection config with the JIRA schema and injects
 * credentials from environment variables.
 *
 * @param sourceKey - Key from `config.dataSources` map
 * @param dsConfig - Data source config (raw connection — validated + enriched here)
 * @param profiles - All profiles (filtered internally to those referencing this source)
 * @param logger - Optional logger for startup messages
 */
export function createJiraDataSource(
  sourceKey: string,
  dsConfig: IDataSourceConfig,
  profiles: readonly IAgentProfile[],
  logger?: { info: (msg: string) => void },
): { connector: IDataSourceConnector; poller: IWorkItemPoller } {
  const rawConn = jiraConnectionSchema.parse(dsConfig.connection);
  const creds = resolveJiraCredentials(sourceKey);
  const conn: IJiraConnectionConfig = {
    baseUrl: rawConn.baseUrl,
    cloudId: rawConn.cloudId,
    excludeFields: rawConn.excludeFields,
    allowedUsers: rawConn.allowedUsers,
    ...creds,
  };
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
