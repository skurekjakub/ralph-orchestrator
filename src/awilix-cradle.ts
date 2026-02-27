import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createContainer, asClass, asFunction, asValue, InjectionMode } from "awilix";
import type { IAppConfig, IAgentProfile, IJiraConnectionConfig, IDataSourceConfig } from "./config/types.js";
import { DataSourceType } from "./config/types.js";
import type { OrchestratorCradle } from "./awlix-cradle-types.js";
import type { IComposeClient } from "./container/compose-client.js";
import type { ContainerManagerFactory } from "./container/types.js";
import { JiraClient } from "./jira/client.js";
import { JiraConnector } from "./datasource/connectors/jira/jira-connector.js";
import { JiraWorkItemPoller } from "./datasource/connectors/jira/jira-poller.js";
import type { IDataSourceConnector } from "./datasource/connector.js";
import type { IWorkItemPoller } from "./datasource/poller.js";
import { LogCollector } from "./logs/collector.js";
import { PromptBuilder } from "./prompt/prompt-builder.js";
import { ActivityLog } from "./services/activity-log.js";
import { ProfileRouter } from "./services/profile-router.js";
import { TaskRunner } from "./services/task-runner.js";
import { TaskResultWriter } from "./services/task-result-writer.js";
import { TaskResourceManager } from "./services/task-resource-manager.js";
import { IssueManager } from "./services/issue-manager.js";
import { HeartbeatSender } from "./services/heartbeat.js";
import { OperationLedger } from "./services/operation-ledger.js";
import { TriggerScanner } from "./services/trigger-scanner.js";
import { ContainerManager } from "./container/manager.js";
import { ComposeClient } from "./container/compose-client.js";
import { ComposeFileResolver } from "./container/setup/compose-files.js";
import { AgentTemplateRenderer } from "./container/setup/agent-includes.js";
import { SkillTemplateRenderer } from "./container/setup/skill-includes.js";
import { JitMcpConfigWriter } from "./container/setup/jit-mcp-params.js";
import { CliExecutorFactory } from "./container/cli-executor-factory.js";
import { RepoSyncHook, type ILifecycleHook } from "./container/lifecycle.js";
import { ContainerLogCollector } from "./container/log-collector.js";
import { ContainerWorkspaceCleaner } from "./container/workspace-cleaner.js";
import { LogSourceRegistry } from "./container/log-source-registry.js";
import { ContinuationRunner } from "./container/continuation-runner.js";
import { buildJqlFromProfiles } from "./jira/jql-builder.js";

function buildComposeClient(profile: IAgentProfile): IComposeClient {
  const composeFiles = new ComposeFileResolver().resolve(profile);
  const profileSquid = resolve(process.cwd(), "profiles", profile.id, ".build/squid.conf");
  const squidConfPath = existsSync(profileSquid)
    ? profileSquid
    : resolve(process.cwd(), "shared/security/squid.conf");
  return new ComposeClient(composeFiles, {
    targetRepoPath: profile.repoPath,
    squidConfPath,
  });
}

/**
 * Builds the per-task ContainerManagerFactory.
 *
 * Declared as a named function so awilix resolves its parameter as a Pick of
 * OrchestratorCradle — it only touches the deps it declares, no others.
 */
function buildContainerFactory({
  outputConfig,
  enableContinuation,
  executorFactory,
  promptBuilder,
  logger,
  containerLogger,
}: Pick<OrchestratorCradle, "outputConfig" | "enableContinuation" | "executorFactory" | "promptBuilder" | "logger" | "containerLogger">): ContainerManagerFactory {
  return {
    create: (profile) => {
      const compose = buildComposeClient(profile);
      const executor = executorFactory.create(compose, profile, containerLogger);
      const logs = new ContainerLogCollector({ compose, logDir: outputConfig.logDir, logger });
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });
      const logRegistry = new LogSourceRegistry();
      const continuationRunner = new ContinuationRunner({ logger });
      return new ContainerManager({
        profile, compose, executor, logs, cleaner,
        logRegistry, continuationRunner, promptBuilder, logger, containerLogger,
        enableContinuation,
      });
    },
    forceDown: async (profile) => {
      const compose = buildComposeClient(profile);
      await compose.compose(["down", "--volumes", "--remove-orphans"]);
    },
  };
}

/**
 * Build per-data-source connectors and pollers from the config.
 * Each data source gets its own connector + poller instance keyed by source name.
 */
function buildDataSourceMaps(
  config: IAppConfig,
  logger?: { info: (msg: string) => void },
): { connectors: Map<string, IDataSourceConnector>; pollers: Map<string, IWorkItemPoller> } {
  const connectors = new Map<string, IDataSourceConnector>();
  const pollers = new Map<string, IWorkItemPoller>();

  for (const [key, ds] of Object.entries(config.dataSources)) {
    if (ds.type === DataSourceType.Jira) {
      const conn = ds.connection as unknown as IJiraConnectionConfig;
      const client = new JiraClient({ connection: conn });
      const connector = new JiraConnector(key, client, [...conn.excludeFields], conn.allowedUsers);
      connectors.set(key, connector);

      // Build JQL from profiles that reference this data source
      const sourceProfiles = config.profiles.filter((p) => p.dataSource === key);
      const queries = buildJqlFromProfiles(sourceProfiles);

      const poller = new JiraWorkItemPoller(connector, queries, ds.pollIntervalMs);
      pollers.set(key, poller);

      logger?.info(`Data source "${key}" (JIRA): ${queries.length} queries, poll ${ds.pollIntervalMs / 1000}s`);
    }
  }

  return { connectors, pollers };
}

/**
 * Create the awilix DI container with all registered services.
 *
 * Returns the full cradle proxy — services are lazily resolved on access.
 * The Orchestrator picks what it needs; other callers (e.g. index.tsx)
 * can access any registered service.
 */
export function createCradle(config: IAppConfig): OrchestratorCradle {
  const container = createContainer<OrchestratorCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  const { connectors, pollers } = buildDataSourceMaps(config);

  container.register({
    // ── Config slices ─────────────────────────────────────────────────────────
    dataSources:       asValue(config.dataSources),
    outputConfig:      asValue(config.output),
    dashboardConfig:   asValue(config.dashboard),
    secrets:           asValue(config.secrets),
    profiles:          asValue(config.profiles),
    promptAuditConfig: asValue(config.promptAudit),
    ralphchivesConfig: asValue(config.ralphchives),
    enableContinuation: asValue(config.enableContinuation),
    preExecuteHooks:   asValue([new RepoSyncHook()] as readonly ILifecycleHook[]),

    // ── Infrastructure ────────────────────────────────────────────────────────
    activityLog:     asClass(ActivityLog).singleton(),
    logger:          asFunction(({ activityLog }) =>
                       activityLog.createLogger()).singleton(),
    containerLogger: asFunction(({ activityLog }) =>
                       activityLog.createContainerLogger()).singleton(),

    // ── Data sources ──────────────────────────────────────────────────────────
    connectors:    asValue(connectors),
    pollers:       asValue(pollers),
    issueManager:  asClass(IssueManager).singleton(),
    resources:     asClass(TaskResourceManager).singleton(),

    // ── Orchestration ─────────────────────────────────────────────────────────
    ledger:         asClass(OperationLedger).singleton(),
    router:         asClass(ProfileRouter).singleton(),
    triggerScanner: asClass(TriggerScanner).singleton(),

    // ── Execution infrastructure ──────────────────────────────────────────────
    logCollector:     asClass(LogCollector).singleton(),
    promptBuilder:    asClass(PromptBuilder).singleton(),
    executorFactory:  asClass(CliExecutorFactory).singleton(),
    templateRenderer: asClass(AgentTemplateRenderer).singleton(),
    skillRenderer:    asClass(SkillTemplateRenderer).singleton(),
    jitMcpConfig:     asClass(JitMcpConfigWriter).singleton(),
    containerFactory: asFunction(buildContainerFactory).singleton(),

    // ── Task runner ───────────────────────────────────────────────────────────
    resultWriter: asClass(TaskResultWriter).singleton(),
    taskRunner: asClass(TaskRunner).singleton(),

    // ── Optional ──────────────────────────────────────────────────────────────
    heartbeat: asFunction(({ dashboardConfig, logger }) =>
                 dashboardConfig.enabled
                   ? new HeartbeatSender({ dashboardConfig, logger })
                   : null).singleton(),
  });

  return container.cradle;
}
