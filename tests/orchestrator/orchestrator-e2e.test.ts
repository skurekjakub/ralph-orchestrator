import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Orchestrator } from "../../src/orchestrator.js";
import {
  OperationLedger,
  OperationStatus,
} from "../../src/services/operation-ledger.js";
import { ProfileRouter } from "../../src/services/profile-router.js";
import { TriggerScanner } from "../../src/services/trigger-scanner.js";
import { ActivityLog } from "../../src/services/activity-log.js";
import { makeProfile, makeIssue, makeConfig } from "../helpers.js";
import type { OrchestratorDeps } from "../../src/orchestrator-types.js";
import { OrchestratorStatus } from "../../src/orchestrator-types.js";
import type { JiraIssue, JiraComment } from "../../src/jira/types.js";
import type { AgentProfile } from "../../src/config.js";
import type { RalphResult } from "../../src/container/types.js";
import { TaskStatus } from "../../src/container/types.js";
import { HeartbeatStatus } from "../../src/services/heartbeat.js";
import type { Logger } from "../../src/logger.js";

/**
 * E2E orchestrator loop tests with mock dependencies.
 *
 * The orchestrator loop is event-driven: the poller and ledger signal
 * via callbacks when new work arrives. No fake timers needed.
 */

let tempDir: string;

const silentLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeComment(
  id: string,
  body: string,
  created = "2026-01-01T00:00:00Z",
): JiraComment {
  return { id, author: { displayName: "Test User" }, body, created };
}

function makeResult(
  issueKey: string,
  overrides: Partial<RalphResult> = {},
): RalphResult {
  return {
    issueKey,
    status: TaskStatus.Completed,
    durationMs: 5000,
    exitCode: 0,
    stdout: "Done",
    stderr: "",
    collectedLogs: {},
    ...overrides,
  };
}

function makeMockContainer() {
  return { stop: vi.fn().mockResolvedValue(undefined) };
}

function buildMockDeps(options: {
  profile?: AgentProfile;
  issues?: JiraIssue[];
  comments?: Record<string, JiraComment[]>;
  searchResults?: Record<string, JiraIssue[]>;
  taskResult?: Partial<RalphResult>;
  taskError?: Error;
}): OrchestratorDeps {
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

  const mockContainer = makeMockContainer();

  const jiraClient = {
    searchIssues: vi.fn().mockImplementation(async (jql: string) => {
      const keyMatch = jql.match(/key\s*=\s*(\S+)/);
      if (keyMatch) {
        return searchMap[keyMatch[1]] ?? [];
      }
      return issuesToDrain;
    }),
    addComment: vi.fn().mockResolvedValue(undefined),
    getComments: vi.fn().mockImplementation(async (key: string) => {
      return commentsMap[key] ?? [];
    }),
    transitionIssue: vi.fn().mockResolvedValue(undefined),
    getAttachments: vi.fn().mockResolvedValue([]),
    downloadAttachment: vi.fn().mockResolvedValue(Buffer.from("")),
    addAttachment: vi.fn().mockResolvedValue(undefined),
  } as any;

  const taskRunner = {
    run: options.taskError
      ? vi.fn().mockRejectedValue(options.taskError)
      : vi.fn().mockImplementation(async (issue: JiraIssue) => ({
          result: makeResult(issue.key, options.taskResult),
          container: mockContainer,
        })),
    transitionAfterAgent: vi.fn().mockResolvedValue(undefined),
    postErrorComment: vi.fn().mockResolvedValue(undefined),
  } as any;

  const triggerScanner = new TriggerScanner(
    jiraClient,
    router,
    ledger,
    silentLogger,
  );

  let drainCount = 0;
  const poller = {
    start: vi.fn(),
    stop: vi.fn(),
    onIssues: vi.fn(),
    drain: vi.fn().mockImplementation(() => {
      if (drainCount === 0) {
        drainCount++;
        return issuesToDrain;
      }
      return [];
    }),
  } as any;

  return {
    config,
    activityLog,
    jiraClient,
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
async function runUntil(
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

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "e2e-orchestrator-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Orchestrator E2E loop (mock deps)", () => {
  it("completes full cycle: poll -> trigger scan -> execute -> completion", async () => {
    const issue = makeIssue("DF-100", "Update API docs", "New");
    const deps = buildMockDeps({
      issues: [issue],
      comments: {
        "DF-100": [makeComment("C1", "@docs please handle this")],
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(
      orchestrator,
      () => orchestrator.observer.getState().completedToday.length > 0,
    );

    expect(deps.poller.start).toHaveBeenCalled();
    expect(deps.poller.stop).toHaveBeenCalled();
    expect(deps.jiraClient.addComment).toHaveBeenCalled();
    expect(deps.taskRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({ key: "DF-100" }),
      expect.objectContaining({ id: "ralph-docs" }),
    );
    expect(deps.taskRunner.transitionAfterAgent).toHaveBeenCalledWith(
      "DF-100",
      expect.objectContaining({ id: "ralph-docs" }),
    );

    const state = orchestrator.observer.getState();
    expect(state.completedToday).toHaveLength(1);
    expect(state.completedToday[0].key).toBe("DF-100");
    expect(state.completedToday[0].status).toBe(TaskStatus.Completed);

    const ops = deps.ledger.getOperations("DF-100");
    expect(ops).toHaveLength(1);
    expect(ops[0].status).toBe(OperationStatus.Completed);
  });

  it("posts error comment when agent returns error status without throwing", async () => {
    const issue = makeIssue("DF-150", "Agent CLI fails");
    const deps = buildMockDeps({
      issues: [issue],
      comments: {
        "DF-150": [makeComment("C1", "@docs handle this")],
      },
      taskResult: {
        status: TaskStatus.Error,
        exitCode: 1,
        stderr: "No such agent: ralph",
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(
      orchestrator,
      () => orchestrator.observer.getState().completedToday.length > 0,
    );

    expect(deps.taskRunner.postErrorComment).toHaveBeenCalledWith(
      "DF-150",
      "No such agent: ralph",
    );
    expect(deps.taskRunner.transitionAfterAgent).not.toHaveBeenCalled();

    const ops = deps.ledger.getOperations("DF-150");
    expect(ops[0].status).toBe(OperationStatus.Completed);
    expect(ops[0].resultStatus).toBe(TaskStatus.Error);
  });

  it("handles task runner errors gracefully", { timeout: 30_000 }, async () => {
    const issue = makeIssue("DF-200", "Broken task");
    const deps = buildMockDeps({
      issues: [issue],
      comments: {
        "DF-200": [makeComment("C1", "@docs handle this")],
      },
      taskError: new Error("Container build failed"),
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(
      orchestrator,
      () => orchestrator.observer.getState().completedToday.length > 0,
    );

    const state = orchestrator.observer.getState();
    expect(state.completedToday).toHaveLength(1);
    expect(state.completedToday[0].status).toBe(TaskStatus.Error);
    expect(deps.taskRunner.postErrorComment).toHaveBeenCalledWith(
      "DF-200",
      "Container build failed",
    );

    const ops = deps.ledger.getOperations("DF-200");
    expect(ops[0].status).toBe(OperationStatus.Error);
    expect(deps.taskRunner.transitionAfterAgent).not.toHaveBeenCalled();
  });

  it("rejects operation when issue status changed since planning", async () => {
    const profile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: ["DF"],
        statuses: ["New"],
        commentTrigger: "@docs",
        revisionStatuses: [],
      },
    });
    const issueAtPoll = makeIssue("DF-300", "Task that moved", "New");
    const issueAtExec = makeIssue("DF-300", "Task that moved", "Done");

    const deps = buildMockDeps({
      profile,
      issues: [issueAtPoll],
      comments: {
        "DF-300": [makeComment("C1", "@docs go")],
      },
      searchResults: {
        "DF-300": [issueAtExec],
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(orchestrator, () => {
      const ops = deps.ledger.getOperations("DF-300");
      return ops.length > 0 && ops[0].status === OperationStatus.Rejected;
    });

    const ops = deps.ledger.getOperations("DF-300");
    expect(ops[0].status).toBe(OperationStatus.Rejected);
    expect(deps.taskRunner.run).not.toHaveBeenCalled();
  });

  it("skips issues that match no profile", async () => {
    const issue = makeIssue("OTHER-1", "Wrong project");
    const deps = buildMockDeps({
      issues: [issue],
      comments: {
        "OTHER-1": [makeComment("C1", "@docs go")],
      },
    });

    const orchestrator = new Orchestrator(deps);

    // No matching profile -> nothing planned -> loop waits for signal -> timeout stops it
    await runUntil(orchestrator, () => false, 200);

    expect(deps.taskRunner.run).not.toHaveBeenCalled();
    expect(deps.ledger.getAllPending()).toHaveLength(0);
  });

  it("processes multiple operations sequentially", async () => {
    const issue1 = makeIssue("DF-400", "First task");
    const issue2 = makeIssue("DF-401", "Second task");

    const deps = buildMockDeps({
      issues: [issue1, issue2],
      comments: {
        "DF-400": [makeComment("C1", "@docs first")],
        "DF-401": [makeComment("C2", "@docs second")],
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(
      orchestrator,
      () => orchestrator.observer.getState().completedToday.length >= 2,
    );

    expect(deps.taskRunner.run).toHaveBeenCalledTimes(2);
    const state = orchestrator.observer.getState();
    expect(state.completedToday).toHaveLength(2);
    expect(state.completedToday.map((c) => c.key).sort()).toEqual([
      "DF-400",
      "DF-401",
    ]);
  });

  it("recovers crashed operations on startup", async () => {
    const profile = makeProfile({
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
    const logDir = join(tempDir, "crash-logs");
    const historyDir = join(logDir, "history");
    mkdirSync(historyDir, { recursive: true });
    config.output.logDir = logDir;

    const ledger = new OperationLedger(historyDir);
    ledger.plan("DF-500", {
      variant: "ralph-docs:ralph:@docs",
      triggerCommentId: "C1",
      commentTimestamp: "2026-01-01T00:00:00Z",
    });
    const ops = ledger.getOperations("DF-500");
    ledger.transition("DF-500", ops[0].id, OperationStatus.Active);

    const activityLog = new ActivityLog(logDir);
    const router = new ProfileRouter([profile]);
    const jiraClient = {
      searchIssues: vi.fn().mockResolvedValue([]),
      addComment: vi.fn().mockResolvedValue(undefined),
      getComments: vi.fn().mockResolvedValue([]),
      transitionIssue: vi.fn(),
      getAttachments: vi.fn().mockResolvedValue([]),
      downloadAttachment: vi.fn(),
      addAttachment: vi.fn(),
    } as any;

    const poller = {
      start: vi.fn(),
      stop: vi.fn(),
      onIssues: vi.fn(),
      drain: vi.fn().mockReturnValue([]),
    } as any;

    const triggerScanner = new TriggerScanner(
      jiraClient,
      router,
      ledger,
      silentLogger,
    );

    const deps: OrchestratorDeps = {
      config,
      activityLog,
      jiraClient,
      poller,
      router,
      taskRunner: {
        run: vi.fn(),
        transitionAfterAgent: vi.fn(),
        postErrorComment: vi.fn(),
      } as any,
      triggerScanner,
      ledger,
      heartbeat: null,
      logger: silentLogger,
    };

    const orchestrator = new Orchestrator(deps);

    // Recovery happens at startup, then loop idles -> timeout stops it
    await runUntil(orchestrator, () => false, 200);

    const recoveredOps = ledger.getOperations("DF-500");
    expect(recoveredOps[0].status).toBe(OperationStatus.Error);

    expect(jiraClient.addComment).toHaveBeenCalledWith(
      "DF-500",
      expect.stringContaining("ralph"),
    );
  });

  it("tracks state transitions during execution", async () => {
    const issue = makeIssue("DF-600", "State tracking test");
    const deps = buildMockDeps({
      issues: [issue],
      comments: {
        "DF-600": [makeComment("C1", "@docs go")],
      },
    });

    const states: string[] = [];
    const orchestrator = new Orchestrator(deps);

    orchestrator.observer.onStateChange((state) => {
      states.push(state.status);
    });

    await runUntil(
      orchestrator,
      () => orchestrator.observer.getState().completedToday.length > 0,
    );

    expect(states).toContain(OrchestratorStatus.Working);
    expect(states).toContain(OrchestratorStatus.Stopping);
  });

  it("emits heartbeat payload with correct shape", async () => {
    const issue = makeIssue("DF-700", "Heartbeat test");
    const deps = buildMockDeps({
      issues: [issue],
      comments: {
        "DF-700": [makeComment("C1", "@docs go")],
      },
    });

    const orchestrator = new Orchestrator(deps);

    await runUntil(
      orchestrator,
      () => orchestrator.observer.getState().completedToday.length > 0,
    );

    const payload = orchestrator.observer.getHeartbeatPayload();
    expect(payload).toHaveProperty("agentId");
    expect(payload).toHaveProperty("status");
    expect(payload).toHaveProperty("totalProcessed");
    expect(payload.totalProcessed).toBe(1);
    expect(payload.status).toBe(HeartbeatStatus.Stopped);
  });

  it("deduplicates trigger comments across multiple poll cycles", async () => {
    const issue = makeIssue("DF-800", "Dedup test");
    const deps = buildMockDeps({
      issues: [issue],
      comments: {
        "DF-800": [makeComment("C1", "@docs handle please")],
      },
    });

    // Return the same issue on every drain call — the trigger scanner
    // should only plan one operation because the comment is already consumed.
    deps.poller.drain = vi.fn().mockReturnValue([issue]);

    const orchestrator = new Orchestrator(deps);

    await runUntil(
      orchestrator,
      () => orchestrator.observer.getState().completedToday.length > 0,
    );

    // Despite the issue being returned on every drain, only 1 op was executed
    expect(deps.taskRunner.run).toHaveBeenCalledTimes(1);
    const ops = deps.ledger.getOperations("DF-800");
    expect(ops).toHaveLength(1);
  });

  it("resolves correct profile when same agent has variants for different projects", async () => {
    const dfProfile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: ["DF"],
        statuses: ["To Do"],
        commentTrigger: "@RalphDf",
        revisionStatuses: [],
      },
    });
    const docProfile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: {
        projects: ["DOC"],
        statuses: ["To Do"],
        commentTrigger: "@RalphDocs",
        revisionStatuses: [],
      },
    });

    // Variant keys must be distinct even though id + agentName are the same
    expect(dfProfile.variantKey).not.toBe(docProfile.variantKey);
    expect(dfProfile.variantKey).toBe("ralph-docs:ralph:@RalphDf");
    expect(docProfile.variantKey).toBe("ralph-docs:ralph:@RalphDocs");

    const config = makeConfig([dfProfile, docProfile]);
    const logDir = join(tempDir, "multi-variant-logs");
    const historyDir = join(logDir, "history");
    mkdirSync(historyDir, { recursive: true });
    config.output.logDir = logDir;

    const ledger = new OperationLedger(historyDir);
    const docIssue = makeIssue("DOC-100", "VS Code docs", "To Do");

    // Plan an operation for the DOC variant
    ledger.plan("DOC-100", {
      variant: docProfile.variantKey,
      triggerCommentId: "C1",
      commentTimestamp: "2026-01-01T00:00:00Z",
    });

    const activityLog = new ActivityLog(logDir);
    const router = new ProfileRouter([dfProfile, docProfile]);
    const mockContainer = makeMockContainer();
    const jiraClient = {
      searchIssues: vi.fn().mockResolvedValue([docIssue]),
      addComment: vi.fn().mockResolvedValue(undefined),
      getComments: vi.fn().mockResolvedValue([]),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
      getAttachments: vi.fn().mockResolvedValue([]),
      downloadAttachment: vi.fn(),
      addAttachment: vi.fn(),
    } as any;

    const taskRunner = {
      run: vi.fn().mockResolvedValue({
        result: makeResult("DOC-100"),
        container: mockContainer,
      }),
      transitionAfterAgent: vi.fn().mockResolvedValue(undefined),
      postErrorComment: vi.fn().mockResolvedValue(undefined),
    } as any;

    const triggerScanner = new TriggerScanner(
      jiraClient, router, ledger, silentLogger,
    );

    const poller = {
      start: vi.fn(),
      stop: vi.fn(),
      onIssues: vi.fn(),
      drain: vi.fn().mockReturnValue([]),
    } as any;

    const deps: OrchestratorDeps = {
      config,
      activityLog,
      jiraClient,
      poller,
      router,
      taskRunner,
      triggerScanner,
      ledger,
      heartbeat: null,
      logger: silentLogger,
    };

    const orchestrator = new Orchestrator(deps);
    await runUntil(
      orchestrator,
      () => orchestrator.observer.getState().completedToday.length > 0,
    );

    // The orchestrator must find the DOC profile (not the DF one) and execute
    expect(taskRunner.run).toHaveBeenCalledTimes(1);
    expect(taskRunner.run.mock.calls[0][1]).toBe(docProfile);
  });
});
