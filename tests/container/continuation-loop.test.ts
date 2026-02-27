import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContainerManager } from "../../src/container/manager.js";
import { ContinuationRunner } from "../../src/container/continuation-runner.js";
import type { ContainerExecResult } from "../../src/container/types.js";
import { TaskStatus } from "../../src/container/types.js";
import type { BuiltPrompt } from "../../src/prompt/prompt-builder.js";
import type { PromptBuilder } from "../../src/prompt/prompt-builder.js";
import { makeProfile, makeWorkItem } from "../helpers/factories.js";
import { createSilentLogger } from "../helpers/mocks.js";
import type { ICliExecutor } from "../../src/container/cli-executor-factory.js";
import type { IComposeClient } from "../../src/container/compose-client.js";
import type { IContainerLogCollector } from "../../src/container/log-collector.js";
import type { IContainerWorkspaceCleaner } from "../../src/container/workspace-cleaner.js";
import type { ILogSourceRegistry } from "../../src/container/log-source-registry.js";
import type { CliPaths } from "../../src/container/types.js";
import type { ResultPromise } from "execa";

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeExecResult(overrides: Partial<ContainerExecResult> = {}): ContainerExecResult {
  return { exitCode: 0, stdout: "", stderr: "", timedOut: false, ...overrides };
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

const cliPaths: CliPaths = {
  configDir: "/workspace/.ralph",
  writableDirs: ["/workspace/.ralph/logs"],
  transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
  logDir: "/workspace/.ralph/logs/cli-debug",
};

function createMockExecutor(): ICliExecutor & { run: ReturnType<typeof vi.fn>; continueSession: ReturnType<typeof vi.fn> } {
  return {
    paths: cliPaths,
    run: vi.fn().mockResolvedValue(makeExecResult()),
    continueSession: vi.fn().mockResolvedValue(makeExecResult()),
    killActive: vi.fn(),
  };
}

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
  };
  const cleaner: IContainerWorkspaceCleaner = {
    prepareConfigDir: vi.fn().mockResolvedValue(undefined),
    cleanDirectory: vi.fn().mockResolvedValue(undefined),
    cleanPaths: vi.fn().mockResolvedValue(undefined),
  };
  const logRegistry: ILogSourceRegistry = {
    registerAll: vi.fn(),
  };
  const continuationRunner = new ContinuationRunner({ logger });

  return new ContainerManager({
    profile, compose, executor, logs, cleaner,
    logRegistry, continuationRunner, promptBuilder, logger,
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

describe("ContainerManager.execute — continuation loop", () => {
  beforeEach(() => {
    vi.spyOn(ContinuationRunner, "sleep").mockResolvedValue(undefined);
  });

  it("does not continue when maxContinuations is 0", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "no result block" }));
    const manager = buildManager(0, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(executor.run).toHaveBeenCalledOnce();
    expect(executor.continueSession).not.toHaveBeenCalled();
    // exitCode=0 without a result block still resolves to completed
    expect(result.status).toBe(TaskStatus.Completed);
  });

  it("does not continue when initial run produces a result block", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: RESULT_BLOCK }));
    const manager = buildManager(3, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(executor.run).toHaveBeenCalledOnce();
    expect(executor.continueSession).not.toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.prUrl).toContain("pullrequest/123");
  });

  it("continues when initial run has no result block", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "working..." }));
    executor.continueSession.mockResolvedValue(makeExecResult({ stdout: RESULT_BLOCK }));
    const manager = buildManager(3, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(executor.run).toHaveBeenCalledOnce();
    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.status).toBe(TaskStatus.Completed);
    expect(result.prUrl).toContain("pullrequest/123");
  });

  it("stops continuing after maxContinuations attempts", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(makeExecResult({ stdout: "still no block" }));
    const manager = buildManager(2, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(executor.continueSession).toHaveBeenCalledTimes(2);
    // All attempts had exitCode=0, so resolveStatus returns completed
    expect(result.status).toBe(TaskStatus.Completed);
  });

  it("stops continuing when the initial run timed out", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "partial work", timedOut: true }));
    const manager = buildManager(3, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(executor.continueSession).not.toHaveBeenCalled();
    expect(result.status).toBe(TaskStatus.Partial);
  });

  it("stops continuing when a continuation attempt times out", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(makeExecResult({ stdout: "partial", timedOut: true }));
    const manager = buildManager(3, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.status).toBe(TaskStatus.Partial);
  });

  it("stops continuing when agent reports status without PR URL", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(makeExecResult({ stdout: STATUS_ONLY_BLOCK }));
    const manager = buildManager(3, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(executor.continueSession).toHaveBeenCalledOnce();
    expect(result.status).toBe(TaskStatus.Blocked);
  });

  it("accumulates stdout and stderr across continuations", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "part1", stderr: "err1" }));
    executor.continueSession
      .mockResolvedValueOnce(makeExecResult({ stdout: "part2", stderr: "err2" }))
      .mockResolvedValueOnce(makeExecResult({ stdout: `part3\n${RESULT_BLOCK}`, stderr: "err3" }));
    const manager = buildManager(5, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(result.stdout).toContain("part1");
    expect(result.stdout).toContain("part2");
    expect(result.stdout).toContain("part3");
    expect(result.stderr).toContain("err1");
    expect(result.stderr).toContain("err2");
    expect(result.stderr).toContain("err3");
  });

  it("passes continuation prompt with attempt number and issue key", async () => {
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(makeExecResult({ stdout: RESULT_BLOCK }));
    const manager = buildManager(3, executor);

    await manager.execute(makeWorkItem("DF-200", "Fix the widget"));

    const prompt: string = executor.continueSession.mock.calls[0][0];
    expect(prompt).toContain("RALPH CONTINUATION 1/3");
    expect(prompt).toContain("===RALPH_RESULT_START===");
    expect(prompt).toContain("DF-200");
    expect(prompt).toContain("Fix the widget");
  });

  it("uses exponential backoff between continuation attempts", async () => {
    vi.mocked(ContinuationRunner.sleep).mockClear();
    const executor = createMockExecutor();
    executor.run.mockResolvedValue(makeExecResult({ stdout: "no block" }));
    executor.continueSession.mockResolvedValue(makeExecResult({ stdout: "still no block" }));
    const manager = buildManager(3, executor);

    await manager.execute(makeWorkItem("DF-100"));

    const sleepCalls = vi.mocked(ContinuationRunner.sleep).mock.calls;
    expect(sleepCalls).toHaveLength(3);
    expect(sleepCalls[0][0]).toBe(5_000);
    expect(sleepCalls[1][0]).toBe(10_000);
    expect(sleepCalls[2][0]).toBe(20_000);
  });

  it("parses result block from combined stdout across continuations", async () => {
    const executor = createMockExecutor();
    // First run returns the start marker, continuation completes the block
    executor.run.mockResolvedValue(makeExecResult({ stdout: "===RALPH_RESULT_START===\nPR_URL: " }));
    executor.continueSession.mockResolvedValue(
      makeExecResult({ stdout: "https://dev.azure.com/pr/1\nSTATUS: completed\n===RALPH_RESULT_END===" }),
    );
    const manager = buildManager(3, executor);

    const result = await manager.execute(makeWorkItem("DF-100"));

    expect(result.prUrl).toBe("https://dev.azure.com/pr/1");
    expect(result.status).toBe(TaskStatus.Completed);
  });
});
