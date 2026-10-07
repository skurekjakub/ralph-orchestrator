import { join } from "node:path";
import { existsSync } from "node:fs";
import { createContainer, asClass, asFunction, asValue, InjectionMode } from "awilix";
import type { IAppConfig, IAgentProfile } from "./config/types";
import type { OrchestratorCradle } from "./awilix-cradle-types";
import { deriveStageProfile, type ContainerManagerFactory } from "./container/types";
import { buildDataSourceMaps } from "./datasource/registry";
import { LogCollector } from "./logs/collector";
import { PromptBuilder } from "./prompt/prompt-builder";
import { ActivityLog } from "./services/activity-log";
import { ProfileRouter } from "./services/profile-router";
import { TaskRunner } from "./services/task-runner";
import { PostTaskHookRunner } from "./services/post-task-hook-runner";
import { TaskResultWriter } from "./services/task-result-writer";
import { RunArtifactsDeriver } from "./services/run-artifacts-deriver";
import { HookRulesRedactor } from "./logs/text-redactor";
import { TaskResourceManager } from "./services/task-resource-manager";
import { IssueManager } from "./services/issue-manager";
import { HeartbeatSender } from "./services/heartbeat";
import { OperationLedger } from "./services/operation-ledger";
import { TriggerScanner } from "./services/trigger-scanner";
import { ContainerManager } from "./container/manager";
import { ComposeClient, type IComposeClient } from "./container/compose-client";
import { ComposeFileResolver } from "./container/setup/compose-files";
import { AgentTemplateRenderer } from "./container/setup/agent-includes";
import { SkillTemplateRenderer } from "./container/setup/skill-includes";
import { JitMcpConfigWriter } from "./container/setup/jit-mcp-params";
import { ComposeOverlayWriter } from "./container/setup/compose-overlay-writer";
import { CliExecutorFactory } from "./container/cli-executor-factory";
import { ProfileSetupService } from "./services/profile-setup-service";
import { AgentPipelineExecutor } from "./services/agent-pipeline-executor";
import { VcsSourceClient } from "./services/vcs-source-client";
import { ContainerLogCollector } from "./container/log-collector";
import { ContainerWorkspaceCleaner } from "./container/workspace-cleaner";
import { LogSourceRegistry } from "./container/log-source-registry";
import { ContinuationRunner } from "./container/continuation-runner";
import { AgentSessionRunner } from "./container/agent-session-runner";
import { createCliRuntimeRegistry } from "./cli/supported-runtimes";
import { AgentCatalogProvider } from "./container/setup/agent-catalogs";
import { profileBuildPaths } from "./container/setup/build-paths";
import { repoCachePaths, TaskWorkspaceManager } from "./services/task-workspace-manager";
import { StageWorkspaceResolver } from "./services/stage-workspace";

/**
 * The compose client of a profile's stack, whose Squid mounts the profile's generated `squid.conf` and whose
 * agent and sidecar mount `workspacePath` at `/workspace`.
 *
 * @throws Error when profile setup has not written the profile's `squid.conf`.
 */
function buildComposeClient(profile: IAgentProfile, workspacePath: string): IComposeClient {
  const composeFiles = new ComposeFileResolver().resolve(profile);
  const squidConfPath = join(profileBuildPaths(process.cwd(), profile.id).buildDir, "squid.conf");
  if (!existsSync(squidConfPath)) {
    throw new Error(`Profile squid.conf not found at ${squidConfPath}; profile setup has not run for ${profile.id}`);
  }
  return new ComposeClient(composeFiles, { workspacePath, squidConfPath });
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
  cliRuntimes,
  executorFactory,
  promptBuilder,
  logger,
  containerLogger,
}: Pick<
  OrchestratorCradle,
  | "outputConfig"
  | "enableContinuation"
  | "cliRuntimes"
  | "executorFactory"
  | "promptBuilder"
  | "logger"
  | "containerLogger"
>): ContainerManagerFactory {
  return {
    create: (profile, workspacePath) => {
      const compose = buildComposeClient(profile, workspacePath);
      const logs = new ContainerLogCollector({ compose, logDir: outputConfig.logDir, logger });
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });
      const logRegistry = new LogSourceRegistry();
      const continuationRunner = new ContinuationRunner({ logger });
      const sessionRunner = new AgentSessionRunner({ continuationRunner, promptBuilder, logger });
      return new ContainerManager({
        profile,
        workspacePath,
        compose,
        cliRuntimes,
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
      // `down` never reads the workspace mount's source, but compose refuses to load a mount with an empty one.
      const compose = buildComposeClient(profile, repoCachePaths(process.cwd()).workspacesDir);
      await compose.compose(["down", "--volumes", "--remove-orphans"]);
    },
    createLocalSession: async (profile, stage, workspace) => {
      const stageProfile = deriveStageProfile(profile, stage);
      const executor = await executorFactory.createLocal(stageProfile, stage, workspace, containerLogger);
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
    claudeAuth: asValue(config.claudeAuth),

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
    cliRuntimes: asFunction(({ claudeAuth }: Pick<OrchestratorCradle, "claudeAuth">) =>
      createCliRuntimeRegistry(claudeAuth),
    ).singleton(),
    logCollector: asClass(LogCollector).singleton(),
    promptBuilder: asClass(PromptBuilder).singleton(),
    agentCatalogs: asFunction(() => new AgentCatalogProvider({ rootDir: process.cwd() })).singleton(),
    executorFactory: asFunction(
      ({ cliRuntimes, agentCatalogs }: Pick<OrchestratorCradle, "cliRuntimes" | "agentCatalogs">) =>
        new CliExecutorFactory({ cliRuntimes, agentCatalogs, rootDir: process.cwd() }),
    ).singleton(),
    stageWorkspaces: asFunction(
      ({ cliRuntimes }: Pick<OrchestratorCradle, "cliRuntimes">) =>
        new StageWorkspaceResolver({ cliRuntimes, rootDir: process.cwd() }),
    ).singleton(),
    templateRenderer: asClass(AgentTemplateRenderer).singleton(),
    skillRenderer: asClass(SkillTemplateRenderer).singleton(),
    jitMcpConfig: asClass(JitMcpConfigWriter).singleton(),
    overlayWriter: asClass(ComposeOverlayWriter).singleton(),
    containerFactory: asFunction(buildContainerFactory).singleton(),
    workspaceManager: asFunction(
      ({ logger, cliRuntimes }: Pick<OrchestratorCradle, "logger" | "cliRuntimes">) =>
        new TaskWorkspaceManager({
          logger,
          cliRuntimes,
          sourceReposDir: repoCachePaths(process.cwd()).sourceReposDir,
        }),
    ).singleton(),
    profileSetup: asClass(ProfileSetupService).singleton(),
    pipelineExecutor: asClass(AgentPipelineExecutor).singleton(),

    // ── Task runner ───────────────────────────────────────────────────────────
    textRedactor: asFunction(() => new HookRulesRedactor()).singleton(),
    runArtifacts: asClass(RunArtifactsDeriver).singleton(),
    resultWriter: asClass(TaskResultWriter).singleton(),
    hookRunner: asClass(PostTaskHookRunner).singleton(),
    taskRunner: asClass(TaskRunner).singleton(),

    // ── Optional ──────────────────────────────────────────────────────────────
    heartbeat: asFunction(({ dashboardConfig, logger }) =>
      dashboardConfig.enabled ? new HeartbeatSender({ dashboardConfig, logger }) : null,
    ).singleton(),
  });

  return container.cradle;
}
