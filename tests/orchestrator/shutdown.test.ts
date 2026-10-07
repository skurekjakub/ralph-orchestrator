import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../../src/orchestrator";
import { makeProfile, makeWorkItem, makeDataSourceConfig } from "../helpers/factories";
import {
  createMockIssueManager,
  createMockTaskRunner,
  createMockPoller,
  createMockResources,
  createMockVcsSourceClient,
  createSilentLogger,
} from "../helpers/mocks";
import type { IActivityLog } from "../../src/services/activity-log";
import { OperationStatus, type IOperationLedger, type Operation } from "../../src/services/operation-ledger";
import type { IProfileRouter } from "../../src/services/profile-router";
import type { ITriggerScanner } from "../../src/services/trigger-scanner";
import { TaskStatus } from "../../src/container/types";
import type { TaskContext } from "../../src/services/task-context";

const TRIGGER = "@ralph";
const DATA_SOURCE = "test-source";

function makeOperation(variant: string, overrides: Partial<Operation> = {}): Operation {
  return {
    id: "op-1",
    dataSource: DATA_SOURCE,
    variant,
    triggerCommentId: "comment-1",
    commentTimestamp: "2026-01-01T00:00:00Z",
    discoveredAt: "2026-01-01T00:00:01Z",
    status: OperationStatus.Pending,
    triggerParams: [],
    ...overrides,
  };
}

function createMockActivityLog(): IActivityLog {
  return {
    onLogChange: vi.fn(),
    createLogger: () => createSilentLogger(),
    createContainerLogger: () => createSilentLogger(),
    startTaskLog: vi.fn().mockReturnValue("/tmp/task.jsonl"),
    endTaskLog: vi.fn(),
    push: vi.fn(),
    entries: [],
    activityFilePath: "/tmp/activity.jsonl",
  };
}

function createMockLedger(pendingOps: Array<{ issueKey: string; operation: Operation }> = []): IOperationLedger {
  let pending = [...pendingOps];
  return {
    onPending: vi.fn(),
    plan: vi.fn().mockReturnValue("op-1"),
    reject: vi.fn(),
    transition: vi.fn().mockImplementation((_ds, _key, _opId, to) => {
      // Remove from pending when activated
      if (to === OperationStatus.Active) {
        pending = pending.filter((p) => p.operation.id !== _opId);
      }
    }),
    getOperations: vi.fn().mockReturnValue([]),
    getPending: vi.fn().mockReturnValue([]),
    getActive: vi.fn().mockReturnValue(undefined),
    isConsumed: vi.fn().mockReturnValue(false),
    getConsumedTriggerIds: vi.fn().mockReturnValue(new Set()),
    hasPendingOrActive: vi.fn().mockReturnValue(false),
    recoverActiveOperations: vi.fn().mockReturnValue([]),
    getAllPending: vi.fn().mockImplementation(() => [...pending]),
  };
}

function createMockRouter(profile: ReturnType<typeof makeProfile>): IProfileRouter {
  return {
    match: vi.fn().mockResolvedValue({ profile, matchedStatus: true }),
    matchesProjectAndStatus: vi.fn().mockReturnValue(true),
    profileIds: [profile.id],
  };
}

function createMockTriggerScanner(): ITriggerScanner {
  return {
    scan: vi.fn().mockResolvedValue(0),
    clearCache: vi.fn(),
  };
}

interface OrchestratorTestHarness {
  orchestrator: Orchestrator;
  taskRunner: ReturnType<typeof createMockTaskRunner>;
  profile: ReturnType<typeof makeProfile>;
}

function createOrchestrator(
  opts: {
    pendingOps?: Array<{ issueKey: string; operation: Operation }>;
    taskRunnerRun?: (...args: any[]) => Promise<any>;
  } = {},
): OrchestratorTestHarness {
  const profile = makeProfile({
    id: "ralph-docs",
    match: { projects: ["DF"], statuses: [], commentTrigger: TRIGGER },
  });
  const operation = makeOperation(profile.variantKey);
  const pendingOps = opts.pendingOps ?? [{ issueKey: "DF-100", operation }];

  const taskRunner = createMockTaskRunner();
  if (opts.taskRunnerRun) {
    taskRunner.run.mockImplementation(opts.taskRunnerRun);
  }
  const poller = createMockPoller();
  const issueManager = createMockIssueManager({
    refreshWorkItem: vi.fn().mockResolvedValue(makeWorkItem("DF-100", "Test issue", "New")),
  });

  const orchestrator = new Orchestrator({
    dataSources: { [DATA_SOURCE]: makeDataSourceConfig() },
    profiles: [profile],
    activityLog: createMockActivityLog(),
    pollers: new Map([[DATA_SOURCE, poller]]),
    router: createMockRouter(profile),
    issueManager,
    resources: createMockResources(),
    vcsSourceClient: createMockVcsSourceClient(),
    taskRunner,
    triggerScanner: createMockTriggerScanner(),
    ledger: createMockLedger(pendingOps),
    heartbeat: null,
    ralphchivesConfig: { enabled: false, nodebbApiUrl: "", neo4jUri: "", neo4jUser: "" },
    outputConfig: { logDir: "/tmp/test-logs" },
    rootDir: "/srv/ralph",
  });

  return { orchestrator, taskRunner, profile };
}

describe("Orchestrator shutdown", () => {
  it("awaits active operation before resolving shutdown", async () => {
    const teardownOrder: string[] = [];

    const { orchestrator, taskRunner } = createOrchestrator({
      taskRunnerRun: (ctx: TaskContext) =>
        new Promise((resolve) => {
          // Wait for abort signal, then resolve after a brief cleanup delay
          ctx.signal.addEventListener(
            "abort",
            () => {
              teardownOrder.push("task-aborted");
              // Simulate container teardown delay
              setTimeout(() => {
                teardownOrder.push("task-cleanup-done");
                resolve({
                  taskId: ctx.workItem.id,
                  status: TaskStatus.Error,
                  durationMs: 0,
                  exitCode: 1,
                  stdout: "",
                  stderr: "aborted",
                  collectedLogs: {},
                });
              }, 50);
            },
            { once: true },
          );
        }),
    });

    // Start runs the main loop (don't await — it blocks)
    const startPromise = orchestrator.start();

    // Give the loop time to pick up the pending operation
    await new Promise((r) => setTimeout(r, 50));

    // Now shut down — this should wait for the task to finish
    await orchestrator.shutdown();
    teardownOrder.push("shutdown-resolved");

    expect(teardownOrder).toEqual(["task-aborted", "task-cleanup-done", "shutdown-resolved"]);

    // Verify teardown was called
    expect(taskRunner.teardown).toHaveBeenCalled();

    // Let start() promise settle
    await startPromise;
  });

  it("resolves immediately when no operation is active", async () => {
    const { orchestrator } = createOrchestrator({ pendingOps: [] });

    // Start the loop — it will enter waitForWork immediately
    const startPromise = orchestrator.start();

    // Give it time to enter the wait state
    await new Promise((r) => setTimeout(r, 20));

    const before = Date.now();
    await orchestrator.shutdown();
    const elapsed = Date.now() - before;

    // Should resolve almost instantly (no active operation to wait for)
    expect(elapsed).toBeLessThan(200);

    await startPromise;
  });

  it("shutdown handles task errors without throwing", async () => {
    const { orchestrator } = createOrchestrator({
      taskRunnerRun: (ctx: TaskContext) =>
        new Promise((_, reject) => {
          ctx.signal.addEventListener(
            "abort",
            () => {
              reject(new Error("Container crashed"));
            },
            { once: true },
          );
        }),
    });

    const startPromise = orchestrator.start();
    await new Promise((r) => setTimeout(r, 50));

    // Should not throw even though the task errors
    await expect(orchestrator.shutdown()).resolves.toBeUndefined();

    await startPromise;
  });
});
