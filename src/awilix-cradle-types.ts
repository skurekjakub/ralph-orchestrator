import type {
  IDataSourceConfig,
  IOutputConfig,
  IDashboardConfig,
  IPromptAuditConfig,
  IRalphchivesConfig,
  IAgentProfile,
  ClaudeAuthMode,
} from "./config/types";
import type { ICliRuntimeRegistry } from "./cli/cli-runtime";
import type { IActivityLog } from "./services/activity-log";
import type { Logger } from "./logger";
import type { IOperationLedger } from "./services/operation-ledger";
import type { ILogCollector } from "./logs/collector";
import type { PromptBuilder } from "./prompt/prompt-builder";
import type { ICliExecutorFactory } from "./container/cli-executor-factory";
import type { IProfileRouter } from "./services/profile-router";
import type { IIssueManager } from "./services/issue-manager";
import type { IResourceManager } from "./services/task-resource-manager";
import type { IAgentTemplateRenderer } from "./container/setup/agent-includes";
import type { IComposeOverlayWriter } from "./container/setup/compose-overlay-writer";
import type { ITriggerScanner } from "./services/trigger-scanner";
import type { ITaskRunner } from "./services/task-runner";
import type { IPostTaskHookRunner } from "./services/post-task-hook-runner";
import type { ITaskResultWriter } from "./services/task-result-writer";
import type { IRunArtifactsDeriver } from "./services/run-artifacts-deriver";
import type { ITextRedactor } from "./logs/text-redactor";
import type { IHeartbeatSender } from "./services/heartbeat";
import type { IContinuationRunner } from "./container/continuation-runner";
import type { IAgentSessionRunner } from "./container/agent-session-runner";
import type { ContainerManagerFactory } from "./container/types";
import type { IDataSourceConnector } from "./datasource/connector";
import type { IWorkItemPoller } from "./datasource/poller";
import type { IProfileSetupService } from "./services/profile-setup-service";
import type { IAgentPipelineExecutor } from "./services/agent-pipeline-executor";
import type { IVcsSourceClient, IVcsSourceProviderClient } from "./services/vcs-source-client";
import type { ITaskWorkspaceManager } from "./services/task-workspace-manager";
import type { IStageWorkspaceResolver } from "./services/stage-workspace";
import type { IComposeClient } from "./container/compose-client";
import type { IContainerLogCollector } from "./container/log-collector";
import type { IContainerWorkspaceCleaner } from "./container/workspace-cleaner";
import type { IContainerManager } from "./container/manager";

/**
 * Typed registration map for the orchestrator-level awilix container.
 *
 * Each key is a registered token; the value type is what the container resolves
 * when that token is requested. Used as the generic parameter for
 * `createContainer<OrchestratorCradle>()` to get full type inference on
 * `container.cradle` and `container.register()`.
 */
export interface OrchestratorCradle {
  // Orchestrator checkout
  rootDir: string;
  sourceReposDir: string;

  // Config slices
  dataSources: Readonly<Record<string, IDataSourceConfig>>;
  outputConfig: IOutputConfig;
  dashboardConfig: IDashboardConfig;
  profiles: readonly IAgentProfile[];
  promptAuditConfig: IPromptAuditConfig;
  ralphchivesConfig: IRalphchivesConfig;
  enableContinuation: boolean;
  claudeAuth: ClaudeAuthMode;

  // Infrastructure
  activityLog: IActivityLog;
  logger: Logger;
  containerLogger: Logger;

  // Data sources — per-source maps keyed by data source name
  connectors: ReadonlyMap<string, IDataSourceConnector>;
  pollers: ReadonlyMap<string, IWorkItemPoller>;

  // Services
  issueManager: IIssueManager;
  resources: IResourceManager;
  vcsProviderClients: readonly IVcsSourceProviderClient[];
  vcsSourceClient: IVcsSourceClient;

  // Orchestration
  ledger: IOperationLedger;
  router: IProfileRouter;
  triggerScanner: ITriggerScanner;

  // Execution infrastructure
  cliRuntimes: ICliRuntimeRegistry;
  logCollector: ILogCollector;
  promptBuilder: PromptBuilder;
  executorFactory: ICliExecutorFactory;
  continuationRunner: IContinuationRunner;
  sessionRunner: IAgentSessionRunner;
  templateRenderer: IAgentTemplateRenderer;
  overlayWriter: IComposeOverlayWriter;
  containerFactory: ContainerManagerFactory;
  workspaceManager: ITaskWorkspaceManager;
  stageWorkspaces: IStageWorkspaceResolver;
  profileSetup: IProfileSetupService;
  pipelineExecutor: IAgentPipelineExecutor;

  // Task runner
  textRedactor: ITextRedactor;
  runArtifacts: IRunArtifactsDeriver;
  resultWriter: ITaskResultWriter;
  hookRunner: IPostTaskHookRunner;
  taskRunner: ITaskRunner;

  // Optional
  heartbeat: IHeartbeatSender | null;
}

/** The cradle of one `dataSources` entry's scope: the root cradle plus the entry's key and config. */
export type DataSourceCradle = OrchestratorCradle & { sourceKey: string; dataSourceConfig: IDataSourceConfig };

/** The values a task scope opens with: the variant the task runs and its workspace on the host. */
export interface TaskValues {
  profile: IAgentProfile;
  workspacePath: string;
}

/** The cradle of one task's scope: the root cradle, the task's values and the task's container stack. */
export type TaskCradle = OrchestratorCradle &
  TaskValues & {
    composeFiles: readonly string[];
    squidConfPath: string;
    compose: IComposeClient;
    containerLogs: IContainerLogCollector;
    workspaceCleaner: IContainerWorkspaceCleaner;
    containerManager: IContainerManager;
  };
