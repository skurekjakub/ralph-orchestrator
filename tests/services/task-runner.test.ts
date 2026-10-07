/**
 * TaskRunner unit tests.
 *
 * TaskRunner orchestrates the high-level phases of a task: profile preparation,
 * JIRA transitions, container lifecycle, agent execution, and post-task hooks.
 * Tests verify behavior (what the task pipeline does) not internal wiring.
 *
 * The stage loop and multi-stage logic live in AgentPipelineExecutor — those
 * scenarios are tested in agent-pipeline-executor.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskRunner } from "../../src/services/task-runner";
import { TaskStatus, type ContainerManagerFactory } from "../../src/container/types";
import { CliType, StageMode } from "../../src/config/types";
import { COPILOT_CONTAINER_LAYOUT } from "../../src/cli/copilot/copilot-layout";
import { TransitionPhase } from "../../src/orchestrator-types";
import type { IContainerManager } from "../../src/container/manager";
import { makeWorkItem, makeProfile, makeResult, makeStage, makeTaskContext, makeConfig } from "../helpers/factories";
import { buildTaskContext } from "../../src/services/task-context";
import {
  createMockLogger,
  createMockContainer,
  createMockResultWriter,
  createMockResources,
  createMockIssueManager,
  createMockProfileSetupService,
  createMockPipelineExecutor,
  createMockWorkspaceManager,
  createMockHookRunner,
} from "../helpers/mocks";

const DS = "jira";
const KEY = "DF-100";
const PID = "ralph-docs";

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return {
    ...orig,
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue("{}"),
    writeFileSync: vi.fn(),
  };
});

function createMockFactory(container: IContainerManager): ContainerManagerFactory {
  return {
    create: vi.fn().mockReturnValue(container),
    forceDown: vi.fn().mockResolvedValue(undefined),
    createLocalSession: vi.fn().mockReturnValue({
      executor: {
        cli: CliType.Copilot,
        run: vi.fn(),
        continueSession: vi.fn(),
        killActive: vi.fn(),
      },
      sessionRunner: {
        run: vi.fn().mockResolvedValue({
          taskId: "MOCK-1",
          status: TaskStatus.Completed,
          durationMs: 0,
          exitCode: 0,
          stdout: "",
          stderr: "",
          collectedLogs: {},
        }),
      },
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
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter,
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager,
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor({
        run: vi.fn().mockResolvedValue(makeResult(KEY, { prUrl: "https://github.com/pr/1" })),
      }),
    });

    const result = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));
    expect(issueManager.transitionWorkItem).toHaveBeenCalledWith(DS, KEY, "In Progress", TransitionPhase.BeforeAgent);
    expect(issueManager.postStartComment).toHaveBeenCalledWith(DS, KEY, "ralph", PID, {});
    expect(spies.start).toHaveBeenCalled();
    expect(spies.checkPrerequisites).toHaveBeenCalled();
    expect(spies.prepareConfigDir).toHaveBeenCalled();
    expect(spies.registerLogSources).toHaveBeenCalledWith(taskId, KEY, expect.any(String));
    expect(spies.setup).toHaveBeenCalled();
    expect(resultWriter.collectResults).toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.taskId).toBe(KEY);
  });

  it("prepares the config directory of every CLI the container stages run", async () => {
    // Arrange
    const { container, spies } = createMockContainer();
    const claudeLayout = { ...COPILOT_CONTAINER_LAYOUT, configDir: "/workspace/.ralph/claude", writableDirs: ["/w/a"] };
    const withTwoClis = { ...container, layouts: [claudeLayout, COPILOT_CONTAINER_LAYOUT] };
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      logger: createMockLogger(),
      containerFactory: createMockFactory(withTwoClis),
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      resultWriter: createMockResultWriter(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
    });

    // Act
    await runner.run(makeTaskContext());

    // Assert
    expect(spies.prepareConfigDir.mock.calls).toEqual([
      ["/workspace/.ralph/claude", ["/w/a"]],
      [COPILOT_CONTAINER_LAYOUT.configDir, COPILOT_CONTAINER_LAYOUT.writableDirs],
    ]);
  });

  it("calls execution order: renderTemplates → workspace → start → checkPrerequisites → clean → registerLogs → setup → execute → collectResults → workspace cleanup", async () => {
    const callOrder: string[] = [];
    const { container, spies } = createMockContainer();
    spies.start.mockImplementation(() => {
      callOrder.push("start");
      return Promise.resolve();
    });
    spies.checkPrerequisites.mockImplementation(() => {
      callOrder.push("check");
      return Promise.resolve();
    });
    spies.prepareConfigDir.mockImplementation(() => {
      callOrder.push("prepareConfig");
      return Promise.resolve();
    });
    spies.cleanPaths.mockImplementation(() => {
      callOrder.push("cleanPaths");
      return Promise.resolve();
    });
    spies.registerLogSources.mockImplementation(() => {
      callOrder.push("registerLogs");
    });
    spies.setup.mockImplementation(() => {
      callOrder.push("setup");
      return Promise.resolve();
    });

    const factory = createMockFactory(container);
    const profileSetup = createMockProfileSetupService({
      prepareForTask: vi.fn().mockImplementation(async () => {
        callOrder.push("profileSetup");
      }),
    });
    const resultWriter = createMockResultWriter({
      collectResults: vi.fn().mockImplementation(async () => {
        callOrder.push("collect");
      }),
    });
    const pipelineExecutor = createMockPipelineExecutor({
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("execute");
        return makeResult(KEY);
      }),
    });
    const workspaceManager = createMockWorkspaceManager({
      prepare: vi.fn().mockImplementation(async () => {
        callOrder.push("workspace");
      }),
      cleanup: vi.fn().mockImplementation(async () => {
        callOrder.push("cleanup");
      }),
    });
    const runner = new TaskRunner({
      workspaceManager,
      hookRunner: createMockHookRunner(),
      resultWriter,
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup,
      pipelineExecutor,
    });
    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(callOrder).toEqual([
      "profileSetup",
      "workspace",
      "start",
      "check",
      "prepareConfig",
      "cleanPaths",
      "registerLogs",
      "setup",
      "execute",
      "collect",
      "cleanup",
    ]);
  });

  it("skips beforeAgent transition when not configured", async () => {
    const profileNoTransition = makeProfile({ id: PID, agentName: "ralph", beforeAgent: {} });
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const issueManager = createMockIssueManager();
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager,
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
    });

    await runner.run(makeTaskContext({ workItem: issue, profile: profileNoTransition, taskId }));

    expect(issueManager.transitionWorkItem).toHaveBeenCalledWith(DS, KEY, undefined, TransitionPhase.BeforeAgent);
  });

  it("returns error result when container start fails", async () => {
    const { container, spies } = createMockContainer();
    spies.start.mockRejectedValue(new Error("Docker not running"));
    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
    });

    const result = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.stderr).toContain("Docker not running");
  });

  describe("when a phase throws", () => {
    function createRunner(deps: {
      resultWriter: ReturnType<typeof createMockResultWriter>;
      container: IContainerManager;
      pipelineExecutor?: ReturnType<typeof createMockPipelineExecutor>;
      hookRunner?: ReturnType<typeof createMockHookRunner>;
    }): TaskRunner {
      return new TaskRunner({
        workspaceManager: createMockWorkspaceManager(),
        hookRunner: deps.hookRunner ?? createMockHookRunner(),
        resultWriter: deps.resultWriter,
        logger,
        containerFactory: createMockFactory(deps.container),
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor:
          deps.pipelineExecutor ??
          createMockPipelineExecutor({ run: vi.fn().mockRejectedValue(new Error("CLI crashed")) }),
      });
    }

    it("collects the results with the error status and the failure message", async () => {
      // Arrange
      const { container } = createMockContainer();
      const resultWriter = createMockResultWriter();
      const ctx = makeTaskContext({ workItem: issue, profile, taskId });

      // Act
      const result = await createRunner({ resultWriter, container }).run(ctx);

      // Assert
      expect(resultWriter.collectResults).toHaveBeenCalledExactlyOnceWith(
        ctx,
        container,
        expect.objectContaining({ status: TaskStatus.Error, stderr: "CLI crashed" }),
      );
      expect(result.status).toBe(TaskStatus.Error);
      expect(result.stderr).toBe("CLI crashed");
    });

    it("returns the phase's own error when collecting the results fails too", async () => {
      // Arrange
      const { container } = createMockContainer();
      const resultWriter = createMockResultWriter({
        collectResults: vi.fn().mockRejectedValue(new Error("disk full")),
      });

      // Act
      const result = await createRunner({ resultWriter, container }).run(
        makeTaskContext({ workItem: issue, profile, taskId }),
      );

      // Assert
      expect(result.status).toBe(TaskStatus.Error);
      expect(result.stderr).toBe("CLI crashed");
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("disk full"));
    });

    it("does not collect a second time when the failure came after the results were collected", async () => {
      // Arrange
      const { container } = createMockContainer();
      const resultWriter = createMockResultWriter();
      const hookRunner = createMockHookRunner({ run: vi.fn().mockRejectedValue(new Error("hook runner broke")) });
      const hookProfile = makeProfile({
        id: PID,
        agentName: "ralph",
        postTaskHooks: [
          { name: "analysis", stages: [makeStage({ agent: "ralph.analyzer", role: "a", mode: StageMode.Local })] },
        ],
      });

      // Act
      const result = await createRunner({
        resultWriter,
        container,
        hookRunner,
        pipelineExecutor: createMockPipelineExecutor(),
      }).run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      // Assert
      expect(result.status).toBe(TaskStatus.Error);
      expect(resultWriter.collectResults).toHaveBeenCalledOnce();
    });
  });

  it("threads onToolOutput from context into the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
    });
    const onToolOutput = vi.fn();

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId, onToolOutput }));

    expect(container.onToolOutput).toBe(onToolOutput);
  });

  it("threads onPreToolUse from context into the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
    });
    const onPreToolUse = vi.fn();

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId, onPreToolUse }));

    expect(container.onPreToolUse).toBe(onPreToolUse);
  });

  it("passes ctx.signal to container.start()", async () => {
    const { container, spies } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
    });
    const controller = new AbortController();

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId, signal: controller.signal }));

    expect(spies.start).toHaveBeenCalledWith(controller.signal);
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
    const pipelineExecutor = createMockPipelineExecutor({
      run: vi.fn().mockResolvedValue(makeResult("DF-200")),
    });
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources,
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor,
    });

    await runner.run(
      buildTaskContext(revisionIssue, revisionProfile, "DF-200-1234567890000", makeConfig().ralphchives),
    );

    expect(resources.fetchHandoff).toHaveBeenCalledWith(DS, "DF-200");
  });

  it("skips handoff fetch when issue is not in revision status", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const resources = createMockResources();
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources,
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
    });

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(resources.fetchHandoff).not.toHaveBeenCalled();
  });

  it("passes triggerParams to JIT MCP config via profileSetup", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const profileSetup = createMockProfileSetupService();
    const runner = new TaskRunner({
      workspaceManager: createMockWorkspaceManager(),
      hookRunner: createMockHookRunner(),
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup,
      pipelineExecutor: createMockPipelineExecutor(),
    });

    await runner.run(buildTaskContext(issue, profile, taskId, makeConfig().ralphchives, ["codesamples", "verbose"]));

    expect(profileSetup.prepareForTask).toHaveBeenCalledWith(
      expect.objectContaining({ triggerParams: { codesamples: "true", verbose: "true" } }),
    );
  });

  describe("workspace", () => {
    it("mounts the task's workspace into the container stack", async () => {
      // Arrange
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const ctx = makeTaskContext({ workItem: issue, profile, taskId, workspacePath: "/ws/DF-100-1234567890000" });
      const runner = new TaskRunner({
        workspaceManager: createMockWorkspaceManager(),
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      // Act
      await runner.run(ctx);

      // Assert
      expect(factory.create).toHaveBeenCalledWith(profile, "/ws/DF-100-1234567890000");
    });

    it("ends the task with an error before the containers start when the workspace cannot be created", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      const workspaceManager = createMockWorkspaceManager({
        prepare: vi.fn().mockRejectedValue(new Error('Base branch "develop" does not exist')),
      });
      const runner = new TaskRunner({
        workspaceManager,
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: createMockFactory(container),
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      // Act
      const result = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

      // Assert
      expect(result.status).toBe(TaskStatus.Error);
      expect(result.stderr).toContain('Base branch "develop" does not exist');
      expect(spies.start).not.toHaveBeenCalled();
      expect(workspaceManager.cleanup).toHaveBeenCalledWith(expect.objectContaining({ taskId }), TaskStatus.Error);
    });

    it("cleans up the workspace with the task's final status once the task is done", async () => {
      // Arrange
      const workspaceManager = createMockWorkspaceManager();
      const ctx = makeTaskContext({ workItem: issue, profile, taskId });
      const runner = new TaskRunner({
        workspaceManager,
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: createMockFactory(createMockContainer().container),
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor({
          run: vi.fn().mockResolvedValue(makeResult(KEY, { status: TaskStatus.Partial })),
        }),
      });

      // Act
      await runner.run(ctx);

      // Assert
      expect(workspaceManager.cleanup).toHaveBeenCalledExactlyOnceWith(ctx, TaskStatus.Partial);
    });

    it("cleans up the workspace with an error status when the agent run throws", async () => {
      // Arrange
      const workspaceManager = createMockWorkspaceManager();
      const ctx = makeTaskContext({ workItem: issue, profile, taskId });
      const runner = new TaskRunner({
        workspaceManager,
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: createMockFactory(createMockContainer().container),
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor({ run: vi.fn().mockRejectedValue(new Error("CLI crashed")) }),
      });

      // Act
      await runner.run(ctx);

      // Assert
      expect(workspaceManager.cleanup).toHaveBeenCalledExactlyOnceWith(ctx, TaskStatus.Error);
    });
  });

  describe("teardown", () => {
    it("calls container.stop() when container is running", async () => {
      const { container, spies } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        workspaceManager: createMockWorkspaceManager(),
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      await runner.teardown(profile, container);

      expect(spies.stop).toHaveBeenCalled();
      expect(factory.forceDown).not.toHaveBeenCalled();
    });

    it("skips stop and forceDown when container is not running", async () => {
      const { container, spies } = createMockContainer();
      (container as { isRunning: boolean }).isRunning = false;
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        workspaceManager: createMockWorkspaceManager(),
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      await runner.teardown(profile, container);

      expect(spies.stop).not.toHaveBeenCalled();
      expect(factory.forceDown).not.toHaveBeenCalled();
    });

    it("falls back to forceDown when container.stop() throws", async () => {
      const { container, spies } = createMockContainer();
      spies.stop.mockRejectedValue(new Error("compose down failed"));
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        workspaceManager: createMockWorkspaceManager(),
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      await runner.teardown(profile, container);

      expect(spies.stop).toHaveBeenCalled();
      expect(factory.forceDown).toHaveBeenCalledWith(profile);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Graceful stop failed"));
    });

    it("calls forceDown directly when container is null", async () => {
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        workspaceManager: createMockWorkspaceManager(),
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      await runner.teardown(profile, null);

      expect(factory.forceDown).toHaveBeenCalledWith(profile);
    });

    it("logs warning without throwing when both stop and forceDown fail", async () => {
      const { container, spies } = createMockContainer();
      spies.stop.mockRejectedValue(new Error("stop failed"));
      const factory = createMockFactory(container);
      vi.mocked(factory.forceDown).mockRejectedValue(new Error("forceDown failed"));
      const runner = new TaskRunner({
        workspaceManager: createMockWorkspaceManager(),
        hookRunner: createMockHookRunner(),
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      await expect(runner.teardown(profile, container)).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Graceful stop failed"));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Fallback teardown failed"));
    });
  });

  describe("post-task hooks", () => {
    const hookProfile = makeProfile({
      id: PID,
      agentName: "ralph",
      postTaskHooks: [
        { name: "analysis", stages: [makeStage({ agent: "ralph.analyzer", role: "analyzer", mode: StageMode.Local })] },
      ],
    });

    function createRunner(
      container: IContainerManager,
      hookRunner: ReturnType<typeof createMockHookRunner>,
      pipelineExecutor = createMockPipelineExecutor(),
    ): TaskRunner {
      return new TaskRunner({
        workspaceManager: createMockWorkspaceManager(),
        hookRunner,
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: createMockFactory(container),
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor,
      });
    }

    it("runs no hooks when none are configured", async () => {
      // Arrange
      const { container } = createMockContainer();
      const hookRunner = createMockHookRunner();

      // Act
      await createRunner(container, hookRunner).run(makeTaskContext({ workItem: issue, profile, taskId }));

      // Assert
      expect(hookRunner.run).not.toHaveBeenCalled();
    });

    it("runs the variant's hooks with the main pipeline's collected logs", async () => {
      // Arrange
      const { container } = createMockContainer();
      const hookRunner = createMockHookRunner();
      const pipelineExecutor = createMockPipelineExecutor({
        run: vi.fn().mockResolvedValue(makeResult(KEY, { collectedLogs: { audit: "/logs/audit.jsonl" } })),
      });
      const ctx = makeTaskContext({ workItem: issue, profile: hookProfile, taskId });

      // Act
      await createRunner(container, hookRunner, pipelineExecutor).run(ctx);

      // Assert
      expect(hookRunner.run).toHaveBeenCalledExactlyOnceWith(ctx, hookProfile.postTaskHooks, {
        audit: "/logs/audit.jsonl",
      });
    });

    it("does not run hooks when the main pipeline throws", async () => {
      // Arrange
      const { container, spies } = createMockContainer();
      spies.start.mockRejectedValue(new Error("container start failed"));
      const hookRunner = createMockHookRunner();

      // Act
      const result = await createRunner(container, hookRunner).run(
        makeTaskContext({ workItem: issue, profile: hookProfile, taskId }),
      );

      // Assert
      expect(result.status).toBe(TaskStatus.Error);
      expect(hookRunner.run).not.toHaveBeenCalled();
    });

    it("tears down the containers before running hooks", async () => {
      // Arrange
      const callOrder: string[] = [];
      const { container, spies } = createMockContainer();
      spies.stop.mockImplementation(async () => {
        callOrder.push("stop");
      });
      const hookRunner = createMockHookRunner({
        run: vi.fn().mockImplementation(async () => {
          callOrder.push("hooks");
        }),
      });

      // Act
      await createRunner(container, hookRunner).run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      // Assert
      expect(callOrder).toEqual(["stop", "hooks"]);
    });

    it("skips hooks and writes the replay manifest when the skip_hooks trigger param is set", async () => {
      // Arrange
      const { container } = createMockContainer();
      const hookRunner = createMockHookRunner();

      // Act
      const result = await createRunner(container, hookRunner).run(
        makeTaskContext({ workItem: issue, profile: hookProfile, taskId, triggerParams: { skip_hooks: "true" } }),
      );

      // Assert
      expect(result.status).toBe(TaskStatus.Completed);
      expect(hookRunner.run).not.toHaveBeenCalled();
      const { writeFileSync } = await import("node:fs");
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("hook-manifest.json"),
        expect.stringContaining('"workItemId"'),
      );
    });

    it("writes no manifest when skip_hooks is not set", async () => {
      // Arrange
      const { container } = createMockContainer();

      // Act
      await createRunner(container, createMockHookRunner()).run(
        makeTaskContext({ workItem: issue, profile: hookProfile, taskId }),
      );

      // Assert
      const { writeFileSync } = await import("node:fs");
      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });
});
