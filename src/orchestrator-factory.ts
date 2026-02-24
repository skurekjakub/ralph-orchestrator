import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createContainer, asClass, asFunction, asValue, InjectionMode } from "awilix";
import type { IAppConfig, IAgentProfile } from "./config.js";
import type { OrchestratorCradle } from "./container/cradle.js";
import type { OrchestratorDeps } from "./orchestrator-types.js";
import type { IComposeClient } from "./container/compose-client.js";
import type { ContainerManagerFactory } from "./container/types.js";
import { JiraClient } from "./jira/client.js";
import { JiraPoller } from "./jira/poller.js";
import { LogCollector } from "./logs/collector.js";
import { PromptBuilder } from "./prompt/prompt-builder.js";
import { ActivityLog } from "./services/activity-log.js";
import { ProfileRouter } from "./services/profile-router.js";
import { TaskRunner } from "./services/task-runner.js";
import { TaskJiraResourceManager } from "./services/task-resource-manager.js";
import { JiraIssueManager } from "./services/jira-issue-manager.js";
import { HeartbeatSender } from "./services/heartbeat.js";
import { OperationLedger } from "./services/operation-ledger.js";
import { TriggerScanner } from "./services/trigger-scanner.js";
import { ContainerManager } from "./container/manager.js";
import { ComposeClient } from "./container/compose-client.js";
import { ComposeFileResolver } from "./container/setup/compose-files.js";
import { AgentTemplateRenderer } from "./container/setup/agent-includes.js";
import { JitMcpConfigWriter } from "./container/setup/jit-mcp-params.js";
import { CliExecutorFactory } from "./container/cli-executor-factory.js";
import { RepoSyncHook, type ILifecycleHook } from "./container/lifecycle.js";
import { ContainerLogCollector } from "./container/log-collector.js";
import { ContainerWorkspaceCleaner } from "./container/workspace-cleaner.js";
import { LogSourceRegistry } from "./container/log-source-registry.js";
import { ContinuationRunner } from "./container/continuation-runner.js";

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
  config,
  executorFactory,
  promptBuilder,
  logger,
  containerLogger,
}: Pick<OrchestratorCradle, "config" | "executorFactory" | "promptBuilder" | "logger" | "containerLogger">): ContainerManagerFactory {
  return {
    create: (profile) => {
      const compose = buildComposeClient(profile);
      const executor = executorFactory.create(compose, profile, containerLogger);
      const logs = new ContainerLogCollector({ compose, logDir: config.output.logDir, logger });
      const cleaner = new ContainerWorkspaceCleaner({ compose, logger });
      const logRegistry = new LogSourceRegistry();
      const continuationRunner = new ContinuationRunner({ logger });
      return new ContainerManager({
        profile, compose, executor, logs, cleaner,
        logRegistry, continuationRunner, promptBuilder, logger, containerLogger,
        enableContinuation: config.enableContinuation,
      });
    },
    forceDown: async (profile) => {
      const compose = buildComposeClient(profile);
      await compose.compose(["down", "--volumes", "--remove-orphans"]);
    },
  };
}

/**
 * Build all service dependencies from config.
 *
 * The returned bag is passed to the Orchestrator constructor.
 * In tests, individual services can be replaced with mocks.
 */
export function createOrchestratorDeps(config: IAppConfig): OrchestratorDeps {
  const container = createContainer<OrchestratorCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  container.register({
    // ── Config & values ───────────────────────────────────────────────────────
    config:          asValue(config),
    preExecuteHooks: asValue([new RepoSyncHook()] as readonly ILifecycleHook[]),

    // ── Infrastructure ────────────────────────────────────────────────────────
    activityLog:     asClass(ActivityLog).singleton(),
    logger:          asFunction(({ activityLog }) =>
                       activityLog.createLogger()).singleton(),
    containerLogger: asFunction(({ activityLog }) =>
                       activityLog.createContainerLogger()).singleton(),

    // ── JIRA ──────────────────────────────────────────────────────────────────
    jiraClient:   asClass(JiraClient).singleton(),
    issueManager: asClass(JiraIssueManager).singleton(),
    resources:    asClass(TaskJiraResourceManager).singleton(),
    poller:       asClass(JiraPoller).singleton(),

    // ── Orchestration ─────────────────────────────────────────────────────────
    ledger:         asClass(OperationLedger).singleton(),
    router:         asClass(ProfileRouter).singleton(),
    triggerScanner: asClass(TriggerScanner).singleton(),

    // ── Execution infrastructure ──────────────────────────────────────────────
    logCollector:     asClass(LogCollector).singleton(),
    promptBuilder:    asClass(PromptBuilder).singleton(),
    executorFactory:  asClass(CliExecutorFactory).singleton(),
    templateRenderer: asClass(AgentTemplateRenderer).singleton(),
    jitMcpConfig:     asClass(JitMcpConfigWriter).singleton(),
    containerFactory: asFunction(buildContainerFactory).singleton(),

    // ── Task runner ───────────────────────────────────────────────────────────
    taskRunner: asClass(TaskRunner).singleton(),

    // ── Optional ──────────────────────────────────────────────────────────────
    heartbeat: asFunction(({ config: cfg, logger }) =>
                 cfg.dashboard.enabled
                   ? new HeartbeatSender({ config: cfg, logger })
                   : null).singleton(),
  });

  const { cradle } = container;
  return {
    config,
    activityLog:    cradle.activityLog,
    poller:         cradle.poller,
    router:         cradle.router,
    issueManager:   cradle.issueManager,
    resources:      cradle.resources,
    taskRunner:     cradle.taskRunner,
    triggerScanner: cradle.triggerScanner,
    ledger:         cradle.ledger,
    heartbeat:      cradle.heartbeat,
    logger:         cradle.logger,
  };
}
