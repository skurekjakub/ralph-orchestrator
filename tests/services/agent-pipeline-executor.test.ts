/**
 * AgentPipelineExecutor unit tests.
 *
 * Verifies the stage-loop behavior: execution order, abort handling, stage
 * failure propagation, result merging, and per-stage log collection.
 *
 * The container and profileSetup are mocked at their interfaces. All assertions
 * focus on what `run()` returns and which observable side effects (log collection,
 * stage re-rendering) occur — not on internal call sequences.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentPipelineExecutor } from "../../src/services/agent-pipeline-executor";
import { TaskStatus } from "../../src/container/types";
import { makeTaskContext, makeProfile, makeResult, makeStage } from "../helpers/factories";
import { createMockProfileSetupService, createSilentLogger } from "../helpers/mocks";
import type { IContainerManager } from "../../src/container/manager";
import type { ICliExecutor } from "../../src/container/cli-executor-factory";
import type { IssueContext } from "../../src/prompt/prompt";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function createMockExecutor(): ICliExecutor {
  return {
    paths: {
      configDir: "/workspace/.ralph",
      writableDirs: [],
      transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
      logDir: "/workspace/.ralph/logs/cli-debug",
    },
    run: vi.fn(),
    continueSession: vi.fn(),
    killActive: vi.fn(),
  };
}

function createMockContainer(executeResult?: Partial<ReturnType<typeof makeResult>>): IContainerManager {
  return {
    isRunning: true,
    checkPrerequisites: vi.fn(),
    start: vi.fn(),
    setup: vi.fn(),
    execInApp: vi.fn(),
    execInSidecar: vi.fn(),
    registerLogSources: vi.fn(),
    execute: vi.fn(),
    executeWithExecutor: vi.fn().mockResolvedValue(makeResult("DF-100", executeResult)),
    createExecutorForStage: vi.fn().mockReturnValue(createMockExecutor()),
    stop: vi.fn().mockResolvedValue(undefined),
    logs: {
      detach: vi.fn(),
      collectAll: vi.fn().mockResolvedValue([]),
      clearCollectSources: vi.fn().mockResolvedValue(undefined),
    },
    cleaner: {
      prepareConfigDir: vi.fn(),
      cleanDirectory: vi.fn(),
      cleanPaths: vi.fn(),
    },
    cliPaths: {
      configDir: "/workspace/.ralph",
      writableDirs: [],
      transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
      logDir: "/workspace/.ralph/logs/cli-debug",
    },
    onToolOutput: undefined,
    onPreToolUse: undefined,
  } as unknown as IContainerManager;
}

const issueContext: IssueContext = {
  comments: [],
  isRevision: false,
};

// ── Harness ───────────────────────────────────────────────────────────────────

function createExecutor(
  overrides: {
    executeResult?: Partial<ReturnType<typeof makeResult>>;
  } = {},
) {
  const profileSetup = createMockProfileSetupService();
  const pipeline = new AgentPipelineExecutor({
    logger: createSilentLogger(),
    profileSetup,
  });
  const container = createMockContainer(overrides.executeResult);
  return { pipeline, profileSetup, container };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AgentPipelineExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("single-stage pipeline", () => {
    it("returns the result from the executed stage", async () => {
      const { pipeline, container } = createExecutor();
      const ctx = makeTaskContext();

      const result = await pipeline.run(ctx, container, issueContext);

      expect(result.status).toBe(TaskStatus.Completed);
      expect(result.exitCode).toBe(0);
    });

    it("does not re-render templates — single stage needs no per-stage setup", async () => {
      const { pipeline, profileSetup, container } = createExecutor();
      const ctx = makeTaskContext();

      await pipeline.run(ctx, container, issueContext);

      expect(profileSetup.prepareForStage).not.toHaveBeenCalled();
    });

    it("does not include stageResults in the result", async () => {
      const { pipeline, container } = createExecutor();
      const ctx = makeTaskContext();

      const result = await pipeline.run(ctx, container, issueContext);

      expect(result.stageResults).toBeUndefined();
    });
  });

  describe("multi-stage pipeline", () => {
    function makeMultiStageCtx() {
      const profile = makeProfile({
        stages: [makeStage({ agent: "ralph", role: "primary" }), makeStage({ agent: "ralph", role: "reviewer" })],
      });
      return makeTaskContext({ profile });
    }

    it("executes all stages and returns a merged result", async () => {
      const { pipeline, container } = createExecutor({ executeResult: { durationMs: 1000 } });
      const ctx = makeMultiStageCtx();

      const result = await pipeline.run(ctx, container, issueContext);

      expect(result.status).toBe(TaskStatus.Completed);
      expect((container.executeWithExecutor as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    });

    it("sums stage durations in the final result", async () => {
      const { pipeline, container } = createExecutor({ executeResult: { durationMs: 2000 } });
      const ctx = makeMultiStageCtx();

      const result = await pipeline.run(ctx, container, issueContext);

      // Two stages × 2000ms each
      expect(result.durationMs).toBe(4000);
    });

    it("populates stageResults with per-stage info", async () => {
      const { pipeline, container } = createExecutor();
      const ctx = makeMultiStageCtx();

      const result = await pipeline.run(ctx, container, issueContext);

      expect(result.stageResults).toHaveLength(2);
      expect(result.stageResults![0].role).toBe("primary");
      expect(result.stageResults![1].role).toBe("reviewer");
    });

    it("re-renders templates for each stage", async () => {
      const { pipeline, profileSetup, container } = createExecutor();
      const ctx = makeMultiStageCtx();

      await pipeline.run(ctx, container, issueContext);

      expect(profileSetup.prepareForStage).toHaveBeenCalledTimes(2);
    });

    it("passes correct stage metadata when re-rendering", async () => {
      const { pipeline, profileSetup, container } = createExecutor();
      const ctx = makeMultiStageCtx();

      await pipeline.run(ctx, container, issueContext);

      const [, firstOverrides] = (profileSetup.prepareForStage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(firstOverrides.stageIndex).toBe(0);
      expect(firstOverrides.stageRole).toBe("primary");
      expect(firstOverrides.previousStageRoles).toEqual([]);

      const [, secondOverrides] = (profileSetup.prepareForStage as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(secondOverrides.stageIndex).toBe(1);
      expect(secondOverrides.stageRole).toBe("reviewer");
      expect(secondOverrides.previousStageRoles).toEqual(["primary"]);
    });
  });

  describe("stage failure", () => {
    it("stops the pipeline when a stage returns error status", async () => {
      const { pipeline, container } = createExecutor();
      const ctx = makeTaskContext({
        profile: makeProfile({
          stages: [makeStage({ agent: "ralph", role: "primary" }), makeStage({ agent: "ralph", role: "reviewer" })],
        }),
      });

      (container.executeWithExecutor as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeResult("DF-100", { status: TaskStatus.Error, exitCode: 1 }),
      );

      const result = await pipeline.run(ctx, container, issueContext);

      expect(result.status).toBe(TaskStatus.Error);
      expect((container.executeWithExecutor as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    });
  });

  describe("abort handling", () => {
    it("returns an error result when aborted before the first stage", async () => {
      const { pipeline, container } = createExecutor();
      const controller = new AbortController();
      controller.abort();
      const ctx = makeTaskContext({ signal: controller.signal });

      const result = await pipeline.run(ctx, container, issueContext);

      expect(result.status).toBe(TaskStatus.Error);
      expect(container.executeWithExecutor as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });

    it("stops after the first stage when aborted mid-pipeline", async () => {
      const controller = new AbortController();
      const { pipeline, container } = createExecutor();
      const ctx = makeTaskContext({
        signal: controller.signal,
        profile: makeProfile({
          stages: [makeStage({ agent: "ralph", role: "primary" }), makeStage({ agent: "ralph", role: "reviewer" })],
        }),
      });

      // Abort after the first executeWithExecutor call
      (container.executeWithExecutor as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        controller.abort();
        return makeResult("DF-100");
      });

      const result = await pipeline.run(ctx, container, issueContext);

      // Only the first stage ran
      expect((container.executeWithExecutor as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
      // The abort check fires before the stage result is accumulated, so the
      // pipeline exits via the error fallback rather than returning the stage result.
      expect(result.status).toBe(TaskStatus.Error);
    });
  });

  describe("log collection", () => {
    it("collects per-stage logs in multi-stage container pipelines", async () => {
      const { pipeline, container } = createExecutor();
      const ctx = makeTaskContext({
        profile: makeProfile({
          stages: [makeStage({ agent: "ralph", role: "primary" }), makeStage({ agent: "ralph", role: "reviewer" })],
        }),
      });

      (container.logs.collectAll as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "proxy", path: "/tmp/proxy.log" },
      ]);

      const result = await pipeline.run(ctx, container, issueContext);

      // Each stage should have its log entry in stageResults
      expect(result.stageResults![0].collectedLogs).toHaveProperty("proxy");
    });

    it("clears log sources between stages", async () => {
      const { pipeline, container } = createExecutor();
      const ctx = makeTaskContext({
        profile: makeProfile({
          stages: [makeStage({ agent: "ralph", role: "primary" }), makeStage({ agent: "ralph", role: "reviewer" })],
        }),
      });

      await pipeline.run(ctx, container, issueContext);

      expect(container.logs.clearCollectSources).toHaveBeenCalledOnce();
    });
  });
});
