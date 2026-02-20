import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { AppConfig } from "./config.js";
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
import { CliExecutorFactory } from "./container/cli-executor-factory.js";
import type { ContainerManagerFactory } from "./container/types.js";
import type { OrchestratorDeps } from "./orchestrator-types.js";

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
    create: (profile) => new ContainerManager(profile, config, promptBuilder, executorFactory, logger, containerLogger),
    forceDown: async (profile) => {
      const composeFiles = new ComposeFileResolver().resolve(profile);
      const profileSquid = resolve(process.cwd(), "profiles", profile.id, ".build/squid.conf");
      const squidConfPath = existsSync(profileSquid)
        ? profileSquid
        : resolve(process.cwd(), "shared/security/squid.conf");
      const client = new ComposeClient(composeFiles, {
        targetRepoPath: profile.repoPath,
        squidConfPath,
      });
      await client.compose(["down", "--volumes", "--remove-orphans"]);
    },
  };
  const resources = new TaskJiraResourceManager(jiraClient, logger);
  const issueManager = new JiraIssueManager(jiraClient, logger);
  const taskRunner = new TaskRunner(
    logCollector,
    logger,
    containerFactory,
    resources,
    issueManager,
  );
  const triggerScanner = new TriggerScanner(
    issueManager, router, ledger, logger,
    join("output", "cache", "trigger-cache.json"),
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
