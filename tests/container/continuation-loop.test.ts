import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerManager } from "../../src/container/manager";
import { AgentSessionRunner } from "../../src/container/agent-session-runner";
import { ContinuationRunner } from "../../src/container/continuation-runner";
import { FailureReason, TaskStatus, type ContainerExecResult } from "../../src/container/types";
import type { BuiltPrompt, PromptBuilder } from "../../src/prompt/prompt-builder";
import { makeExecResult, makeProfile, makeStage, makeWorkItem } from "../helpers/factories";
import {
  createMockCliRuntime,
  createMockExecutor,
  createMockStageExecutors,
  createSilentLogger,
} from "../helpers/mocks";
import { CliRuntimeRegistry } from "../../src/cli/cli-runtime";
import { CliType } from "../../src/config/types";
import type { ICliExecutor } from "../../src/container/cli-executor-factory";
import type { IComposeClient } from "../../src/container/compose-client";
import type { IContainerLogCollector } from "../../src/container/log-collector";
import type { IContainerWorkspaceCleaner } from "../../src/container/workspace-cleaner";
import type { ResultPromise } from "execa";

const KEY = "DF-100";

/** A main-pipeline stage, which requires a result block. */
const STAGE = makeStage();

// ── Test helpers ─────────────────────────────────────────────────────────────

/** The result of a plain-text CLI run, whose agent text is its stdout. */
function plainTextResult(overrides: Partial<ContainerExecResult> & { stdout: string }): ContainerExecResult {
  return makeExecResult({ agentText: overrides.stdout, ...overrides });
}

const RESULT_BLOCK = [
  "===RALPH_RESULT_START===",
  "PR_URL: https://dev.azure.com/org/project/_git/repo/pullrequest/123",
  "STATUS: completed",
  "===RALPH_RESULT_END===",
].join("\n");

const STATUS_ONLY_BLOCK = [
  "===RALPH_RESULT_START===",
  "PR_URL: none",
  "STATUS: blocked",
  "===RALPH_RESULT_END===",
].join("\n");

function createMockPromptBuilder(): PromptBuilder {
  return {
    build: vi.fn().mockReturnValue({
      text: "test prompt",
      audit: { safe: true, findings: [] },
    } satisfies BuiltPrompt),
  } as unknown as PromptBuilder;
}

function fakeResultPromise(): ResultPromise {
  return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }) as unknown as ResultPromise;
}

function buildManager(maxContinuations: number, executor: ICliExecutor) {
  const profile = makeProfile({ maxContinuations });
  const logger = createSilentLogger();
  const promptBuilder = createMockPromptBuilder();
  const compose: IComposeClient = {
    compose: vi.fn().mockReturnValue(fakeResultPromise()),
    exec: vi.fn().mockReturnValue(fakeResultPromise()),
    execWithTimeout: vi.fn().mockReturnValue(fakeResultPromise()),
    logs: vi.fn().mockReturnValue(fakeResultPromise()),
    checkDocker: vi.fn().mockResolvedValue(undefined),
    getContainerName: vi.fn().mockResolvedValue("mock-container"),
  } as IComposeClient;
  const logs: IContainerLogCollector = {
    setTaskId: vi.fn(),
    addSource: vi.fn(),
    addExport: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    collectAll: vi.fn().mockResolvedValue([]),
    clearCollectSources: vi.fn().mockResolvedValue(undefined),
  };
  const cleaner: IContainerWorkspaceCleaner = {
    prepareConfigDir: vi.fn().mockResolvedValue(undefined),
    cleanDirectory: vi.fn().mockResolvedValue(undefined),
    cleanPaths: vi.fn().mockResolvedValue(undefined),
  };
  const continuationRunner = new ContinuationRunner({ logger });
  const sessionRunner = new AgentSessionRunner({ continuationRunner, promptBuilder, logger });

  return new ContainerManager({
    profile,
    workspacePath: "/tmp/test-workspaces/DF-100-1234567890000",
    compose,
    cliRuntimes: new CliRuntimeRegistry({ runtimes: [createMockCliRuntime(CliType.Copilot)] }),
    stageExecutors: createMockStageExecutors({
      create: vi.fn().mockResolvedValue(executor),
      createHost: vi.fn().mockResolvedValue(executor),
    }),
    containerLogs: logs,
    workspaceCleaner: cleaner,
    sessionRunner,
    logger,
    enableContinuation: true,
  });
}

// ── Backoff unit tests ──────────────────────────────────────────────────────

describe("ContinuationRunner.continuationBackoff", () => {
  it("returns 5s for attempt 1", () => {
    expect(ContinuationRunner.continuationBackoff(1)).toBe(5_000);
  });

  it("doubles each attempt", () => {
    expect(ContinuationRunner.continuationBackoff(2)).toBe(10_000);
    expect(ContinuationRunner.continuationBackoff(3)).toBe(20_000);
  });

  it("caps at 30s", () => {
    expect(ContinuationRunner.continuationBackoff(4)).toBe(30_000);
    expect(ContinuationRunner.continuationBackoff(10)).toBe(30_000);
  });
});

// ── Continuation loop integration tests ─────────────────────────────────────

describe("ContainerManager.executeWithExecutor — continuation loop", () => {
  beforeEach(() => {
    vi.spyOn(ContinuationRunner, "sleep").mockResolvedValue(undefined);
  });

  it("does not continue when maxContinuations is 0", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no result block" }));
    const manager = buildManager(0, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(executor.run).toHaveBeenCalledOnce();
    expect(executor.continueSession).not.toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Error);
    expect(result.failureReason).toBe(FailureReason.MissingResultBlock);
  });

  it("does not continue a stage that does not require a result block, which completes on exit 0", async () => {
    // Arrange
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no result block" }));
    const manager = buildManager(3, executor);

    // Act
    const result = await manager.executeWithExecutor(
      executor,
      makeStage({ requireResultBlock: false }),
      makeWorkItem(KEY),
    );

    // Assert
    expect(executor.continueSession).not.toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.failureReason).toBeUndefined();
  });

  it("continues past a block whose STATUS is not accepted and reads the block the continuation printed", async () => {
    // Arrange
    const executor = createMockExecutor();
    const typo = "===RALPH_RESULT_START===\nSTATUS: success\n===RALPH_RESULT_END===";
    executor.run.mockResolvedValue(plainTextResult({ stdout: typo }));
    executor.continueSession.mockResolvedValue(plainTextResult({ stdout: RESULT_BLOCK }));
    const manager = buildManager(3, executor);

    // Act
    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    // Assert
    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.prUrl).toContain("pullrequest/123");
    expect(result.agentText).toBe(`${typo}\n${RESULT_BLOCK}`);
  });

  it("does not continue when initial run produces a result block", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: RESULT_BLOCK }));
    const manager = buildManager(3, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(executor.run).toHaveBeenCalledOnce();
    expect(executor.continueSession).not.toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.prUrl).toContain("pullrequest/123");
  });

  it("continues when the block is only in raw stdout, such as inside a tool call, not in the agent text", async () => {
    // Arrange
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: `{"input":"${RESULT_BLOCK}"}`, agentText: "working..." }));
    executor.continueSession.mockResolvedValue(makeExecResult({ agentText: RESULT_BLOCK }));
    const manager = buildManager(3, executor);

    // Act
    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    // Assert
    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.prUrl).toContain("pullrequest/123");
  });

  it("continues when initial run has no result block", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "working..." }));
    executor.continueSession.mockResolvedValue(plainTextResult({ stdout: RESULT_BLOCK }));
    const manager = buildManager(3, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(executor.run).toHaveBeenCalledOnce();
    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.prUrl).toContain("pullrequest/123");
  });

  it("stops continuing after maxContinuations attempts", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(plainTextResult({ stdout: "still no block" }));
    const manager = buildManager(2, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(executor.continueSession).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(TaskStatus.Error);
    expect(result.failureReason).toBe(FailureReason.MissingResultBlock);
  });

  it("stops continuing when the initial run timed out", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "partial work", timedOut: true }));
    const manager = buildManager(3, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(executor.continueSession).not.toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Partial);
  });

  it("stops continuing when a continuation attempt times out", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(plainTextResult({ stdout: "partial", timedOut: true }));
    const manager = buildManager(3, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.status).toBe(TaskStatus.Partial);
  });

  it("stops continuing when agent reports status without PR URL", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(plainTextResult({ stdout: STATUS_ONLY_BLOCK }));
    const manager = buildManager(3, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.status).toBe(TaskStatus.Blocked);
  });

  it("accumulates stdout and stderr across continuations", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "part1", stderr: "err1" }));
    executor.continueSession
      .mockResolvedValueOnce(plainTextResult({ stdout: "part2", stderr: "err2" }))
      .mockResolvedValueOnce(plainTextResult({ stdout: `part3\n${RESULT_BLOCK}`, stderr: "err3" }));
    const manager = buildManager(5, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(result.stdout).toContain("part1");
    expect(result.stdout).toContain("part2");
    expect(result.stdout).toContain("part3");
    expect(result.stderr).toContain("err1");
    expect(result.stderr).toContain("err2");
    expect(result.stderr).toContain("err3");
  });

  it("keeps the first run's session id when a continuation reports none", async () => {
    // Arrange
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no block", sessionId: "s-1" }));
    executor.continueSession.mockResolvedValue(plainTextResult({ stdout: "died before init" }));
    const manager = buildManager(1, executor);

    // Act
    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    // Assert
    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.sessionIds).toEqual(["s-1"]);
  });

  it("records each distinct session id across continuations, in order", async () => {
    // Arrange
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no block", sessionId: "s-1" }));
    executor.continueSession
      .mockResolvedValueOnce(plainTextResult({ stdout: "still no block", sessionId: "s-1" }))
      .mockResolvedValueOnce(plainTextResult({ stdout: RESULT_BLOCK, sessionId: "s-2" }));
    const manager = buildManager(3, executor);

    // Act
    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    // Assert
    expect(result.sessionIds).toEqual(["s-1", "s-2"]);
  });

  it("passes a continuation prompt with the attempt number and issue, naming no CLI's result format", async () => {
    // Arrange
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(plainTextResult({ stdout: RESULT_BLOCK }));
    const manager = buildManager(3, executor);

    // Act
    await manager.executeWithExecutor(executor, STAGE, makeWorkItem("DF-200", "Fix the widget"));

    // Assert
    const prompt: string = executor.continueSession.mock.calls[0][0];
    expect(prompt).toContain("RALPH CONTINUATION 1/3");
    expect(prompt).toContain("DF-200");
    expect(prompt).toContain("Fix the widget");
    expect(prompt).not.toMatch(/RALPH_RESULT|StructuredOutput/);
  });

  describe("with structured output", () => {
    it("does not continue a run that returned a structured result, and takes its status and PR", async () => {
      // Arrange
      const executor = createMockExecutor();
      executor.run.mockResolvedValue(
        makeExecResult({
          agentText: "Done.",
          structuredOutput: { STATUS: TaskStatus.Partial, PR_URL: "https://dev.azure.com/pr/9" },
        }),
      );
      const manager = buildManager(3, executor);

      // Act
      const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

      // Assert
      expect(executor.continueSession).not.toHaveBeenCalled();
      expect(result.status).toBe(TaskStatus.Partial);
      expect(result.prUrl).toBe("https://dev.azure.com/pr/9");
    });

    it("continues a run that ran out of structured output retries and takes the result the continuation returned", async () => {
      // Arrange
      const executor = createMockExecutor();
      executor.run.mockResolvedValue(
        makeExecResult({ exitCode: 1, cliError: { subtype: "error_max_structured_output_retries" } }),
      );
      executor.continueSession.mockResolvedValue(
        makeExecResult({ structuredOutput: { STATUS: TaskStatus.Completed } }),
      );
      const manager = buildManager(3, executor);

      // Act
      const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

      // Assert
      expect(executor.continueSession).toHaveBeenCalledOnce();
      expect(result.status).toBe(TaskStatus.Completed);
      expect(result.failureReason).toBeUndefined();
    });

    it("fails with missing-result-block when the retries run out on the last attempt", async () => {
      // Arrange
      const executor = createMockExecutor();
      executor.run.mockResolvedValue(
        makeExecResult({ exitCode: 1, cliError: { subtype: "error_max_structured_output_retries" } }),
      );
      const manager = buildManager(0, executor);

      // Act
      const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

      // Assert
      expect(result.status).toBe(TaskStatus.Error);
      expect(result.failureReason).toBe(FailureReason.MissingResultBlock);
    });
  });

  it("uses exponential backoff between continuation attempts", async () => {
    vi.mocked(ContinuationRunner.sleep).mockClear();
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(plainTextResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(plainTextResult({ stdout: "still no block" }));
    const manager = buildManager(3, executor);

    await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    const sleepCalls = vi.mocked(ContinuationRunner.sleep).mock.calls;
    expect(sleepCalls).toHaveLength(3);
    expect(sleepCalls[0][0]).toBe(5_000);
    expect(sleepCalls[1][0]).toBe(10_000);
    expect(sleepCalls[2][0]).toBe(20_000);
  });

  it("parses result block from combined stdout across continuations", async () => {
    const executor = createMockExecutor();
    // First run returns the start marker, continuation completes the block
    executor.run.mockResolvedValue(plainTextResult({ stdout: "===RALPH_RESULT_START===\nPR_URL: " }));
    executor.continueSession.mockResolvedValue(
      plainTextResult({ stdout: "https://dev.azure.com/pr/1\nSTATUS: completed\n===RALPH_RESULT_END===" }),
    );
    const manager = buildManager(3, executor);

    const result = await manager.executeWithExecutor(executor, STAGE, makeWorkItem(KEY));

    expect(result.prUrl).toBe("https://dev.azure.com/pr/1");
    expect(result.status).toBe(TaskStatus.Completed);
  });
});
