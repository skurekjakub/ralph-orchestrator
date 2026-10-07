import { join } from "node:path";
import { existsSync } from "node:fs";
import { createContainer, asValue, InjectionMode } from "awilix";
import type { IAppConfig } from "./config/types";
import type { OrchestratorCradle, TaskCradle, TaskValues } from "./awilix-cradle-types";
import { wiring, type Registrations } from "./di/registration";
import { createContainerManagerFactory } from "./container/container-manager-factory";
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
import { ComposeClient } from "./container/compose-client";
import { resolveComposeFiles } from "./container/setup/compose-files";
import { AgentTemplateRenderer } from "./container/setup/agent-includes";
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

const t = wiring<TaskCradle>();

/** Scoped task registrations; `squidConfPath` throws when profile setup has not written the profile's squid.conf. */
export const taskRegistrations: Registrations<Omit<TaskCradle, keyof OrchestratorCradle | keyof TaskValues>> = {
  composeFiles: t.factory(({ profile, rootDir }) => resolveComposeFiles(profile, rootDir)).scoped(),
  squidConfPath: t
    .factory(({ profile, rootDir }) => {
      const path = join(profileBuildPaths(rootDir, profile.id).buildDir, "squid.conf");
      if (!existsSync(path)) {
        throw new Error(`Profile squid.conf not found at ${path}; profile setup has not run for ${profile.id}`);
      }
      return path;
    })
    .scoped(),
  compose: t.service(ComposeClient).scoped(),
  containerLogs: t.service(ContainerLogCollector).scoped(),
  workspaceCleaner: t.service(ContainerWorkspaceCleaner).scoped(),
  containerManager: t.service(ContainerManager).scoped(),
};

/**
 * Create the awilix DI container: register the root services, the scoped task services and the container manager
 * factory that opens their scopes, then build each data source's connector and poller in a scope of its own.
 *
 * The data-source scopes resolve here, together with the root services they depend on (`activityLog`, `logger`);
 * every other root service resolves on first access through the returned cradle.
 *
 * @param config The loaded config: its slices become root tokens, and each `dataSources` entry gets a scope.
 * @param options.rootDir The orchestrator checkout: the profile build directories, `shared/` sources, `cache/` and
 *   the output directory resolve against it.
 * @returns The root cradle.
 * @throws Error with `resolveJiraCredentials`' message when a JIRA data source's `JIRA_PAT_<KEY>` or
 *   `JIRA_EMAIL_<KEY>` is unset, or when a data source's type has no registered factory; ZodError when a JIRA
 *   data source's connection fails its schema.
 */
export function createCradle(config: IAppConfig, { rootDir }: { rootDir: string }): OrchestratorCradle {
  const container = createContainer<OrchestratorCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  const w = wiring<OrchestratorCradle>();
  const root: Registrations<Omit<OrchestratorCradle, "connectors" | "pollers" | "containerFactory">> = {
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
    continuationRunner: w.service(ContinuationRunner).singleton(),
    sessionRunner: w.service(AgentSessionRunner).singleton(),
    stageWorkspaces: w.service(StageWorkspaceResolver).singleton(),
    templateRenderer: w.service(AgentTemplateRenderer).singleton(),
    overlayWriter: w.service(ComposeOverlayWriter).singleton(),
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
  container.register(taskRegistrations);
  container.register({ containerFactory: asValue(createContainerManagerFactory(container)) });
  const { connectors, pollers } = buildDataSourceMaps(container, config);
  container.register({ connectors: asValue(connectors), pollers: asValue(pollers) });

  return container.cradle;
}
