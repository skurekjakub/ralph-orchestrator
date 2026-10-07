/**
 * Jira data source factory.
 *
 * Builds a {@link JiraConnector} and {@link JiraWorkItemPoller} in the data source's awilix scope.
 * Self-registers with the data source registry at import time.
 */

import type { AwilixContainer } from "awilix";
import type { IDataSourceConfig, IJiraConnectionConfig } from "../../../config/types";
import type { DataSourceCradle } from "../../../awilix-cradle-types";
import { wiring, type Registrations } from "../../../di/registration";
import type { IDataSourceConnector } from "../../connector";
import type { IWorkItemPoller } from "../../poller";
import { registerDataSourceFactory } from "../../registry";
import { jiraConnectionSchema } from "../../../config/schemas";
import { JiraClient, type IJiraClient } from "./jira-client";
import { JiraConnector } from "./jira-connector";
import { JiraWorkItemPoller } from "./jira-poller";
import { buildJqlFromProfiles } from "./jql-builder";

/** The cradle of a JIRA data source's scope. */
export type JiraSourceCradle = DataSourceCradle & {
  jiraConnection: IJiraConnectionConfig;
  jiraClient: IJiraClient;
  excludeFields: string[];
  allowedUsers: readonly string[];
  queries: readonly string[];
  pollIntervalMs: number;
  connector: IDataSourceConnector;
  poller: IWorkItemPoller;
};

/**
 * Resolve JIRA credentials from environment variables.
 *
 * Convention: `JIRA_PAT_<KEY>` and `JIRA_EMAIL_<KEY>` where `<KEY>` is the
 * data source key uppercased with dashes replaced by underscores.
 *
 * @throws if either env var is missing
 */
export function resolveJiraCredentials(sourceKey: string): { email: string; apiToken: string } {
  const envKey = sourceKey.toUpperCase().replace(/-/g, "_");
  const apiToken = process.env[`JIRA_PAT_${envKey}`];
  const email = process.env[`JIRA_EMAIL_${envKey}`];
  if (!apiToken || !email) {
    throw new Error(`JIRA_PAT_${envKey} and JIRA_EMAIL_${envKey} must be set in .env for data source "${sourceKey}"`);
  }
  return { email, apiToken };
}

/**
 * The JIRA connection of a data source: its `connection` validated with the JIRA schema, plus the source's
 * credentials from {@link resolveJiraCredentials}.
 *
 * @throws ZodError when the connection fails the JIRA schema; Error when the source's credentials are unset.
 */
export function resolveJiraConnection(sourceKey: string, dataSourceConfig: IDataSourceConfig): IJiraConnectionConfig {
  return { ...jiraConnectionSchema.parse(dataSourceConfig.connection), ...resolveJiraCredentials(sourceKey) };
}

/**
 * Builds the JIRA connector and poller of one data source in its scope.
 *
 * The connection comes from {@link resolveJiraConnection}. The poller queries the projects of the profiles bound
 * to the source.
 *
 * @throws ZodError when the connection fails the JIRA schema; Error when the source's credentials are unset.
 */
export function createJiraDataSource(scope: AwilixContainer<DataSourceCradle>): {
  connector: IDataSourceConnector;
  poller: IWorkItemPoller;
} {
  const w = wiring<JiraSourceCradle>();
  const registrations: Registrations<Omit<JiraSourceCradle, keyof DataSourceCradle>> = {
    jiraConnection: w
      .factory(({ sourceKey, dataSourceConfig }) => resolveJiraConnection(sourceKey, dataSourceConfig))
      .scoped(),
    excludeFields: w.factory(({ jiraConnection }) => [...jiraConnection.excludeFields]).scoped(),
    allowedUsers: w.factory(({ jiraConnection }) => jiraConnection.allowedUsers).scoped(),
    queries: w
      .factory(({ sourceKey, profiles }) => buildJqlFromProfiles(profiles.filter((p) => p.dataSource === sourceKey)))
      .scoped(),
    pollIntervalMs: w.factory(({ dataSourceConfig }) => dataSourceConfig.pollIntervalMs).scoped(),
    jiraClient: w.service(JiraClient).scoped(),
    connector: w.service(JiraConnector).scoped(),
    poller: w.service(JiraWorkItemPoller).scoped(),
  };
  const { connector, poller } = scope.register(registrations).cradle;
  return { connector, poller };
}

registerDataSourceFactory("jira", createJiraDataSource);
