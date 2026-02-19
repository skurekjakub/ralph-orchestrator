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
import { TransitionPhase } from "../../src/orchestrator-types.js";
import type { ContainerManagerFactory } from "../../src/container/types.js";
import type { IContainerManager } from "../../src/container/manager.js";
import { makeIssue, makeProfile, makeResult } from "../helpers/factories.js";
import { createMockLogger, createMockContainer, createMockLogCollector, createMockResources, createMockIssueManager } from "../helpers/mocks.js";

function createMockFactory(container: IContainerManager): ContainerManagerFactory {
  return { create: vi.fn().mockReturnValue(container) };
}

describe("TaskRunner", () => {
  let logger: ReturnType<typeof createMockLogger>;
  const profile = makeProfile({
    id: "ralph-docs",
    agentName: "ralph",
    match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: [] },
    beforeAgent: { targetStatus: "In Progress" },
    afterAgent: { targetStatus: "Ready for Review" },
  });
  const issue = makeIssue("DF-100");

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  it("executes the full pipeline: transition → comment → start → setup → execute → collect", async () => {
    const { container, spies } = createMockContainer({ issueKey: "DF-100", prUrl: "https://github.com/pr/1" });
    const factory = createMockFactory(container);
    const issueManager = createMockIssueManager();
    const runner = new TaskRunner(createMockLogCollector(), logger, factory, createMockResources(), issueManager);

    const { result } = await runner.run(issue, profile);

    expect(factory.create).toHaveBeenCalledWith(profile);
    expect(issueManager.transitionIssue).toHaveBeenCalledWith("DF-100", "In Progress", TransitionPhase.BeforeAgent);
    expect(issueManager.postStartComment).toHaveBeenCalledWith("DF-100", "ralph", "ralph-docs");
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
    const runner = new TaskRunner(createMockLogCollector(), logger, factory, createMockResources(), createMockIssueManager());

    const { container: returnedContainer } = await runner.run(issue, profile);

    expect(returnedContainer).toBe(container);
  });

  it("calls execution order: start → checkPrerequisites → clean → registerLogs → setup → execute", async () => {
    const callOrder: string[] = [];
    const { container, spies } = createMockContainer();
    spies.start.mockImplementation(() => { callOrder.push("start"); return Promise.resolve(); });
    spies.checkPrerequisites.mockImplementation(() => { callOrder.push("check"); return Promise.resolve(); });
    spies.cleanLogDirectory.mockImplementation(() => { callOrder.push("cleanLog"); return Promise.resolve(); });
    spies.cleanPaths.mockImplementation(() => { callOrder.push("cleanPaths"); return Promise.resolve(); });
    spies.registerLogSources.mockImplementation(() => { callOrder.push("registerLogs"); });
    spies.setup.mockImplementation(() => { callOrder.push("setup"); return Promise.resolve(); });
    spies.execute.mockImplementation(() => { callOrder.push("execute"); return Promise.resolve(makeResult("DF-100")); });
    spies.collectAll.mockImplementation(() => { callOrder.push("collect"); return Promise.resolve([]); });

    const factory = createMockFactory(container);
    const runner = new TaskRunner(createMockLogCollector(), logger, factory, createMockResources(), createMockIssueManager());
    await runner.run(issue, profile);

    expect(callOrder).toEqual(["start", "check", "cleanLog", "cleanPaths", "registerLogs", "setup", "execute", "collect"]);
  });

  it("skips beforeAgent transition when not configured", async () => {
    const profileNoTransition = makeProfile({ id: "ralph-docs", agentName: "ralph", beforeAgent: {} });
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const issueManager = createMockIssueManager();
    const runner = new TaskRunner(createMockLogCollector(), logger, factory, createMockResources(), issueManager);

    await runner.run(issue, profileNoTransition);

    expect(issueManager.transitionIssue).toHaveBeenCalledWith("DF-100", undefined, TransitionPhase.BeforeAgent);
  });

  it("returns error result when container start fails", async () => {
    const { container, spies } = createMockContainer();
    spies.start.mockRejectedValue(new Error("Docker not running"));
    const factory = createMockFactory(container);
    const runner = new TaskRunner(createMockLogCollector(), logger, factory, createMockResources(), createMockIssueManager());

    const { result } = await runner.run(issue, profile);

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.stderr).toContain("Docker not running");
  });

  it("still collects logs on error", async () => {
    const { container, spies } = createMockContainer();
    spies.execute.mockRejectedValue(new Error("CLI crashed"));
    const factory = createMockFactory(container);
    const runner = new TaskRunner(createMockLogCollector(), logger, factory, createMockResources(), createMockIssueManager());

    await runner.run(issue, profile);

    expect(spies.collectAll).toHaveBeenCalled();
  });

  it("propagates onToolOutput to the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner(createMockLogCollector(), logger, factory, createMockResources(), createMockIssueManager());
    const onToolOutput = vi.fn();
    runner.onToolOutput = onToolOutput;

    await runner.run(issue, profile);

    expect(container.onToolOutput).toBe(onToolOutput);
  });
});
