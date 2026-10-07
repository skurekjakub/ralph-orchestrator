import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostTaskHookRunner } from "../../src/services/post-task-hook-runner";
import { StageMode, type IPostTaskHook } from "../../src/config/types";
import { TaskStatus, type ContainerManagerFactory, type RalphResult } from "../../src/container/types";
import type { IAgentSessionRunner } from "../../src/container/agent-session-runner";
import { makeProfile, makeResult, makeStage, makeTaskContext } from "../helpers/factories";
import { createMockExecutor, createMockLogger, createMockProfileSetupService, type Mocked } from "../helpers/mocks";

/** A hook named `name` whose stages have `roles`, all on the host. */
function hook(name: string, ...roles: string[]): IPostTaskHook {
  return {
    name,
    stages: roles.map((role) => makeStage({ agent: `ralph.${role}`, role, mode: StageMode.Local })),
  };
}

/** A session runner whose runs end with `statuses` in order, then completed. */
function sessionRunnerEnding(...statuses: TaskStatus[]): Mocked<IAgentSessionRunner> {
  const run = vi.fn();
  for (const status of statuses) run.mockResolvedValueOnce(makeResult("DF-100", { status }));
  run.mockResolvedValue(makeResult("DF-100"));
  return { run };
}

describe("PostTaskHookRunner", () => {
  let outputDir: string;
  let logger: ReturnType<typeof createMockLogger>;
  let profileSetup: ReturnType<typeof createMockProfileSetupService>;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), "hook-runner-"));
    logger = createMockLogger();
    profileSetup = createMockProfileSetupService();
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  function createRunner(sessionRunner: Mocked<IAgentSessionRunner> = sessionRunnerEnding()) {
    const containerFactory: Mocked<ContainerManagerFactory> = {
      create: vi.fn(),
      forceDown: vi.fn(),
      createLocalSession: vi.fn().mockReturnValue({ executor: createMockExecutor(), sessionRunner }),
    };
    const runner = new PostTaskHookRunner({ logger, profileSetup, containerFactory });
    return { runner, containerFactory, sessionRunner };
  }

  function taskContext(...hooks: IPostTaskHook[]) {
    return makeTaskContext({ profile: makeProfile({ postTaskHooks: hooks }), outputDir });
  }

  it("renders each stage with the hook's context, then runs it in a host session", async () => {
    // Arrange
    const { runner, containerFactory, sessionRunner } = createRunner();
    const analysis = hook("analysis", "analyzer");
    const ctx = taskContext(analysis);
    const collectedLogs = { audit: "/logs/audit.jsonl" };

    // Act
    await runner.run(ctx, [analysis], collectedLogs);

    // Assert
    const hookOutputDir = join(outputDir, "hooks", "analysis");
    expect(existsSync(hookOutputDir)).toBe(true);
    expect(profileSetup.prepareForStage).toHaveBeenCalledExactlyOnceWith(ctx, {
      stage: analysis.stages[0],
      stageIndex: 0,
      stageCount: 1,
      previousStageRoles: [],
      hook: { collectedLogs, name: "analysis", outputDir: hookOutputDir },
    });
    expect(containerFactory.createLocalSession).toHaveBeenCalledExactlyOnceWith(ctx.profile, analysis.stages[0]);
    expect(sessionRunner.run).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:analysis] Finished"));
  });

  it("runs each stage under its own result contract, without continuations", async () => {
    // Arrange
    const { runner, sessionRunner } = createRunner();
    const analysis: IPostTaskHook = {
      name: "analysis",
      stages: [
        makeStage({ role: "a", mode: StageMode.Local, requireResultBlock: false }),
        makeStage({ role: "b", mode: StageMode.Local, requireResultBlock: true }),
      ],
    };

    // Act
    await runner.run(taskContext(analysis), [analysis], {});

    // Assert
    expect(sessionRunner.run.mock.calls.map((call) => call[3])).toEqual([
      { maxContinuations: 0, enableContinuation: false, requireResultBlock: false },
      { maxContinuations: 0, enableContinuation: false, requireResultBlock: true },
    ]);
  });

  it("runs a hook's stages in order, telling each the roles that completed before it", async () => {
    // Arrange
    const { runner } = createRunner();
    const analysis = hook("analysis", "analyzer", "improver");

    // Act
    await runner.run(taskContext(analysis), [analysis], {});

    // Assert
    expect(profileSetup.prepareForStage.mock.calls.map(([, overrides]) => overrides.previousStageRoles)).toEqual([
      [],
      ["analyzer"],
    ]);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:analysis/improver] Completed"));
  });

  it.each([TaskStatus.Error, TaskStatus.Partial, TaskStatus.Blocked])(
    "skips the rest of a hook after a stage ends %s",
    async (status) => {
      // Arrange
      const { runner, containerFactory } = createRunner(sessionRunnerEnding(status));
      const analysis = hook("analysis", "analyzer", "improver");

      // Act
      await runner.run(taskContext(analysis), [analysis], {});

      // Assert
      expect(containerFactory.createLocalSession).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`[hook:analysis/analyzer] Failed (${status})`));
    },
  );

  it("runs the next hook after one throws, without throwing itself", async () => {
    // Arrange
    const sessionRunner: Mocked<IAgentSessionRunner> = {
      run: vi
        .fn<() => Promise<RalphResult>>()
        .mockRejectedValueOnce(new Error("hook-a exploded"))
        .mockResolvedValue(makeResult("DF-100")),
    };
    const { runner, containerFactory } = createRunner(sessionRunner);
    const hookA = hook("hook-a", "a");
    const hookB = hook("hook-b", "b");

    // Act
    await runner.run(taskContext(hookA, hookB), [hookA, hookB], {});

    // Assert
    expect(containerFactory.createLocalSession).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("[hook:hook-a] Unexpected error: hook-a exploded"),
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[hook:hook-b] Finished"));
  });

  it("logs a stage that cannot be rendered as the hook's error and runs no session for it", async () => {
    // Arrange
    profileSetup.prepareForStage.mockRejectedValueOnce(new Error("Agent ralph.analyzer does not run on cli"));
    const { runner, sessionRunner } = createRunner();
    const analysis = hook("analysis", "analyzer");

    // Act
    await runner.run(taskContext(analysis), [analysis], {});

    // Assert
    expect(sessionRunner.run).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("does not run on cli"));
  });
});
