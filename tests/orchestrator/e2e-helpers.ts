import { vi } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { Orchestrator } from "../../src/orchestrator.js";
import { OperationLedger } from "../../src/services/operation-ledger.js";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { TriggerScanner } from "../../src/services/trigger-scanner.js";
import { ActivityLog } from "../../src/services/activity-log.js";
import { makeProfile, makeConfig, makeResult } from "../helpers/factories.js";
import { createMockLogger, createMockIssueManager, createMockResources, createMockContainer, createMockPoller, createMockTaskRunner } from "../helpers/mocks.js";
import type { Mocked } from "../helpers/mocks.js";
import type { OrchestratorDeps } from "../../src/orchestrator-types.js";
import type { JiraIssue, JiraComment } from "../../src/jira/types.js";
import type { AgentProfile } from "../../src/config.js";
import type { RalphResult } from "../../src/container/types.js";
import type { IIssueManager } from "../../src/services/jira-issue-manager.js";
import type { ITaskRunner } from "../../src/services/task-runner.js";

const silentLogger = createMockLogger();

/**
 * Build a complete OrchestratorDeps with mock dependencies for E2E tests.
 *
 * The poller drains the provided issues exactly once, then returns empty.
 * Comments are served from the `comments` map keyed by issue key.
 * Task results default to success unless overridden.
 */
export function buildMockDeps(
  tempDir: string,
  options: {
    profile?: AgentProfile;
    issues?: JiraIssue[];
    comments?: Record<string, JiraComment[]>;
    searchResults?: Record<string, JiraIssue[]>;
    taskResult?: Partial<RalphResult>;
    taskError?: Error;
  },
): OrchestratorDeps {
  const profile =
    options.profile ??
    makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: ["DF"],
        statuses: [],
        commentTrigger: "@docs",
        revisionStatuses: [],
      },
    });
  const config = makeConfig([profile]);
  const logDir = join(tempDir, "logs");
  const historyDir = join(logDir, "history");
  mkdirSync(historyDir, { recursive: true });
  config.output.logDir = logDir;

  const activityLog = new ActivityLog(logDir);
  const router = new ProfileRouter([profile]);
  const ledger = new OperationLedger(historyDir);

  const issuesToDrain = [...(options.issues ?? [])];
  const commentsMap = options.comments ?? {};
  const searchMap = options.searchResults ?? {};

  for (const issue of issuesToDrain) {
    if (!searchMap[issue.key]) {
      searchMap[issue.key] = [issue];
    }
  }

  const issueMap: Record<string, JiraIssue> = {};
  for (const [key, issues] of Object.entries(searchMap)) {
    if (issues.length > 0) issueMap[key] = issues[0];
  }

  const { container: mockContainer } = createMockContainer();

  const issueManager = createMockIssueManager({
    getComments: vi.fn().mockImplementation(async (key: string) => {
      return commentsMap[key] ?? [];
    }),
    refreshIssue: vi.fn().mockImplementation(async (key: string) => {
      return issueMap[key] ?? null;
    }),
  });

  const resources = createMockResources();

  const taskRunner = createMockTaskRunner({
    run: options.taskError
      ? vi.fn().mockRejectedValue(options.taskError)
      : vi.fn().mockImplementation(async (issue: JiraIssue) => ({
          result: makeResult(issue.key, options.taskResult),
          container: mockContainer,
        })),
  });

  const triggerScanner = new TriggerScanner(
    issueManager,
    router,
    ledger,
    silentLogger,
  );

  let drainCount = 0;
  const poller = createMockPoller({
    drain: vi.fn().mockImplementation(() => {
      if (drainCount === 0) {
        drainCount++;
        return issuesToDrain;
      }
      return [];
    }),
  });

  return {
    config,
    activityLog,
    issueManager,
    resources,
    poller,
    router,
    taskRunner,
    triggerScanner,
    ledger,
    heartbeat: null,
    logger: silentLogger,
  };
}

/**
 * Run the orchestrator until a condition is met.
 *
 * The loop is event-driven (no timers). We observe state changes and
 * call `stop()` once the condition is satisfied or `maxMs` elapses.
 */
export async function runUntil(
  orchestrator: Orchestrator,
  stopCondition: () => boolean,
  maxMs = 5000,
): Promise<void> {
  const timeout = setTimeout(() => orchestrator.stop(), maxMs);

  orchestrator.observer.onStateChange(() => {
    if (stopCondition()) {
      clearTimeout(timeout);
      orchestrator.stop();
    }
  });

  await orchestrator.start();
  clearTimeout(timeout);
}

/**
 * Build OrchestratorDeps from an explicit set of profiles with direct mock overrides.
 *
 * Unlike {@link buildMockDeps}, this function does not set up automated
 * issue/comment plumbing. Use it for tests that need custom ledger state,
 * multi-profile setups, or non-standard mock behavior.
 */
export function buildBaseDeps(
  tempDir: string,
  options: {
    profiles: AgentProfile[];
    issueManager?: Partial<Mocked<IIssueManager>>;
    taskRunner?: Partial<Mocked<ITaskRunner>>;
    logDirName?: string;
  },
): OrchestratorDeps {
  const config = makeConfig(options.profiles);
  const logDir = join(tempDir, options.logDirName ?? "logs");
  const historyDir = join(logDir, "history");
  mkdirSync(historyDir, { recursive: true });
  config.output.logDir = logDir;

  const ledger = new OperationLedger(historyDir);
  const router = new ProfileRouter(options.profiles);
  const issueManager = createMockIssueManager(options.issueManager);
  const taskRunner = createMockTaskRunner(options.taskRunner);

  return {
    config,
    activityLog: new ActivityLog(logDir),
    issueManager,
    resources: createMockResources(),
    poller: createMockPoller(),
    router,
    taskRunner,
    triggerScanner: new TriggerScanner(issueManager, router, ledger, silentLogger),
    ledger,
    heartbeat: null,
    logger: silentLogger,
  };
}
