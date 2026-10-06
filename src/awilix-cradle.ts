import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createContainer, asClass, asFunction, asValue, InjectionMode } from "awilix";
import type { IAppConfig, IAgentProfile } from "./config/types.js";
import type { OrchestratorCradle } from "./awilix-cradle-types.js";
import { deriveStageProfile, type ContainerManagerFactory } from "./container/types.js";
import { buildDataSourceMaps } from "./datasource/registry.js";
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
import { ComposeClient, type IComposeClient } from "./container/compose-client.js";
import { ComposeFileResolver } from "./container/setup/compose-files.js";
import { AgentTemplateRenderer } from "./container/setup/agent-includes.js";
import { SkillTemplateRenderer } from "./container/setup/skill-includes.js";
import { JitMcpConfigWriter } from "./container/setup/jit-mcp-params.js";
import { ComposeOverlayWriter } from "./container/setup/compose-overlay-writer.js";
import { CliExecutorFactory } from "./container/cli-executor-factory.js";
import { RepoSyncHook, type ILifecycleHook } from "./container/lifecycle.js";
import { ProfileSetupService } from "./services/profile-setup-service.js";
import { AgentPipelineExecutor } from "./services/agent-pipeline-executor.js";
import { VcsSourceClient } from "./services/vcs-source-client.js";
import { ContainerLogCollector } from "./container/log-collector.js";
import { ContainerWorkspaceCleaner } from "./container/workspace-cleaner.js";
import { LogSourceRegistry } from "./container/log-source-registry.js";
import { ContinuationRunner } from "./container/continuation-runner.js";
import { AgentSessionRunner } from "./container/agent-session-runner.js";

function buildComposeClient(profile: IAgentProfile): IComposeClient {
  const composeFiles = new ComposeFileResolver().resolve(profile);
  const profileSquid = resolve(process.cwd(), "profiles", profile.id, ".build/squid.conf");
  const squidConfPath = existsSync(profileSquid) ? profileSquid : resolve(process.cwd(), "shared/security/squid.conf");
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
}: Pick<
  OrchestratorCradle,
  "outputConfig" | "enableContinuation" | "executorFactory" | "promptBuilder" | "logger" | "containerLogger"
>): ContainerManagerFactory {
  return {
    create: (profile) => {
      const compose = buildComposeClient(profile);
      const executor = executorFactory.create(compose, profile, containerLogger);
      const logs = new ContainerLogCollector({ compose, logDir: outputConfig.logDir, logger });
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });
      const logRegistry = new LogSourceRegistry();
      const continuationRunner = new ContinuationRunner({ logger });
      const sessionRunner = new AgentSessionRunner({ continuationRunner, promptBuilder, logger });
      return new ContainerManager({
        profile,
        compose,
        executor,
        executorFactory,
        logs,
        cleaner,
        logRegistry,
        sessionRunner,
        logger,
        containerLogger,
        enableContinuation,
      });
    },
    forceDown: async (profile) => {
      const compose = buildComposeClient(profile);
      await compose.compose(["down", "--volumes", "--remove-orphans"]);
    },
    createLocalSession: (profile, stage) => {
      const stageProfile = deriveStageProfile(profile, stage);
      const executor = executorFactory.createLocal(stageProfile, process.cwd(), containerLogger);
      const continuationRunner = new ContinuationRunner({ logger });
      const sessionRunner = new AgentSessionRunner({ continuationRunner, promptBuilder, logger });
      return { executor, sessionRunner };
    },
  };
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
    dataSources: asValue(config.dataSources),
    outputConfig: asValue(config.output),
    dashboardConfig: asValue(config.dashboard),
    secrets: asValue(config.secrets),
    profiles: asValue(config.profiles),
    promptAuditConfig: asValue(config.promptAudit),
    ralphchivesConfig: asValue(config.ralphchives),
    enableContinuation: asValue(config.enableContinuation),
    preExecuteHooks: asValue([new RepoSyncHook()] as readonly ILifecycleHook[]),

    // ── Infrastructure ────────────────────────────────────────────────────────
    activityLog: asClass(ActivityLog).singleton(),
    logger: asFunction(({ activityLog }) => activityLog.createLogger()).singleton(),
    containerLogger: asFunction(({ activityLog }) => activityLog.createContainerLogger()).singleton(),

    // ── Data sources ──────────────────────────────────────────────────────────
    connectors: asValue(connectors),
    pollers: asValue(pollers),
    issueManager: asClass(IssueManager).singleton(),
    resources: asClass(TaskResourceManager).singleton(),
    vcsSourceClient: asFunction(() => new VcsSourceClient()).singleton(),

    // ── Orchestration ─────────────────────────────────────────────────────────
    ledger: asClass(OperationLedger).singleton(),
    router: asClass(ProfileRouter).singleton(),
    triggerScanner: asClass(TriggerScanner).singleton(),

    // ── Execution infrastructure ──────────────────────────────────────────────
    logCollector: asClass(LogCollector).singleton(),
    promptBuilder: asClass(PromptBuilder).singleton(),
    executorFactory: asClass(CliExecutorFactory).singleton(),
    templateRenderer: asClass(AgentTemplateRenderer).singleton(),
    skillRenderer: asClass(SkillTemplateRenderer).singleton(),
    jitMcpConfig: asClass(JitMcpConfigWriter).singleton(),
    overlayWriter: asClass(ComposeOverlayWriter).singleton(),
    containerFactory: asFunction(buildContainerFactory).singleton(),
    profileSetup: asClass(ProfileSetupService).singleton(),
    pipelineExecutor: asClass(AgentPipelineExecutor).singleton(),

    // ── Task runner ───────────────────────────────────────────────────────────
    resultWriter: asClass(TaskResultWriter).singleton(),
    taskRunner: asClass(TaskRunner).singleton(),

    // ── Optional ──────────────────────────────────────────────────────────────
    heartbeat: asFunction(({ dashboardConfig, logger }) =>
      dashboardConfig.enabled ? new HeartbeatSender({ dashboardConfig, logger }) : null,
    ).singleton(),
  });

  return container.cradle;
}
