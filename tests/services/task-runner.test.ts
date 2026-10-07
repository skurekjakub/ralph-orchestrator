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
} from "../helpers/mocks";

const DS = "jira";
const KEY = "DF-100";
const PID = "ralph-docs";

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return {
    ...orig,
    rmSync: vi.fn(),
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

  it("calls execution order: renderTemplates → start → checkPrerequisites → clean → registerLogs → setup → execute → collectResults", async () => {
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
    const runner = new TaskRunner({
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
      "start",
      "check",
      "prepareConfig",
      "cleanPaths",
      "registerLogs",
      "setup",
      "execute",
      "collect",
    ]);
  });

  it("skips beforeAgent transition when not configured", async () => {
    const profileNoTransition = makeProfile({ id: PID, agentName: "ralph", beforeAgent: {} });
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const issueManager = createMockIssueManager();
    const runner = new TaskRunner({
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

  it("still collects logs on error", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const resultWriter = createMockResultWriter();
    const pipelineExecutor = createMockPipelineExecutor({
      run: vi.fn().mockRejectedValue(new Error("CLI crashed")),
    });
    const runner = new TaskRunner({
      resultWriter,
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor,
    });

    await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(resultWriter.collectLogs).toHaveBeenCalled();
  });

  it("threads onToolOutput from context into the container", async () => {
    const { container } = createMockContainer();
    const factory = createMockFactory(container);
    const runner = new TaskRunner({
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

  it("runs preExecuteHooks between setup and execute", async () => {
    const callOrder: string[] = [];
    const { container, spies } = createMockContainer();
    spies.setup.mockImplementation(() => {
      callOrder.push("setup");
      return Promise.resolve();
    });
    const pipelineExecutor = createMockPipelineExecutor({
      run: vi.fn().mockImplementation(async () => {
        callOrder.push("execute");
        return makeResult(KEY);
      }),
    });

    const mockHook = {
      name: "test-hook",
      execute: vi.fn().mockImplementation(async () => {
        callOrder.push("hook");
      }),
    };

    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor,
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
    const hook1 = {
      name: "hook-1",
      execute: vi.fn().mockImplementation(async () => {
        callOrder.push("hook-1");
      }),
    };
    const hook2 = {
      name: "hook-2",
      execute: vi.fn().mockImplementation(async () => {
        callOrder.push("hook-2");
      }),
    };

    const factory = createMockFactory(container);
    const runner = new TaskRunner({
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
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
      resultWriter: createMockResultWriter(),
      logger,
      containerFactory: factory,
      resources: createMockResources(),
      issueManager: createMockIssueManager(),
      profileSetup: createMockProfileSetupService(),
      pipelineExecutor: createMockPipelineExecutor(),
      preExecuteHooks: [failingHook],
    });
    const result = await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.stderr).toContain("hook failed");
  });

  describe("teardown", () => {
    it("calls container.stop() when container is running", async () => {
      const { container, spies } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
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

  describe("executePostTaskHooks", () => {
    function makeHookProfile(...hooks: Array<{ name: string; stages: Array<{ agent: string; role: string }> }>) {
      return makeProfile({
        id: PID,
        agentName: "ralph",
        postTaskHooks: hooks.map((h) => ({
          name: h.name,
          stages: h.stages.map((s) => makeStage({ agent: s.agent, role: s.role, mode: StageMode.Local })),
        })),
      });
    }

    it("is a no-op when no hooks are configured", async () => {
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      await runner.run(makeTaskContext({ workItem: issue, profile, taskId }));

      expect(factory.createLocalSession).not.toHaveBeenCalled();
    });

    it("runs a single hook with one stage after the main pipeline", async () => {
      const hookProfile = makeHookProfile({
        name: "analysis",
        stages: [{ agent: "ralph.analyzer", role: "analyzer" }],
      });
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

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
      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

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

      vi.mocked(factory.createLocalSession).mockReturnValueOnce({
        executor: {
          run: vi.fn(),
          continueSession: vi.fn(),
          killActive: vi.fn(),
        },
        sessionRunner: {
          run: vi.fn().mockResolvedValue({
            taskId: "MOCK-1",
            status: TaskStatus.Error,
            durationMs: 0,
            exitCode: 1,
            stdout: "",
            stderr: "fail",
            collectedLogs: {},
          }),
        },
      });

      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      const result = await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(result.status).toBe(TaskStatus.Completed);
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
        executor: {
          run: vi.fn(),
          continueSession: vi.fn(),
          killActive: vi.fn(),
        },
        sessionRunner: {
          run: vi.fn().mockResolvedValue({
            taskId: "MOCK-1",
            status: TaskStatus.Partial,
            durationMs: 0,
            exitCode: 0,
            stdout: "",
            stderr: "",
            collectedLogs: {},
          }),
        },
      });

      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      const result = await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

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

      vi.mocked(factory.createLocalSession).mockReturnValueOnce({
        executor: {
          run: vi.fn(),
          continueSession: vi.fn(),
          killActive: vi.fn(),
        },
        sessionRunner: { run: vi.fn().mockRejectedValue(new Error("hook-a exploded")) },
      });

      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      const result = await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(result.status).toBe(TaskStatus.Completed);
      expect(factory.createLocalSession).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[hook:hook-a] Unexpected error"));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:hook-b] Finished"));
    });

    it("does not run hooks when the main pipeline throws", async () => {
      const hookProfile = makeHookProfile({
        name: "analysis",
        stages: [{ agent: "ralph.analyzer", role: "analyzer" }],
      });
      const { container, spies } = createMockContainer();
      spies.start.mockRejectedValue(new Error("container start failed"));
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      const result = await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(result.status).toBe(TaskStatus.Error);
      expect(factory.createLocalSession).not.toHaveBeenCalled();
    });

    it("tears down container before running hooks", async () => {
      const callOrder: string[] = [];
      const hookProfile = makeHookProfile({
        name: "analysis",
        stages: [{ agent: "ralph.analyzer", role: "analyzer" }],
      });
      const { container, spies } = createMockContainer();
      spies.stop.mockImplementation(() => {
        callOrder.push("stop");
        return Promise.resolve();
      });

      const factory = createMockFactory(container);
      vi.mocked(factory.createLocalSession).mockReturnValue({
        executor: {
          run: vi.fn(),
          continueSession: vi.fn(),
          killActive: vi.fn(),
        },
        sessionRunner: {
          run: vi.fn().mockImplementation(async () => {
            callOrder.push("hook-run");
            return {
              taskId: "MOCK-1",
              status: TaskStatus.Completed,
              durationMs: 0,
              exitCode: 0,
              stdout: "",
              stderr: "",
              collectedLogs: {},
            };
          }),
        },
      });

      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      expect(callOrder).toEqual(["stop", "hook-run"]);
    });

    it("skips hooks and writes manifest when skip_hooks trigger param is set", async () => {
      const hookProfile = makeHookProfile({
        name: "analysis",
        stages: [{ agent: "ralph.analyzer", role: "analyzer" }],
      });
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      const result = await runner.run(
        makeTaskContext({ workItem: issue, profile: hookProfile, taskId, triggerParams: { skip_hooks: "true" } }),
      );

      expect(result.status).toBe(TaskStatus.Completed);
      expect(factory.createLocalSession).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("skip_hooks"));

      const { writeFileSync } = await import("node:fs");
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("hook-manifest.json"),
        expect.stringContaining('"workItemId"'),
      );
    });

    it("does not write manifest when skip_hooks is not set", async () => {
      const hookProfile = makeHookProfile({
        name: "analysis",
        stages: [{ agent: "ralph.analyzer", role: "analyzer" }],
      });
      const { container } = createMockContainer();
      const factory = createMockFactory(container);
      const runner = new TaskRunner({
        resultWriter: createMockResultWriter(),
        logger,
        containerFactory: factory,
        resources: createMockResources(),
        issueManager: createMockIssueManager(),
        profileSetup: createMockProfileSetupService(),
        pipelineExecutor: createMockPipelineExecutor(),
      });

      await runner.run(makeTaskContext({ workItem: issue, profile: hookProfile, taskId }));

      const { writeFileSync } = await import("node:fs");
      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });
});
