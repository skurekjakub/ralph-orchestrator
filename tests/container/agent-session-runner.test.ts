/**
 * AgentSessionRunner unit tests.
 *
 * Verifies that the session runner correctly delegates prompt building to
 * PromptBuilder, runs the continuation loop, parses the result block, and
 * assembles the final RalphResult.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSessionRunner } from "../../src/container/agent-session-runner";
import type { ICliExecutor } from "../../src/container/cli-executor-factory";
import type { IContinuationRunner } from "../../src/container/continuation-runner";
import type { PromptBuilder } from "../../src/prompt/prompt-builder";
import { TaskStatus, type CliPaths } from "../../src/container/types";
import { makeWorkItem } from "../helpers/factories";
import { createSilentLogger, type Mocked } from "../helpers/mocks";

const cliPaths: CliPaths = {
  configDir: "/workspace/.ralph",
  writableDirs: ["/workspace/.ralph/logs"],
  transcriptPath: "/workspace/.ralph/logs/session-transcript.md",
  logDir: "/workspace/.ralph/logs/cli-debug",
};

function createMockExecutor(): Mocked<ICliExecutor> & { paths: CliPaths } {
  return {
    paths: cliPaths,
    run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "", timedOut: false }),
    continueSession: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "", timedOut: false }),
    killActive: vi.fn(),
  };
}

function createMockContinuationRunner(): Mocked<IContinuationRunner> {
  return {
    run: vi.fn().mockResolvedValue({
      lastResult: { exitCode: 0, stdout: "", stderr: "", timedOut: false },
      combinedStdout: "",
      combinedStderr: "",
    }),
  };
}

function createMockPromptBuilder(): PromptBuilder {
  return {
    build: vi.fn().mockReturnValue({ text: "test prompt", audit: { safe: true, findings: [] } }),
  } as unknown as PromptBuilder;
}

describe("AgentSessionRunner", () => {
  let runner: AgentSessionRunner;
  let continuationRunner: Mocked<IContinuationRunner>;
  let promptBuilder: PromptBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    continuationRunner = createMockContinuationRunner();
    promptBuilder = createMockPromptBuilder();
    runner = new AgentSessionRunner({
      continuationRunner: continuationRunner as unknown as IContinuationRunner,
      promptBuilder,
      logger: createSilentLogger(),
    });
  });

  it("builds prompt and delegates to continuation runner", async () => {
    const executor = createMockExecutor();
    const issue = makeWorkItem("DF-200");

    await runner.run(executor, issue, undefined, { maxContinuations: 0, enableContinuation: false });

    expect(vi.mocked(promptBuilder.build)).toHaveBeenCalledWith(issue, undefined);
    expect(continuationRunner.run).toHaveBeenCalledWith(executor, "test prompt", issue, 0);
  });

  it("passes issue context to prompt builder", async () => {
    const executor = createMockExecutor();
    const context = { previousHandoff: "some handoff", comments: [], isRevision: false };

    await runner.run(executor, makeWorkItem("DF-500"), context, { maxContinuations: 0, enableContinuation: false });

    expect(vi.mocked(promptBuilder.build)).toHaveBeenCalledWith(expect.objectContaining({ id: "DF-500" }), context);
  });

  it("parses result block from combined stdout", async () => {
    continuationRunner.run.mockResolvedValue({
      lastResult: { exitCode: 0, stdout: "", stderr: "", timedOut: false },
      combinedStdout:
        "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/pr/1\nSTATUS: completed\n===RALPH_RESULT_END===",
      combinedStderr: "",
    });

    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-300"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
    });

    expect(result.prUrl).toBe("https://dev.azure.com/pr/1");
    expect(result.status).toBe(TaskStatus.Completed);
  });

  it("returns RalphResult with status, prUrl, and duration", async () => {
    continuationRunner.run.mockResolvedValue({
      lastResult: { exitCode: 0, stdout: "", stderr: "", timedOut: false },
      combinedStdout:
        "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/pr/2\nSTATUS: partial\n===RALPH_RESULT_END===",
      combinedStderr: "some warning",
    });

    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-400"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
    });

    expect(result.taskId).toBe("DF-400");
    expect(result.status).toBe(TaskStatus.Partial);
    expect(result.prUrl).toBe("https://dev.azure.com/pr/2");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stdout).toContain("RALPH_RESULT_START");
    expect(result.stderr).toBe("some warning");
  });

  it("passes 0 continuations when enableContinuation is false", async () => {
    await runner.run(createMockExecutor(), makeWorkItem("DF-600"), undefined, {
      maxContinuations: 5,
      enableContinuation: false,
    });

    expect(continuationRunner.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 0);
  });

  it("passes maxContinuations when enableContinuation is true", async () => {
    await runner.run(createMockExecutor(), makeWorkItem("DF-601"), undefined, {
      maxContinuations: 3,
      enableContinuation: true,
    });

    expect(continuationRunner.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 3);
  });

  it("resolves error status when exit code is non-zero", async () => {
    continuationRunner.run.mockResolvedValue({
      lastResult: { exitCode: 1, stdout: "", stderr: "fail", timedOut: false },
      combinedStdout: "",
      combinedStderr: "fail",
    });

    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-700"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
    });

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.exitCode).toBe(1);
  });

  it("resolves partial status on timeout", async () => {
    continuationRunner.run.mockResolvedValue({
      lastResult: { exitCode: 1, stdout: "", stderr: "", timedOut: true },
      combinedStdout: "",
      combinedStderr: "",
    });

    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-800"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
    });

    expect(result.status).toBe(TaskStatus.Partial);
  });
});
