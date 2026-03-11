import { vi } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { Orchestrator } from "../../src/orchestrator.js";
import { OperationLedger } from "../../src/services/operation-ledger.js";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { TriggerScanner } from "../../src/services/trigger-scanner.js";
import { ActivityLog } from "../../src/services/activity-log.js";
import { makeProfile, makeConfig, makeResult } from "../helpers/factories.js";
import { createMockLogger, createMockIssueManager, createMockResources, createMockPoller, createMockTaskRunner, createMockConnector, createMockVcsSourceClient, type Mocked } from "../helpers/mocks.js";
import type { WorkItem, WorkItemComment } from "../../src/datasource/types.js";
import type { IDataSourceConnector } from "../../src/datasource/connector.js";
import type { IAgentProfile } from "../../src/config/types.js";

type OrchestratorOpts = ConstructorParameters<typeof Orchestrator>[0];
import type { RalphResult } from "../../src/container/types.js";
import type { IIssueManager } from "../../src/services/issue-manager.js";
import type { IResourceManager } from "../../src/services/task-resource-manager.js";
import type { ITaskRunner } from "../../src/services/task-runner.js";
import type { IVcsSourceClient } from "../../src/services/vcs-source-client.js";

export const DS = "jira";
const silentLogger = createMockLogger();

/**
 * Build a complete OrchestratorOpts with mock dependencies for E2E tests.
 *
 * The poller drains the provided work items exactly once, then returns empty.
 * Comments are served from the `comments` map keyed by issue key.
 * Task results default to success unless overridden.
 */
export function buildMockDeps(
  tempDir: string,
  options: {
    profile?: IAgentProfile;
    issues?: WorkItem[];
    comments?: Record<string, WorkItemComment[]>;
    searchResults?: Record<string, WorkItem[]>;
    taskResult?: Partial<RalphResult>;
    taskError?: Error;
    resources?: Partial<Mocked<IResourceManager>>;
    vcsSourceClient?: Mocked<IVcsSourceClient>;
  },
): OrchestratorOpts {
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

  const activityLog = new ActivityLog({ outputConfig: { logDir, handoffDir: "" } });
  const router = new ProfileRouter({ profiles: [profile] });
  const ledger = new OperationLedger({ outputConfig: { logDir, handoffDir: "" } });

  const itemsToDrain = [...(options.issues ?? [])];
  const commentsMap = options.comments ?? {};
  const searchMap: Record<string, WorkItem[]> = options.searchResults ?? {};

  for (const item of itemsToDrain) {
    if (!searchMap[item.id]) {
      searchMap[item.id] = [item];
    }
  }

  const itemMap: Record<string, WorkItem> = {};
  for (const [key, items] of Object.entries(searchMap)) {
    if (items.length > 0) itemMap[key] = items[0];
  }

  const issueManager = createMockIssueManager({
    getComments: vi.fn().mockImplementation(async (_source: string, key: string) => {
      return commentsMap[key] ?? [];
    }),
    refreshWorkItem: vi.fn().mockImplementation(async (_source: string, key: string) => {
      return itemMap[key] ?? null;
    }),
  });

  const resources = createMockResources(options.resources);

  const taskRunner = createMockTaskRunner({
    run: options.taskError
      ? vi.fn().mockRejectedValue(options.taskError)
      : vi.fn().mockImplementation(async (ctx: any) =>
          makeResult(ctx.workItem.id, options.taskResult)
        ),
  });

  const triggerScanner = new TriggerScanner({
    issueManager,
    router,
    ledger,
    logger: silentLogger,
    connectors: new Map<string, IDataSourceConnector>([[DS, createMockConnector({ sourceKey: DS })]]),
  });
  triggerScanner.cachePath = null;

  let drainCount = 0;
  const poller = createMockPoller({
    sourceKey: DS,
    drain: vi.fn().mockImplementation(() => {
      if (drainCount === 0) {
        drainCount++;
        return itemsToDrain;
      }
      return [];
    }),
  });

  return {
    dataSources: config.dataSources,
    profiles: config.profiles,
    activityLog,
    issueManager,
    resources,
    vcsSourceClient: options.vcsSourceClient ?? createMockVcsSourceClient(),
    pollers: new Map([[DS, poller]]),
    router,
    taskRunner,
    triggerScanner,
    ralphchivesConfig: {
      enabled: false,
      neo4jUri: "",
      neo4jUser: "",
      nodebbApiUrl: ""
    },
    ledger,
    heartbeat: null,
    logger: silentLogger,
    outputConfig: { logDir, handoffDir: "" },
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
 * Build OrchestratorOpts from an explicit set of profiles with direct mock overrides.
 *
 * Unlike {@link buildMockDeps}, this function does not set up automated
 * issue/comment plumbing. Use it for tests that need custom ledger state,
 * multi-profile setups, or non-standard mock behavior.
 */
export function buildBaseDeps(
  tempDir: string,
  options: {
    profiles: IAgentProfile[];
    issueManager?: Partial<Mocked<IIssueManager>>;
    taskRunner?: Partial<Mocked<ITaskRunner>>;
    logDirName?: string;
  },
): OrchestratorOpts {
  const config = makeConfig(options.profiles);
  const logDir = join(tempDir, options.logDirName ?? "logs");
  const historyDir = join(logDir, "history");
  mkdirSync(historyDir, { recursive: true });

  const ledger = new OperationLedger({ outputConfig: { logDir, handoffDir: "" } });
  const router = new ProfileRouter({ profiles: options.profiles });
  const issueManager = createMockIssueManager(options.issueManager);
  const taskRunner = createMockTaskRunner(options.taskRunner);

  const scanner = new TriggerScanner({
    issueManager,
    router,
    ledger,
    logger: silentLogger,
    connectors: new Map<string, IDataSourceConnector>([[DS, createMockConnector({ sourceKey: DS })]]),
  });
  scanner.cachePath = null;

  return {
    dataSources: config.dataSources,
    profiles: config.profiles,
    activityLog: new ActivityLog({ outputConfig: { logDir, handoffDir: "" } }),
    issueManager,
    resources: createMockResources(),
    vcsSourceClient: createMockVcsSourceClient(),
    pollers: new Map([[DS, createMockPoller({ sourceKey: DS })]]),
    router,
    taskRunner,
    ralphchivesConfig: {
      enabled: false,
      neo4jUri: "",
      neo4jUser: "",
      nodebbApiUrl: ""
    },
    triggerScanner: scanner,
    ledger,
    heartbeat: null,
    logger: silentLogger,
    outputConfig: { logDir, handoffDir: "" },
  };
}
