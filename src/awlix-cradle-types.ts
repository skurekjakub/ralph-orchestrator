import type { IJiraConfig, IOutputConfig, IDashboardConfig, ISecretsConfig, IPromptAuditConfig, IRalphchivesConfig, IAgentProfile } from "./config/types.js";
import type { IActivityLog } from "./services/activity-log.js";
import type { Logger } from "./logger.js";
import type { IJiraClient } from "./jira/client.js";
import type { IOperationLedger } from "./services/operation-ledger.js";
import type { ILogCollector } from "./logs/collector.js";
import type { PromptBuilder } from "./prompt/prompt-builder.js";
import type { ICliExecutorFactory } from "./container/cli-executor-factory.js";
import type { IProfileRouter } from "./services/profile-router.js";
import type { IIssueManager } from "./services/issue-manager.js";
import type { IResourceManager } from "./services/task-resource-manager.js";
import type { IAgentTemplateRenderer } from "./container/setup/agent-includes.js";
import type { ISkillTemplateRenderer } from "./container/setup/skill-includes.js";
import type { IJitMcpConfigWriter } from "./container/setup/jit-mcp-params.js";
import type { ITriggerScanner } from "./services/trigger-scanner.js";
import type { ITaskRunner } from "./services/task-runner.js";
import type { ITaskResultWriter } from "./services/task-result-writer.js";
import type { IJiraPoller } from "./jira/poller.js";
import type { IHeartbeatSender } from "./services/heartbeat.js";
import type { ContainerManagerFactory } from "./container/types.js";
import type { IDataSourceConnector } from "./datasource/connector.js";
import type { ILifecycleHook } from "./container/lifecycle.js";

/**
 * Typed registration map for the orchestrator-level awilix container.
 *
 * Each key is a registered token; the value type is what the container resolves
 * when that token is requested. Used as the generic parameter for
 * `createContainer<OrchestratorCradle>()` to get full type inference on
 * `container.cradle` and `container.register()`.
 */
export interface OrchestratorCradle {
  // Config slices
  jiraConfig: IJiraConfig;
  outputConfig: IOutputConfig;
  dashboardConfig: IDashboardConfig;
  secrets: ISecretsConfig;
  profiles: readonly IAgentProfile[];
  promptAuditConfig: IPromptAuditConfig;
  ralphchivesConfig: IRalphchivesConfig;
  excludeFields: readonly string[];
  allowedUsers: readonly string[];
  enableContinuation: boolean;

  // Infrastructure
  activityLog: IActivityLog;
  logger: Logger;
  containerLogger: Logger;

  // JIRA
  jiraClient: IJiraClient;
  connector: IDataSourceConnector;
  issueManager: IIssueManager;
  resources: IResourceManager;
  poller: IJiraPoller;

  // Orchestration
  ledger: IOperationLedger;
  router: IProfileRouter;
  triggerScanner: ITriggerScanner;

  // Execution infrastructure
  logCollector: ILogCollector;
  promptBuilder: PromptBuilder;
  executorFactory: ICliExecutorFactory;
  templateRenderer: IAgentTemplateRenderer;
  skillRenderer: ISkillTemplateRenderer;
  jitMcpConfig: IJitMcpConfigWriter;
  containerFactory: ContainerManagerFactory;
  preExecuteHooks: readonly ILifecycleHook[];

  // Task runner
  resultWriter: ITaskResultWriter;
  taskRunner: ITaskRunner;

  // Optional
  heartbeat: IHeartbeatSender | null;
}
