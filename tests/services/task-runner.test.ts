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
import { makeIssue, makeProfile, makeResult, makeTaskContext, makeConfig } from "../helpers/factories.js";
import { buildTaskContext } from "../../src/services/task-context.js";
import { createMockLogger, createMockContainer, createMockResultWriter, createMockResources, createMockIssueManager, createMockTemplateRenderer, createMockSkillRenderer, createMockJitMcpConfigWriter } from "../helpers/mocks.js";

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return { ...orig, rmSync: vi.fn(), mkdirSync: vi.fn() };
});

function createMockFactory(container: IContainerManager): ContainerManagerFactory {
  return { create: vi.fn().mockReturnValue(container), forceDown: vi.fn().mockResolvedValue(undefined) };
}

describe("TaskRunner", () => {
  let logger: ReturnType<typeof createMockLogger>;
  const taskId = "DF-100-1234567890000";
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
    const resultWriter = createMockResultWriter();
    const runner = new TaskRunner({ resultWriter, logger, containerFactory: factory, resources: createMockResources(), issueManager, templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

    const { result } = await runner.run(makeTaskContext({ issue, profile, taskId }));
    expect(issueManager.transitionIssue).toHaveBeenCalledWith("DF-100", "In Progress", TransitionPhase.BeforeAgent);
    expect(issueManager.postStartComment).toHaveBeenCalledWith("DF-100", "ralph", "ralph-docs");
    expect(spies.start).toHaveBeenCalled();
    expect(spies.checkPrerequisites).toHaveBeenCalled();
    expect(spies.prepareConfigDir).toHaveBeenCalled();
    expect(spies.registerLogSources).toHaveBeenCalledWith(taskId);
    expect(spies.setup).toHaveBeenCalled();
    expect(spies.execute).toHaveBeenCalled();
    expect(resultWriter.collectResults).toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.issueKey).toBe("DF-100");
  });

  it("returns container reference for caller to stop", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

    const { container: returnedContainer } = await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(returnedContainer).toBe(container);
  });

  it("calls execution order: renderTemplates → start → checkPrerequisites → clean → registerLogs → setup → execute → collectResults", async () => {
    const callOrder: string[] = [];
    const { container, spies } = createMockContainer();
    spies.start.mockImplementation(() => { callOrder.push("start"); return Promise.resolve(); });
    spies.checkPrerequisites.mockImplementation(() => { callOrder.push("check"); return Promise.resolve(); });
    spies.prepareConfigDir.mockImplementation(() => { callOrder.push("prepareConfig"); return Promise.resolve(); });
    spies.cleanPaths.mockImplementation(() => { callOrder.push("cleanPaths"); return Promise.resolve(); });
    spies.registerLogSources.mockImplementation(() => { callOrder.push("registerLogs"); });
    spies.setup.mockImplementation(() => { callOrder.push("setup"); return Promise.resolve(); });
    spies.execute.mockImplementation(() => { callOrder.push("execute"); return Promise.resolve(makeResult("DF-100")); });

    const factory = createMockFactory(container);
    const renderer = createMockTemplateRenderer({
      render: vi.fn().mockImplementation(async () => { callOrder.push("renderTemplates"); }),
    });
    const jitMcpConfig = createMockJitMcpConfigWriter({
      write: vi.fn().mockImplementation(() => { callOrder.push("jitMcpConfig"); }),
    });
    const resultWriter = createMockResultWriter({
      collectResults: vi.fn().mockImplementation(async () => { callOrder.push("collect"); }),
    });
    const runner = new TaskRunner({ resultWriter, logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: renderer, skillRenderer: createMockSkillRenderer({ render: vi.fn().mockImplementation(async () => { callOrder.push("renderSkills"); }) }), jitMcpConfig });
    await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(callOrder).toEqual(["renderTemplates", "renderSkills", "jitMcpConfig", "start", "check", "prepareConfig", "cleanPaths", "registerLogs", "setup", "execute", "collect"]);
  });

  it("skips beforeAgent transition when not configured", async () => {
    const profileNoTransition = makeProfile({ id: "ralph-docs", agentName: "ralph", beforeAgent: {} });
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const issueManager = createMockIssueManager();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager, templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

    await runner.run(makeTaskContext({ issue, profile: profileNoTransition, taskId }));

    expect(issueManager.transitionIssue).toHaveBeenCalledWith("DF-100", undefined, TransitionPhase.BeforeAgent);
  });

  it("returns error result when container start fails", async () => {
    const { container, spies } = createMockContainer();
    spies.start.mockRejectedValue(new Error("Docker not running"));
    const factory = createMockFactory(container);
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

    const { result } = await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.stderr).toContain("Docker not running");
  });

  it("still collects logs on error", async () => {
    const { container, spies } = createMockContainer();
    spies.execute.mockRejectedValue(new Error("CLI crashed"));
    const factory = createMockFactory(container);
    const resultWriter = createMockResultWriter();
    const runner = new TaskRunner({ resultWriter, logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

    await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(resultWriter.collectLogs).toHaveBeenCalled();
  });

  it("propagates onToolOutput to the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });
    const onToolOutput = vi.fn();

    await runner.run(makeTaskContext({ issue, profile, taskId }), { onToolOutput });

    expect(container.onToolOutput).toBe(onToolOutput);
  });

  it("propagates onPreToolUse to the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });
    const onPreToolUse = vi.fn();

    await runner.run(makeTaskContext({ issue, profile, taskId }), { onPreToolUse });

    expect(container.onPreToolUse).toBe(onPreToolUse);
  });

  it("fetches handoff when issue is in a revision status", async () => {
    const revisionProfile = makeProfile({
      id: "ralph-docs",
      agentName: "ralph",
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: ["Defect Found"] },
    });
    const revisionIssue = makeIssue("DF-200", "Revision issue", "Defect Found");
    const { container } = createMockContainer({ issueKey: "DF-200" });
    const factory = createMockFactory(container);
    const resources = createMockResources();
    const renderer = createMockTemplateRenderer();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources, issueManager: createMockIssueManager(), templateRenderer: renderer, skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

    await runner.run(buildTaskContext(revisionIssue, revisionProfile, "DF-200-1234567890000", makeConfig().ralphchives));

    expect(resources.fetchHandoff).toHaveBeenCalledWith("DF-200");
    expect(renderer.render).toHaveBeenCalledWith(
      "ralph-docs",
      expect.objectContaining({ isRevision: true, issueKey: "DF-200", issueStatus: "Defect Found" }),
      logger,
    );
  });

  it("renders templates with isRevision false for standard tasks", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const renderer = createMockTemplateRenderer();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: renderer, skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

    await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(renderer.render).toHaveBeenCalledWith(
      "ralph-docs",
      expect.objectContaining({ isRevision: false, issueKey: "DF-100", profileId: "ralph-docs", triggerParams: {} }),
      logger,
    );
  });

  it("passes triggerParams to template context", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const renderer = createMockTemplateRenderer();
    const jitMcpConfig = createMockJitMcpConfigWriter();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: renderer, skillRenderer: createMockSkillRenderer(), jitMcpConfig });

    await runner.run(buildTaskContext(issue, profile, taskId, makeConfig().ralphchives, ["codesamples", "verbose"]));

    expect(renderer.render).toHaveBeenCalledWith(
      "ralph-docs",
      expect.objectContaining({ triggerParams: { codesamples: "true", verbose: "true" } }),
      logger,
    );
    expect(jitMcpConfig.write).toHaveBeenCalledWith(
      profile, issue, logger, { codesamples: "true", verbose: "true" },
    );
  });

  it("passes triggerParams with key-value pairs to JIT MCP config writer", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const jitMcpConfig = createMockJitMcpConfigWriter();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig });

    await runner.run(buildTaskContext(issue, profile, taskId, makeConfig().ralphchives, ["target_branch=develop", "verbose"]));

    expect(jitMcpConfig.write).toHaveBeenCalledWith(
      profile, issue, logger, { target_branch: "develop", verbose: "true" },
    );
  });

  it("skips handoff fetch when issue is not in revision status", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const resources = createMockResources();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources, issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

    await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(resources.fetchHandoff).not.toHaveBeenCalled();
  });

  it("runs preExecuteHooks between setup and execute", async () => {
    const callOrder: string[] = [];
    const { container, spies } = createMockContainer();
    spies.setup.mockImplementation(() => { callOrder.push("setup"); return Promise.resolve(); });
    spies.execute.mockImplementation(() => { callOrder.push("execute"); return Promise.resolve(makeResult("DF-100")); });

    const mockHook = {
      name: "test-hook",
      execute: vi.fn().mockImplementation(async () => { callOrder.push("hook"); }),
    };

    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(),
      issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(),
      preExecuteHooks: [mockHook],
    });
    await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(callOrder).toEqual(["setup", "hook", "execute"]);
    expect(mockHook.execute).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ issue, profile, taskId }),
      logger,
    );
  });

  it("runs multiple preExecuteHooks sequentially", async () => {
    const callOrder: string[] = [];
    const { container } = createMockContainer();
    const hook1 = { name: "hook-1", execute: vi.fn().mockImplementation(async () => { callOrder.push("hook-1"); }) };
    const hook2 = { name: "hook-2", execute: vi.fn().mockImplementation(async () => { callOrder.push("hook-2"); }) };

    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(),
      issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(),
      preExecuteHooks: [hook1, hook2],
    });
    await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(callOrder).toEqual(["hook-1", "hook-2"]);
  });

  it("aborts task when a preExecuteHook throws", async () => {
    const { container } = createMockContainer();
    const failingHook = {
      name: "failing-hook",
      execute: vi.fn().mockRejectedValue(new Error("hook failed")),
    };

    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(),
      issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(),
      preExecuteHooks: [failingHook],
    });
    const { result } = await runner.run(makeTaskContext({ issue, profile, taskId }));

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.stderr).toContain("hook failed");
  });

  describe("teardown", () => {
    it("calls container.stop() when container is provided", async () => {
      const { container, spies } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

      await runner.teardown(profile, container);

      expect(spies.stop).toHaveBeenCalled();
      expect(factory.forceDown).not.toHaveBeenCalled();
    });

    it("falls back to forceDown when container.stop() throws", async () => {
      const { container, spies } = createMockContainer();
      spies.stop.mockRejectedValue(new Error("compose down failed"));
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

      await runner.teardown(profile, container);

      expect(spies.stop).toHaveBeenCalled();
      expect(factory.forceDown).toHaveBeenCalledWith(profile);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Graceful stop failed"));
    });

    it("calls forceDown directly when container is null", async () => {
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

      await runner.teardown(profile, null);

      expect(factory.forceDown).toHaveBeenCalledWith(profile);
    });

    it("logs warning without throwing when both stop and forceDown fail", async () => {
      const { container, spies } = createMockContainer();
      spies.stop.mockRejectedValue(new Error("stop failed"));
      const factory = createMockFactory(container);
      vi.mocked(factory.forceDown).mockRejectedValue(new Error("forceDown failed"));
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter() });

      await expect(runner.teardown(profile, container)).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Graceful stop failed"));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Fallback teardown failed"));
    });
  });
});
