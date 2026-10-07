import type {
  IDataSourceConfig,
  IOutputConfig,
  IDashboardConfig,
  IPromptAuditConfig,
  IRalphchivesConfig,
  IAgentProfile,
  IStageConfig,
  ClaudeAuthMode,
} from "./config/types";
import type { ICliRuntime, ICliRuntimeRegistry } from "./cli/cli-runtime";
import type { IActivityLog } from "./services/activity-log";
import type { Logger } from "./logger";
import type { IOperationLedger } from "./services/operation-ledger";
import type { ILogCollector } from "./logs/collector";
import type { PromptBuilder } from "./prompt/prompt-builder";
import type { ICliExecutor } from "./container/cli-executor";
import type { IStageExecutorFactory } from "./container/stage-executor-factory";
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
import type { ContainerManagerFactory, HostStageWorkspace } from "./container/types";
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
import type { Orchestrator } from "./orchestrator";
import type { DashboardServer } from "./services/dashboard-server";

/**
 * The cradle of the root awilix container: each key is a registered token, its type what the token resolves to.
 *
 * It types `container.cradle` and `resolve`. awilix's `register` accepts any resolvers, so the root registrations are
 * checked against this type through `Registrations` (`src/di/registration.ts`).
 */
export interface OrchestratorCradle {
  /** The orchestrator checkout. */
  rootDir: string;
  /** `cache/repos` under {@link rootDir}: one bare clone of each profile's `repoUrl`. */
  sourceReposDir: string;

  dataSources: Readonly<Record<string, IDataSourceConfig>>;
  outputConfig: IOutputConfig;
  dashboardConfig: IDashboardConfig;
  profiles: readonly IAgentProfile[];
  promptAuditConfig: IPromptAuditConfig;
  ralphchivesConfig: IRalphchivesConfig;
  enableContinuation: boolean;
  claudeAuth: ClaudeAuthMode;

  activityLog: IActivityLog;
  logger: Logger;
  containerLogger: Logger;

  /** Keyed by `dataSources` key. */
  connectors: ReadonlyMap<string, IDataSourceConnector>;
  /** Keyed by `dataSources` key. */
  pollers: ReadonlyMap<string, IWorkItemPoller>;

  issueManager: IIssueManager;
  resources: IResourceManager;
  vcsProviderClients: readonly IVcsSourceProviderClient[];
  vcsSourceClient: IVcsSourceClient;

  ledger: IOperationLedger;
  router: IProfileRouter;
  triggerScanner: ITriggerScanner;
  orchestrator: Orchestrator;
  dashboardServer: DashboardServer;

  cliRuntimes: ICliRuntimeRegistry;
  logCollector: ILogCollector;
  promptBuilder: PromptBuilder;
  continuationRunner: IContinuationRunner;
  sessionRunner: IAgentSessionRunner;
  templateRenderer: IAgentTemplateRenderer;
  overlayWriter: IComposeOverlayWriter;
  containerFactory: ContainerManagerFactory;
  workspaceManager: ITaskWorkspaceManager;
  stageWorkspaces: IStageWorkspaceResolver;
  profileSetup: IProfileSetupService;
  pipelineExecutor: IAgentPipelineExecutor;

  textRedactor: ITextRedactor;
  runArtifacts: IRunArtifactsDeriver;
  resultWriter: ITaskResultWriter;
  hookRunner: IPostTaskHookRunner;
  taskRunner: ITaskRunner;

  /** `null` unless the dashboard is enabled. */
  heartbeat: IHeartbeatSender | null;
}

/** The cradle of one `dataSources` entry's scope: the root cradle plus the entry's key and config. */
export type DataSourceCradle = OrchestratorCradle & { sourceKey: string; dataSourceConfig: IDataSourceConfig };

/** The values a task scope opens with: the variant the task runs and its workspace on the host. */
export type TaskValues = {
  profile: IAgentProfile;
  workspacePath: string;
};

/** The cradle of one task's scope: the root cradle, the task's values and the task's container stack. */
export type TaskCradle = OrchestratorCradle &
  TaskValues & {
    composeFiles: readonly string[];
    squidConfPath: string;
    compose: IComposeClient;
    containerLogs: IContainerLogCollector;
    workspaceCleaner: IContainerWorkspaceCleaner;
    containerManager: IContainerManager;
    stageExecutors: IStageExecutorFactory;
  };

/** The values every stage scope opens with. */
export type StageValues = {
  stage: IStageConfig;
  /** The variant with the stage's overrides applied (`deriveStageProfile`). */
  stageProfile: IAgentProfile;
  /** The runtime of the stage's CLI. */
  runtime: ICliRuntime;
};

/** The values a Claude Code stage scope opens with. */
export type ClaudeStageValues = StageValues & {
  /** Frontmatter `name` of the stage's root agent, from the profile's agent catalog. */
  agentName: string;
  /** Length of the longest subagent chain below the stage's root agent, from the profile's agent catalog. */
  subagentDepth: number;
};

/** The values a host stage scope opens with. */
export type HostStageValues = StageValues & {
  workspace: HostStageWorkspace;
  /** The pinned CLI the orchestrator installed (`node_modules/.bin/<cli>`). */
  binary: string;
};

/** The values a host Claude Code stage scope opens with. */
export type ClaudeHostStageValues = ClaudeStageValues &
  HostStageValues & {
    /** Host path of `shared/hooks`, whose audit hooks the session runs. */
    hooksDir: string;
    /** Frontmatter names of every agent the stage root can reach, root excluded, from the profile's agent catalog. */
    subagents: readonly string[];
  };

/** The cradle of a Claude Code container stage's scope, a child of its task's scope. */
export type ClaudeStageCradle = TaskCradle & ClaudeStageValues & { claudeCodeExecutor: ICliExecutor };

/** The cradle of a Copilot container stage's scope, a child of its task's scope. */
export type CopilotStageCradle = TaskCradle & StageValues & { copilotExecutor: ICliExecutor };

/**
 * The cradle of a host Claude Code stage's scope. It needs no task token, so any container holding the root tokens
 * can parent it.
 */
export type ClaudeHostStageCradle = OrchestratorCradle &
  ClaudeHostStageValues & { localClaudeCodeExecutor: ICliExecutor };

/**
 * The cradle of a host Copilot stage's scope. It needs no task token, so any container holding the root tokens can
 * parent it.
 */
export type CopilotHostStageCradle = OrchestratorCradle & HostStageValues & { localCopilotExecutor: ICliExecutor };
