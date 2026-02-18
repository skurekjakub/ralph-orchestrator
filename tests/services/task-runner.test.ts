/**
 * TaskRunner unit tests.
 *
 * Uses ContainerManagerFactory injection to test TaskRunner without Docker.
 * Each test provides a mock container via the factory, allowing verification
 * of the full pipeline: transitions → comments → container lifecycle → log collection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskRunner } from "../../src/services/task-runner.js";
import { TaskStatus } from "../../src/container/types.js";
import type { ContainerManagerFactory } from "../../src/container/types.js";
import type { ContainerManager } from "../../src/container/manager.js";
import type { RalphResult } from "../../src/container/types.js";
import {
  makeIssue,
  makeProfile,
  makeResult,
  createMockLogger,
  createMockJiraClient,
} from "../helpers.js";

function createMockContainer(
  executeResult?: Partial<RalphResult>,
): {
  container: ContainerManager;
  spies: Record<string, ReturnType<typeof vi.fn>>;
} {
  const issueKey = executeResult?.issueKey ?? "DF-1";
  const result: RalphResult = makeResult(issueKey, executeResult);

  const spies = {
    start: vi.fn().mockResolvedValue(undefined),
    checkPrerequisites: vi.fn().mockResolvedValue(undefined),
    setup: vi.fn().mockResolvedValue(undefined),
    registerLogSources: vi.fn(),
    execute: vi.fn().mockResolvedValue(result),
    stop: vi.fn().mockResolvedValue(undefined),
    cleanLogDirectory: vi.fn().mockResolvedValue(undefined),
    cleanPaths: vi.fn().mockResolvedValue(undefined),
    collectAll: vi.fn().mockResolvedValue([]),
    attach: vi.fn(),
    detach: vi.fn(),
    setIssueKey: vi.fn(),
    addSource: vi.fn(),
  };

  const container = {
    start: spies.start,
    checkPrerequisites: spies.checkPrerequisites,
    setup: spies.setup,
    registerLogSources: spies.registerLogSources,
    execute: spies.execute,
    stop: spies.stop,
    onToolOutput: undefined,
    logs: {
      collectAll: spies.collectAll,
      attach: spies.attach,
      detach: spies.detach,
      setIssueKey: spies.setIssueKey,
      addSource: spies.addSource,
    },
    cleaner: {
      cleanLogDirectory: spies.cleanLogDirectory,
      cleanPaths: spies.cleanPaths,
    },
  } as unknown as ContainerManager;

  return { container, spies };
}

function createMockFactory(container: ContainerManager): ContainerManagerFactory {
  return { create: vi.fn().mockReturnValue(container) };
}

function createMockLogCollector() {
  return { saveExecutionSummary: vi.fn() } as any;
}

describe("TaskRunner", () => {
  let jira: ReturnType<typeof createMockJiraClient>;
  let logger: ReturnType<typeof createMockLogger>;
  const profile = makeProfile({
    id: "ralph-docs",
    agentName: "ralph",
    match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: [] },
    beforeAgent: { transitionId: "21" },
    afterAgent: { transitionId: "31" },
  });
  const issue = makeIssue("DF-100");

  beforeEach(() => {
    jira = createMockJiraClient();
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  it("executes the full pipeline: transition → comment → start → setup → execute → collect", async () => {
    const { container, spies } = createMockContainer({ issueKey: "DF-100", prUrl: "https://github.com/pr/1" });
    const factory = createMockFactory(container);
    const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

    const { result } = await runner.run(issue, profile);

    expect(factory.create).toHaveBeenCalledWith(profile);
    expect(jira.transitionIssue).toHaveBeenCalledWith("DF-100", "21");
    expect(jira.addComment).toHaveBeenCalled();
    expect(spies.start).toHaveBeenCalled();
    expect(spies.checkPrerequisites).toHaveBeenCalled();
    expect(spies.cleanLogDirectory).toHaveBeenCalled();
    expect(spies.registerLogSources).toHaveBeenCalledWith("DF-100");
    expect(spies.setup).toHaveBeenCalled();
    expect(spies.execute).toHaveBeenCalled();
    expect(spies.collectAll).toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.issueKey).toBe("DF-100");
  });

  it("returns container reference for caller to stop", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

    const { container: returnedContainer } = await runner.run(issue, profile);

    expect(returnedContainer).toBe(container);
  });

  it("calls execution order: start → checkPrerequisites → clean → registerLogs → setup → execute", async () => {
    const callOrder: string[] = [];
    const { container } = createMockContainer();
    // Override spies to track call order
    (container.start as any).mockImplementation(() => { callOrder.push("start"); return Promise.resolve(); });
    (container.checkPrerequisites as any).mockImplementation(() => { callOrder.push("check"); return Promise.resolve(); });
    (container.cleaner.cleanLogDirectory as any).mockImplementation(() => { callOrder.push("cleanLog"); return Promise.resolve(); });
    (container.cleaner.cleanPaths as any).mockImplementation(() => { callOrder.push("cleanPaths"); return Promise.resolve(); });
    (container.registerLogSources as any).mockImplementation(() => { callOrder.push("registerLogs"); });
    (container.setup as any).mockImplementation(() => { callOrder.push("setup"); return Promise.resolve(); });
    (container.execute as any).mockImplementation(() => { callOrder.push("execute"); return Promise.resolve(makeResult("DF-100")); });
    (container.logs.collectAll as any).mockImplementation(() => { callOrder.push("collect"); return Promise.resolve([]); });

    const factory = createMockFactory(container);
    const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);
    await runner.run(issue, profile);

    expect(callOrder).toEqual(["start", "check", "cleanLog", "cleanPaths", "registerLogs", "setup", "execute", "collect"]);
  });

  it("skips beforeAgent transition when not configured", async () => {
    const profileNoTransition = makeProfile({ id: "ralph-docs", agentName: "ralph", beforeAgent: {} });
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

    await runner.run(issue, profileNoTransition);

    expect(jira.transitionIssue).not.toHaveBeenCalled();
  });

  it("returns error result when container start fails", async () => {
    const { container } = createMockContainer();
    (container.start as any).mockRejectedValue(new Error("Docker not running"));
    const factory = createMockFactory(container);
    const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

    const { result } = await runner.run(issue, profile);

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.stderr).toContain("Docker not running");
  });

  it("still collects logs on error", async () => {
    const { container, spies } = createMockContainer();
    (container.execute as any).mockRejectedValue(new Error("CLI crashed"));
    const factory = createMockFactory(container);
    const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

    await runner.run(issue, profile);

    expect(spies.collectAll).toHaveBeenCalled();
  });

  it("propagates onToolOutput to the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);
    const onToolOutput = vi.fn();
    runner.onToolOutput = onToolOutput;

    await runner.run(issue, profile);

    expect(container.onToolOutput).toBe(onToolOutput);
  });

  describe("postErrorComment", () => {
    it("posts formatted error to JIRA", async () => {
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

      await runner.postErrorComment("DF-100", "Connection refused");

      expect(jira.addComment).toHaveBeenCalledWith("DF-100", expect.stringContaining("Connection refused"));
    });

    it("logs warning when comment fails", { timeout: 15000 }, async () => {
      jira.addComment.mockRejectedValue(new Error("JIRA down"));
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

      await runner.postErrorComment("DF-100", "some error");

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("transitionAfterAgent", () => {
    it("applies afterAgent transition", async () => {
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

      await runner.transitionAfterAgent("DF-100", profile);

      expect(jira.transitionIssue).toHaveBeenCalledWith("DF-100", "31");
    });

    it("skips when no afterAgent transition configured", async () => {
      const profileNoAfter = makeProfile({ id: "ralph-docs", agentName: "ralph", afterAgent: {} });
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner(jira, createMockLogCollector(), logger, factory);

      await runner.transitionAfterAgent("DF-100", profileNoAfter);

      expect(jira.transitionIssue).not.toHaveBeenCalled();
    });
  });
});
