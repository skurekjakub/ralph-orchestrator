import { join } from "node:path";
import type { AppConfig } from "./config.js";
import { JiraClient } from "./jira/client.js";
import { JiraPoller } from "./jira/poller.js";
import { LogCollector } from "./logs/collector.js";
import { ActivityLog } from "./services/activity-log.js";
import { ProfileRouter } from "./services/profile-router.js";
import { TaskRunner } from "./services/task-runner.js";
import { HeartbeatSender } from "./services/heartbeat.js";
import { OperationLedger } from "./services/operation-ledger.js";
import { TriggerScanner } from "./services/trigger-scanner.js";
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
  );
  const ledger = new OperationLedger(join(config.output.logDir, "history"));
  const logCollector = new LogCollector(config.output);
  const taskRunner = new TaskRunner(
    config,
    jiraClient,
    logCollector,
    logger,
    containerLogger,
  );
  const triggerScanner = new TriggerScanner(
    jiraClient, router, ledger, logger,
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
    jiraClient,
    router,
    taskRunner,
    triggerScanner,
    ledger,
    heartbeat,
    logger,
    poller,
  };
}
