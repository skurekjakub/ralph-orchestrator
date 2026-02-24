import type { IAppConfig } from "../config.js";
import type { IActivityLog } from "../services/activity-log.js";
import type { Logger } from "../logger.js";
import type { IJiraClient } from "../jira/client.js";
import type { IOperationLedger } from "../services/operation-ledger.js";
import type { ILogCollector } from "../logs/collector.js";
import type { PromptBuilder } from "../prompt/prompt-builder.js";
import type { ICliExecutorFactory } from "./cli-executor-factory.js";
import type { IProfileRouter } from "../services/profile-router.js";
import type { IIssueManager } from "../services/jira-issue-manager.js";
import type { IResourceManager } from "../services/task-resource-manager.js";
import type { IAgentTemplateRenderer } from "./setup/agent-includes.js";
import type { IJitMcpConfigWriter } from "./setup/jit-mcp-params.js";
import type { ITriggerScanner } from "../services/trigger-scanner.js";
import type { ITaskRunner } from "../services/task-runner.js";
import type { IJiraPoller } from "../jira/poller.js";
import type { IHeartbeatSender } from "../services/heartbeat.js";
import type { ContainerManagerFactory } from "./types.js";
import type { ILifecycleHook } from "./lifecycle.js";

/**
 * Typed registration map for the orchestrator-level awilix container.
 *
 * Each key is a registered token; the value type is what the container resolves
 * when that token is requested. Used as the generic parameter for
 * `createContainer<OrchestratorCradle>()` to get full type inference on
 * `container.cradle` and `container.register()`.
 */
export interface OrchestratorCradle {
  // Config
  config: IAppConfig;

  // Infrastructure
  activityLog: IActivityLog;
  logger: Logger;
  containerLogger: Logger;

  // JIRA
  jiraClient: IJiraClient;
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
  jitMcpConfig: IJitMcpConfigWriter;
  containerFactory: ContainerManagerFactory;
  preExecuteHooks: readonly ILifecycleHook[];

  // Task runner
  taskRunner: ITaskRunner;

  // Optional
  heartbeat: IHeartbeatSender | null;
}
