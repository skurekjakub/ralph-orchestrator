/**
 * AgentSessionRunner unit tests.
 *
 * Verifies that the session runner correctly delegates prompt building to
 * PromptBuilder, runs the continuation loop, parses the result block, and
 * assembles the final RalphResult.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSessionRunner } from "../../src/container/agent-session-runner";
import type { IContinuationRunner } from "../../src/container/continuation-runner";
import type { PromptBuilder } from "../../src/prompt/prompt-builder";
import { TaskStatus } from "../../src/container/types";
import { makeExecResult, makeWorkItem } from "../helpers/factories";
import { createMockExecutor, createSilentLogger, type Mocked } from "../helpers/mocks";

function createMockContinuationRunner(): Mocked<IContinuationRunner> {
  return {
    run: vi.fn().mockResolvedValue({
      lastResult: makeExecResult(),
      combinedAgentText: "",
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

  it("parses the result block from the combined agent text, not from raw stdout", async () => {
    // Arrange
    continuationRunner.run.mockResolvedValue({
      lastResult: makeExecResult(),
      combinedAgentText:
        "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/pr/1\nSTATUS: completed\n===RALPH_RESULT_END===",
      combinedStdout: '{"type":"assistant","message":{"content":[{"type":"text","text":"STATUS: blocked"}]}}',
      combinedStderr: "",
    });

    // Act
    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-300"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
    });

    // Assert
    expect(result.prUrl).toBe("https://dev.azure.com/pr/1");
    expect(result.status).toBe(TaskStatus.Completed);
  });

  it("returns RalphResult with status, prUrl, and duration", async () => {
    const block =
      "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/pr/2\nSTATUS: partial\n===RALPH_RESULT_END===";
    continuationRunner.run.mockResolvedValue({
      lastResult: makeExecResult(),
      combinedAgentText: block,
      combinedStdout: block,
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

  it("returns the session id the last CLI run reported", async () => {
    // Arrange
    continuationRunner.run.mockResolvedValue({
      lastResult: makeExecResult({ sessionId: "s-1" }),
      combinedAgentText: "",
      combinedStdout: "",
      combinedStderr: "",
    });

    // Act
    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-700"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
    });

    // Assert
    expect(result.sessionId).toBe("s-1");
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
      lastResult: makeExecResult({ exitCode: 1, stderr: "fail" }),
      combinedAgentText: "",
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
      lastResult: makeExecResult({ exitCode: 1, timedOut: true }),
      combinedAgentText: "",
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
