import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { AppConfig, AgentProfile } from "./config.js";
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
import type { IComposeClient } from "./container/compose-client.js";
import { ComposeFileResolver } from "./container/setup/compose-files.js";
import { AgentTemplateRenderer } from "./container/setup/agent-includes.js";
import { JitMcpConfigWriter } from "./container/setup/jit-mcp-params.js";
import type { ContainerManagerFactory } from "./container/types.js";
import type { OrchestratorDeps } from "./orchestrator-types.js";
import { CliExecutorFactory } from "./container/cli-executor-factory.js";
import { RepoSyncHook } from "./container/lifecycle.js";
import { ContainerLogCollector } from "./container/log-collector.js";
import { ContainerWorkspaceCleaner } from "./container/workspace-cleaner.js";
import { LogSourceRegistry } from "./container/log-source-registry.js";
import { ContinuationRunner } from "./container/continuation-runner.js";

/** Build a ComposeClient for a profile, resolving compose files and squid config path. */
function buildComposeClient(profile: AgentProfile): IComposeClient {
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
 * Build all service dependencies from config.
 *
 * The returned bag is passed to the Orchestrator constructor.
 * In tests, individual services can be replaced with mocks.
 */
export function createOrchestratorDeps(config: AppConfig): OrchestratorDeps {
  const activityLog = new ActivityLog(config.output.logDir);
  const logger = activityLog.createLogger();
  const containerLogger = activityLog.createContainerLogger();
  const router = new ProfileRouter(config.profiles);
  const jiraClient = new JiraClient(
    config.jira,
    config.secrets.jiraEmail,
    config.secrets.jiraPat,
    logger,
  );
  const ledger = new OperationLedger(join(config.output.logDir, "history"));
  const logCollector = new LogCollector(config.output);
  const promptBuilder = new PromptBuilder(config.promptAudit.mode, logger, config.excludeFields);
  const executorFactory = new CliExecutorFactory(config);
  const containerFactory: ContainerManagerFactory = {
    create: (profile) => {
      const compose = buildComposeClient(profile);
      const executor = executorFactory.create(compose, profile, containerLogger);
      const logs = new ContainerLogCollector(compose, config.output.logDir, logger);
      const cleaner = new ContainerWorkspaceCleaner(compose, logger);
      const logRegistry = new LogSourceRegistry();
      const continuationRunner = new ContinuationRunner(logger);
      return new ContainerManager(
        profile, compose, executor, logs, cleaner,
        logRegistry, continuationRunner, promptBuilder, logger, containerLogger,
        config.enableContinuation,
      );
    },
    forceDown: async (profile) => {
      const compose = buildComposeClient(profile);
      await compose.compose(["down", "--volumes", "--remove-orphans"]);
    },
  };
  const resources = new TaskJiraResourceManager(jiraClient, logger);
  const issueManager = new JiraIssueManager(jiraClient, logger);
  const templateRenderer = new AgentTemplateRenderer();
  const jitMcpConfig = new JitMcpConfigWriter();
  const preExecuteHooks = [new RepoSyncHook()];
  const taskRunner = new TaskRunner(
    logCollector,
    logger,
    containerFactory,
    resources,
    issueManager,
    templateRenderer,
    jitMcpConfig,
    preExecuteHooks,
  );
  const triggerScanner = new TriggerScanner(
    issueManager, router, ledger, logger,
    join("output", "cache", "trigger-cache.json"),
    config.allowedUsers,
  );
  const heartbeat = config.dashboard.enabled
    ? new HeartbeatSender(
        config.dashboard.url,
        config.dashboard.secret,
        config.dashboard.intervalMs,
        logger,
      )
    : null;
  const poller = new JiraPoller(jiraClient, config.jira, logger);

  return {
    config,
    activityLog,
    issueManager,
    resources,
    router,
    taskRunner,
    triggerScanner,
    ledger,
    heartbeat,
    logger,
    poller,
  };
}
