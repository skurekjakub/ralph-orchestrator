/**
 * TaskRunner unit tests.
 *
 * Uses ContainerManagerFactory injection to test TaskRunner without Docker.
 * Each test provides a mock container via the factory, allowing verification
 * of the full pipeline: transitions → comments → container lifecycle → log collection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskRunner } from "../../src/services/task-runner.js";
import { TaskStatus, type ContainerManagerFactory } from "../../src/container/types.js";
import { StageMode } from "../../src/config/types.js";
import { TransitionPhase } from "../../src/orchestrator-types.js";
import type { IContainerManager } from "../../src/container/manager.js";
import { makeWorkItem, makeProfile, makeResult, makeTaskContext, makeConfig } from "../helpers/factories.js";
import { buildTaskContext } from "../../src/services/task-context.js";
import { createMockLogger, createMockContainer, createMockResultWriter, createMockResources, createMockIssueManager, createMockTemplateRenderer, createMockSkillRenderer, createMockJitMcpConfigWriter, createMockOverlayWriter } from "../helpers/mocks.js";

const DS = "jira";
const KEY = "DF-100";
const PID = "ralph-docs";

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return { ...orig, rmSync: vi.fn(), mkdirSync: vi.fn(), readFileSync: vi.fn().mockReturnValue("{}") };
});

function createMockFactory(container: IContainerManager): ContainerManagerFactory {
  return {
    create: vi.fn().mockReturnValue(container),
    forceDown: vi.fn().mockResolvedValue(undefined),
    createLocalSession: vi.fn().mockReturnValue({
      executor: { paths: { configDir: "", writableDirs: [], transcriptPath: "", logDir: "" }, run: vi.fn(), continueSession: vi.fn(), killActive: vi.fn() },
      sessionRunner: { run: vi.fn().mockResolvedValue({ taskId: "MOCK-1", status: TaskStatus.Completed, durationMs: 0, exitCode: 0, stdout: "", stderr: "", collectedLogs: {} }) },
    }),
  };
}

describe("TaskRunner", () => {
  let logger: ReturnType<typeof createMockLogger>;
  const taskId = "DF-100-1234567890000";
  const profile = makeProfile({
    id: PID,
    agentName: "ralph",
    match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: [] },
    beforeAgent: { targetStatus: "In Progress" },
    afterAgent: { targetStatus: "Ready for Review" },
  });
  const issue = makeWorkItem(KEY);

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
  });

  it("executes the full pipeline: transition → comment → start → setup → execute → collect", async () => {
    const { container, spies } = createMockContainer({ taskId: KEY, prUrl: "https://github.com/pr/1" });
    const factory = createMockFactory(container);
    const issueManager = createMockIssueManager();
    const resultWriter = createMockResultWriter();
    const runner = new TaskRunner({ resultWriter, logger, containerFactory: factory, resources: createMockResources(), issueManager, templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

    const { result } = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));
    expect(issueManager.transitionWorkItem).toHaveBeenCalledWith(DS, KEY, "In Progress", TransitionPhase.BeforeAgent);
    expect(issueManager.postStartComment).toHaveBeenCalledWith(DS, KEY, "ralph", PID);
    expect(spies.start).toHaveBeenCalled();
    expect(spies.checkPrerequisites).toHaveBeenCalled();
    expect(spies.prepareConfigDir).toHaveBeenCalled();
    expect(spies.registerLogSources).toHaveBeenCalledWith(taskId);
    expect(spies.setup).toHaveBeenCalled();
    expect(spies.executeWithExecutor).toHaveBeenCalled();
    expect(resultWriter.collectResults).toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.taskId).toBe(KEY);
  });

  it("returns container reference for caller to stop", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

    const { container: returnedContainer } = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(returnedContainer).toBe(container);
  });

  it("calls execution order: renderTemplates → start → checkPrerequisites → clean → registerLogs → setup → healthSnapshot → execute → collectResults", async () => {
    const callOrder: string[] = [];
    const { container, spies } = createMockContainer();
    spies.start.mockImplementation(() => { callOrder.push("start"); return Promise.resolve(); });
    spies.checkPrerequisites.mockImplementation(() => { callOrder.push("check"); return Promise.resolve(); });
    spies.prepareConfigDir.mockImplementation(() => { callOrder.push("prepareConfig"); return Promise.resolve(); });
    spies.cleanPaths.mockImplementation(() => { callOrder.push("cleanPaths"); return Promise.resolve(); });
    spies.registerLogSources.mockImplementation(() => { callOrder.push("registerLogs"); });
    spies.setup.mockImplementation(() => { callOrder.push("setup"); return Promise.resolve(); });
    spies.executeWithExecutor.mockImplementation(() => { callOrder.push("execute"); return Promise.resolve(makeResult(KEY)); });

    const factory = createMockFactory(container);
    const renderer = createMockTemplateRenderer({
      render: vi.fn().mockImplementation(async () => { callOrder.push("renderTemplates"); }),
    });
    const jitMcpConfig = createMockJitMcpConfigWriter({
      write: vi.fn().mockImplementation(() => { callOrder.push("jitMcpConfig"); }),
    });
    const overlayWriter = createMockOverlayWriter({
      write: vi.fn().mockImplementation(() => { callOrder.push("overlayWriter"); }),
    });
    const resultWriter = createMockResultWriter({
      collectResults: vi.fn().mockImplementation(async () => { callOrder.push("collect"); }),
    });
    const runner = new TaskRunner({ resultWriter, logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: renderer, skillRenderer: createMockSkillRenderer({ render: vi.fn().mockImplementation(async () => { callOrder.push("renderSkills"); }) }), jitMcpConfig, overlayWriter });
    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(callOrder).toEqual(["renderTemplates", "renderSkills", "jitMcpConfig", "overlayWriter", "start", "check", "prepareConfig", "cleanPaths", "registerLogs", "setup", "execute", "collect"]);
  });

  it("skips beforeAgent transition when not configured", async () => {
    const profileNoTransition = makeProfile({ id: PID, agentName: "ralph", beforeAgent: {} });
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const issueManager = createMockIssueManager();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager, templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

    await runner.run(makeTaskContext({ workItem: issue, profile: profileNoTransition, taskId }));

    expect(issueManager.transitionWorkItem).toHaveBeenCalledWith(DS, KEY, undefined, TransitionPhase.BeforeAgent);
  });

  it("returns error result when container start fails", async () => {
    const { container, spies } = createMockContainer();
    spies.start.mockRejectedValue(new Error("Docker not running"));
    const factory = createMockFactory(container);
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

    const { result } = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.stderr).toContain("Docker not running");
  });

  it("still collects logs on error", async () => {
    const { container, spies } = createMockContainer();
    spies.executeWithExecutor.mockRejectedValue(new Error("CLI crashed"));
    const factory = createMockFactory(container);
    const resultWriter = createMockResultWriter();
    const runner = new TaskRunner({ resultWriter, logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(resultWriter.collectLogs).toHaveBeenCalled();
  });

  it("propagates onToolOutput to the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });
    const onToolOutput = vi.fn();

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }), { onToolOutput });

    expect(container.onToolOutput).toBe(onToolOutput);
  });

  it("propagates onPreToolUse to the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });
    const onPreToolUse = vi.fn();

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }), { onPreToolUse });

    expect(container.onPreToolUse).toBe(onPreToolUse);
  });

  it("fetches handoff when issue is in a revision status", async () => {
    const revisionProfile = makeProfile({
      id: PID,
      agentName: "ralph",
      match: { projects: ["DF"], statuses: [], commentTrigger: "@docs", revisionStatuses: ["Defect Found"] },
    });
    const revisionIssue = makeWorkItem("DF-200", "Revision issue", "Defect Found");
    const { container } = createMockContainer({ taskId: "DF-200" });
    const factory = createMockFactory(container);
    const resources = createMockResources();
    const renderer = createMockTemplateRenderer();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources, issueManager: createMockIssueManager(), templateRenderer: renderer, skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

    await runner.run(buildTaskContext(revisionIssue, revisionProfile, "DF-200-1234567890000", makeConfig().ralphchives));

    expect(resources.fetchHandoff).toHaveBeenCalledWith(DS, "DF-200");
    expect(renderer.render).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ isRevision: true, taskId: "DF-200", taskStatus: "Defect Found" }),
      logger,
    );
  });

  it("renders templates with isRevision false for standard tasks", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const renderer = createMockTemplateRenderer();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: renderer, skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(renderer.render).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ isRevision: false, taskId: KEY, profileId: PID, triggerParams: {} }),
      logger,
    );
  });

  it("passes triggerParams to template context", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const renderer = createMockTemplateRenderer();
    const jitMcpConfig = createMockJitMcpConfigWriter();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: renderer, skillRenderer: createMockSkillRenderer(), jitMcpConfig, overlayWriter: createMockOverlayWriter() });

    await runner.run(buildTaskContext(issue, profile, taskId, makeConfig().ralphchives, ["codesamples", "verbose"]));

    expect(renderer.render).toHaveBeenCalledWith(
      PID,
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
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig, overlayWriter: createMockOverlayWriter() });

    await runner.run(buildTaskContext(issue, profile, taskId, makeConfig().ralphchives, ["target_branch=develop", "verbose"]));

    expect(jitMcpConfig.write).toHaveBeenCalledWith(
      profile, issue, logger, { target_branch: "develop", verbose: "true" },
    );
  });

  it("skips handoff fetch when issue is not in revision status", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const resources = createMockResources();
    const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources, issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(resources.fetchHandoff).not.toHaveBeenCalled();
  });

  it("runs preExecuteHooks between setup and execute", async () => {
    const callOrder: string[] = [];
    const { container, spies } = createMockContainer();
    spies.setup.mockImplementation(() => { callOrder.push("setup"); return Promise.resolve(); });
    spies.executeWithExecutor.mockImplementation(() => { callOrder.push("execute"); return Promise.resolve(makeResult(KEY)); });

    const mockHook = {
      name: "test-hook",
      execute: vi.fn().mockImplementation(async () => { callOrder.push("hook"); }),
    };

    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(),
      issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter(),
      preExecuteHooks: [mockHook],
    });
    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(callOrder).toEqual(["setup", "hook", "execute"]);
    expect(mockHook.execute).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ workItem: issue, profile, taskId }),
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
      issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter(),
      preExecuteHooks: [hook1, hook2],
    });
    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

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
      issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter(),
      preExecuteHooks: [failingHook],
    });
    const { result } = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.stderr).toContain("hook failed");
  });

  describe("multi-stage pipeline", () => {
    it("executes all stages in order", async () => {
      const multiProfile = makeProfile({
        id: PID,
        agentName: "ralph.writer",
        stages: [
          { agent: "ralph.writer", role: "writer", mode: StageMode.Container, skills: [] },
          { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] },
        ],
      });
      const stageLabels: string[] = [];
      const { container, spies } = createMockContainer({ taskId: KEY });
      spies.executeWithExecutor.mockImplementation(async (_executor: unknown) => {
        stageLabels.push("executed");
        return makeResult(KEY);
      });
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      const { result } = await runner.run(makeTaskContext({ workItem: issue, profile: multiProfile, taskId }));

      expect(spies.createExecutorForStage).toHaveBeenCalledTimes(2);
      expect(spies.executeWithExecutor).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(TaskStatus.Completed);
      expect(result.stageResults).toHaveLength(2);
      expect(result.stageResults![0].role).toBe("writer");
      expect(result.stageResults![1].role).toBe("reviewer");
    });

    it("aborts pipeline on stage failure", async () => {
      const multiProfile = makeProfile({
        id: PID,
        agentName: "ralph.writer",
        stages: [
          { agent: "ralph.writer", role: "writer", mode: StageMode.Container, skills: [] },
          { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] },
        ],
      });
      const { container, spies } = createMockContainer({ taskId: KEY });
      spies.executeWithExecutor.mockResolvedValue(makeResult(KEY, { status: TaskStatus.Error }));
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      const { result } = await runner.run(makeTaskContext({ workItem: issue, profile: multiProfile, taskId }));

      expect(spies.executeWithExecutor).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(TaskStatus.Error);
      // Single stage executed (the second was skipped), so no stageResults array
      expect(result.stageResults).toBeUndefined();
    });

    it("omits stageResults for single-stage profiles", async () => {
      const { container } = createMockContainer({ taskId: KEY });
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      const { result } = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

      expect(result.stageResults).toBeUndefined();
    });

    it("computes durationMs as sum of all stage durations", async () => {
      const multiProfile = makeProfile({
        id: PID,
        agentName: "ralph.writer",
        stages: [
          { agent: "ralph.writer", role: "writer", mode: StageMode.Container, skills: [] },
          { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Container, skills: [] },
        ],
      });
      const { container, spies } = createMockContainer({ taskId: KEY });
      spies.executeWithExecutor
        .mockResolvedValueOnce(makeResult(KEY, { durationMs: 3000 }))
        .mockResolvedValueOnce(makeResult(KEY, { durationMs: 7000 }));
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      const { result } = await runner.run(makeTaskContext({ workItem: issue, profile: multiProfile, taskId }));

      expect(result.durationMs).toBe(10000);
    });

    it("creates different executors for mixed container+local stages", async () => {
      const mixedProfile = makeProfile({
        id: PID,
        agentName: "ralph.writer",
        stages: [
          { agent: "ralph.writer", role: "writer", mode: StageMode.Container, skills: [] },
          { agent: "ralph.reviewer", role: "reviewer", mode: StageMode.Local, skills: [] },
        ],
      });
      const { container, spies } = createMockContainer({ taskId: KEY });
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.run(makeTaskContext({ workItem: issue, profile: mixedProfile, taskId }));

      expect(spies.createExecutorForStage).toHaveBeenCalledTimes(2);
      expect(spies.createExecutorForStage).toHaveBeenCalledWith(
        expect.objectContaining({ role: "writer", mode: StageMode.Container }),
      );
      expect(spies.createExecutorForStage).toHaveBeenCalledWith(
        expect.objectContaining({ role: "reviewer", mode: StageMode.Local }),
      );
    });
  });

  describe("teardown", () => {
    it("calls container.stop() when container is running", async () => {
      const { container, spies } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.teardown(profile, container);

      expect(spies.stop).toHaveBeenCalled();
      expect(factory.forceDown).not.toHaveBeenCalled();
    });

    it("skips stop and forceDown when container is not running", async () => {
      const { container, spies } = createMockContainer();
      (container as { isRunning: boolean }).isRunning = false;
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.teardown(profile, container);

      expect(spies.stop).not.toHaveBeenCalled();
      expect(factory.forceDown).not.toHaveBeenCalled();
    });

    it("falls back to forceDown when container.stop() throws", async () => {
      const { container, spies } = createMockContainer();
      spies.stop.mockRejectedValue(new Error("compose down failed"));
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.teardown(profile, container);

      expect(spies.stop).toHaveBeenCalled();
      expect(factory.forceDown).toHaveBeenCalledWith(profile);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Graceful stop failed"));
    });

    it("calls forceDown directly when container is null", async () => {
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.teardown(profile, null);

      expect(factory.forceDown).toHaveBeenCalledWith(profile);
    });

    it("logs warning without throwing when both stop and forceDown fail", async () => {
      const { container, spies } = createMockContainer();
      spies.stop.mockRejectedValue(new Error("stop failed"));
      const factory = createMockFactory(container);
      vi.mocked(factory.forceDown).mockRejectedValue(new Error("forceDown failed"));
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await expect(runner.teardown(profile, container)).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Graceful stop failed"));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Fallback teardown failed"));
    });
  });

  describe("executePostTaskHooks", () => {
    function makeHookProfile(...hooks: Array<{ name: string; stages: Array<{ agent: string; role: string }> }>) {
      return makeProfile({
        id: PID,
        agentName: "ralph",
        postTaskHooks: hooks.map(h => ({
          name: h.name,
          stages: h.stages.map(s => ({ agent: s.agent, role: s.role, mode: StageMode.Local, skills: [] })),
        })),
      });
    }

    it("is a no-op when no hooks are configured", async () => {
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

      expect(factory.createLocalSession).not.toHaveBeenCalled();
    });

    it("runs a single hook with one stage after the main pipeline", async () => {
      const hookProfile = makeHookProfile({ name: "analysis", stages: [{ agent: "ralph.analyzer", role: "analyzer" }] });
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(factory.createLocalSession).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:analysis] Starting"));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:analysis] Finished"));
    });

    it("runs multiple stages within a single hook sequentially", async () => {
      const hookProfile = makeHookProfile({
        name: "analysis",
        stages: [
          { agent: "ralph.analyzer", role: "analyzer" },
          { agent: "ralph.improver", role: "improver" },
        ],
      });
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(factory.createLocalSession).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:analysis/analyzer] Completed"));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:analysis/improver] Completed"));
    });

    it("aborts remaining stages in a hook when a stage returns Error", async () => {
      const hookProfile = makeHookProfile({
        name: "analysis",
        stages: [
          { agent: "ralph.analyzer", role: "analyzer" },
          { agent: "ralph.improver", role: "improver" },
        ],
      });
      const { container } = createMockContainer();
      const factory = createMockFactory(container);

      // First stage returns error
      vi.mocked(factory.createLocalSession).mockReturnValueOnce({
        executor: { paths: { configDir: "", writableDirs: [], transcriptPath: "", logDir: "" }, run: vi.fn(), continueSession: vi.fn(), killActive: vi.fn() },
        sessionRunner: { run: vi.fn().mockResolvedValue({ taskId: "MOCK-1", status: TaskStatus.Error, durationMs: 0, exitCode: 1, stdout: "", stderr: "fail", collectedLogs: {} }) },
      });

      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      const { result } = await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      // Main pipeline still succeeds
      expect(result.status).toBe(TaskStatus.Completed);

      // Only first stage executed
      expect(factory.createLocalSession).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[hook:analysis/analyzer] Failed"));
    });

    it("aborts remaining stages when a stage returns Partial status", async () => {
      const hookProfile = makeHookProfile({
        name: "analysis",
        stages: [
          { agent: "ralph.analyzer", role: "analyzer" },
          { agent: "ralph.improver", role: "improver" },
        ],
      });
      const { container } = createMockContainer();
      const factory = createMockFactory(container);

      vi.mocked(factory.createLocalSession).mockReturnValueOnce({
        executor: { paths: { configDir: "", writableDirs: [], transcriptPath: "", logDir: "" }, run: vi.fn(), continueSession: vi.fn(), killActive: vi.fn() },
        sessionRunner: { run: vi.fn().mockResolvedValue({ taskId: "MOCK-1", status: TaskStatus.Partial, durationMs: 0, exitCode: 0, stdout: "", stderr: "", collectedLogs: {} }) },
      });

      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      const { result } = await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(result.status).toBe(TaskStatus.Completed);
      expect(factory.createLocalSession).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[hook:analysis/analyzer] Failed (partial)"));
    });

    it("continues to next hook when a hook fails with an exception", async () => {
      const hookProfile = makeHookProfile(
        { name: "hook-a", stages: [{ agent: "ralph.a", role: "a" }] },
        { name: "hook-b", stages: [{ agent: "ralph.b", role: "b" }] },
      );
      const { container } = createMockContainer();
      const factory = createMockFactory(container);

      // First hook throws
      vi.mocked(factory.createLocalSession)
        .mockReturnValueOnce({
          executor: { paths: { configDir: "", writableDirs: [], transcriptPath: "", logDir: "" }, run: vi.fn(), continueSession: vi.fn(), killActive: vi.fn() },
          sessionRunner: { run: vi.fn().mockRejectedValue(new Error("hook-a exploded")) },
        });

      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      const { result } = await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      // Main pipeline still succeeds
      expect(result.status).toBe(TaskStatus.Completed);

      // Both hooks were attempted (second used default mock which succeeds)
      expect(factory.createLocalSession).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[hook:hook-a] Unexpected error"));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:hook-b] Finished"));
    });

    it("does not run hooks when the main pipeline throws", async () => {
      const hookProfile = makeHookProfile({ name: "analysis", stages: [{ agent: "ralph.analyzer", role: "analyzer" }] });
      const { container, spies } = createMockContainer();
      spies.start.mockRejectedValue(new Error("container start failed"));
      const factory = createMockFactory(container);
      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      const { result } = await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(result.status).toBe(TaskStatus.Error);
      expect(factory.createLocalSession).not.toHaveBeenCalled();
    });

    it("tears down container before running hooks", async () => {
      const callOrder: string[] = [];
      const hookProfile = makeHookProfile({ name: "analysis", stages: [{ agent: "ralph.analyzer", role: "analyzer" }] });
      const { container, spies } = createMockContainer();
      spies.stop.mockImplementation(() => { callOrder.push("stop"); return Promise.resolve(); });

      const factory = createMockFactory(container);
      vi.mocked(factory.createLocalSession).mockReturnValue({
        executor: { paths: { configDir: "", writableDirs: [], transcriptPath: "", logDir: "" }, run: vi.fn(), continueSession: vi.fn(), killActive: vi.fn() },
        sessionRunner: { run: vi.fn().mockImplementation(async () => { callOrder.push("hook-run"); return { taskId: "MOCK-1", status: TaskStatus.Completed, durationMs: 0, exitCode: 0, stdout: "", stderr: "", collectedLogs: {} }; }) },
      });

      const runner = new TaskRunner({ resultWriter: createMockResultWriter(), logger, containerFactory: factory, resources: createMockResources(), issueManager: createMockIssueManager(), templateRenderer: createMockTemplateRenderer(), skillRenderer: createMockSkillRenderer(), jitMcpConfig: createMockJitMcpConfigWriter(), overlayWriter: createMockOverlayWriter() });

      await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(callOrder).toEqual(["stop", "hook-run"]);
    });
  });
});
