import { join } from "node:path";
import { existsSync } from "node:fs";
import { createContainer, asValue, InjectionMode } from "awilix";
import type { IAppConfig, IAgentProfile } from "./config/types";
import type { OrchestratorCradle } from "./awilix-cradle-types";
import { wiring, type Registrations } from "./di/registration";
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
import { resolveComposeFiles } from "./container/setup/compose-files";
import { AgentTemplateRenderer } from "./container/setup/agent-includes";
import { SkillTemplateRenderer } from "./container/setup/skill-includes";
import { JitMcpConfigWriter } from "./container/setup/jit-mcp-params";
import { ComposeOverlayWriter } from "./container/setup/compose-overlay-writer";
import { CliExecutorFactory } from "./container/cli-executor-factory";
import { ProfileSetupService } from "./services/profile-setup-service";
import { AgentPipelineExecutor } from "./services/agent-pipeline-executor";
import {
  VcsSourceClient,
  adoVcsSourceProviderClient,
  githubVcsSourceProviderClient,
} from "./services/vcs-source-client";
import { ContainerLogCollector } from "./container/log-collector";
import { ContainerWorkspaceCleaner } from "./container/workspace-cleaner";
import { ContinuationRunner } from "./container/continuation-runner";
import { AgentSessionRunner } from "./container/agent-session-runner";
import { createCliRuntimeRegistry } from "./cli/supported-runtimes";
import { profileBuildPaths } from "./container/setup/build-paths";
import { repoCachePaths, TaskWorkspaceManager } from "./services/task-workspace-manager";
import { StageWorkspaceResolver } from "./services/stage-workspace";

/**
 * The compose client of a profile's stack, whose Squid mounts the profile's generated `squid.conf` and whose
 * agent and sidecar mount `workspacePath` at `/workspace`.
 *
 * @throws Error when profile setup has not written the profile's `squid.conf`.
 */
function buildComposeClient(profile: IAgentProfile, workspacePath: string, rootDir: string): IComposeClient {
  const composeFiles = resolveComposeFiles(profile, rootDir);
  const squidConfPath = join(profileBuildPaths(rootDir, profile.id).buildDir, "squid.conf");
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
  rootDir,
  outputConfig,
  enableContinuation,
  cliRuntimes,
  executorFactory,
  promptBuilder,
  logger,
  containerLogger,
}: Pick<
  OrchestratorCradle,
  | "rootDir"
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
      const compose = buildComposeClient(profile, workspacePath, rootDir);
      const logs = new ContainerLogCollector({ compose, logDir: outputConfig.logDir, logger });
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });
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
        sessionRunner,
        logger,
        containerLogger,
        enableContinuation,
      });
    },
    forceDown: async (profile) => {
      // `down` never reads the workspace mount's source, but compose refuses to load a mount with an empty one.
      const compose = buildComposeClient(profile, repoCachePaths(rootDir).workspacesDir, rootDir);
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
 *
 * @param options.rootDir The orchestrator checkout: the profile build directories, `shared/` sources, `cache/` and
 *   the output directory resolve against it.
 */
export function createCradle(config: IAppConfig, { rootDir }: { rootDir: string }): OrchestratorCradle {
  const container = createContainer<OrchestratorCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  const { connectors, pollers } = buildDataSourceMaps(config);

  const w = wiring<OrchestratorCradle>();
  const root: Registrations<Omit<OrchestratorCradle, "connectors" | "pollers">> = {
    rootDir: asValue(rootDir),
    sourceReposDir: asValue(repoCachePaths(rootDir).sourceReposDir),

    dataSources: asValue(config.dataSources),
    outputConfig: asValue(config.output),
    dashboardConfig: asValue(config.dashboard),
    profiles: asValue(config.profiles),
    promptAuditConfig: asValue(config.promptAudit),
    ralphchivesConfig: asValue(config.ralphchives),
    enableContinuation: asValue(config.enableContinuation),
    claudeAuth: asValue(config.claudeAuth),

    activityLog: w.service(ActivityLog).singleton(),
    logger: w.factory(({ activityLog }) => activityLog.createLogger()).singleton(),
    containerLogger: w.factory(({ activityLog }) => activityLog.createContainerLogger()).singleton(),

    issueManager: w.service(IssueManager).singleton(),
    resources: w.service(TaskResourceManager).singleton(),
    vcsProviderClients: asValue([adoVcsSourceProviderClient, githubVcsSourceProviderClient]),
    vcsSourceClient: w.service(VcsSourceClient).singleton(),

    ledger: w.service(OperationLedger).singleton(),
    router: w.service(ProfileRouter).singleton(),
    triggerScanner: w.service(TriggerScanner).singleton(),

    cliRuntimes: w.factory(({ claudeAuth }) => createCliRuntimeRegistry(claudeAuth)).singleton(),
    logCollector: w.service(LogCollector).singleton(),
    promptBuilder: w.service(PromptBuilder).singleton(),
    executorFactory: w.service(CliExecutorFactory).singleton(),
    stageWorkspaces: w.service(StageWorkspaceResolver).singleton(),
    templateRenderer: w.service(AgentTemplateRenderer).singleton(),
    skillRenderer: w.service(SkillTemplateRenderer).singleton(),
    jitMcpConfig: w.service(JitMcpConfigWriter).singleton(),
    overlayWriter: w.service(ComposeOverlayWriter).singleton(),
    containerFactory: w.factory(buildContainerFactory).singleton(),
    workspaceManager: w.service(TaskWorkspaceManager).singleton(),
    profileSetup: w.service(ProfileSetupService).singleton(),
    pipelineExecutor: w.service(AgentPipelineExecutor).singleton(),

    textRedactor: w.service(HookRulesRedactor).singleton(),
    runArtifacts: w.service(RunArtifactsDeriver).singleton(),
    resultWriter: w.service(TaskResultWriter).singleton(),
    hookRunner: w.service(PostTaskHookRunner).singleton(),
    taskRunner: w.service(TaskRunner).singleton(),

    heartbeat: w
      .factory(({ dashboardConfig, logger }) =>
        dashboardConfig.enabled ? new HeartbeatSender({ dashboardConfig, logger }) : null,
      )
      .singleton(),
  };
  container.register(root);
  container.register({ connectors: asValue(connectors), pollers: asValue(pollers) });

  return container.cradle;
}
