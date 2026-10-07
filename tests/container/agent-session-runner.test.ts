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
import { FailureReason, TaskStatus, type ContainerExecResult } from "../../src/container/types";
import { makeExecResult, makeWorkItem } from "../helpers/factories";
import { createMockExecutor, createSilentLogger, type Mocked } from "../helpers/mocks";

function createMockContinuationRunner(): Mocked<IContinuationRunner> {
  return {
    run: vi.fn().mockResolvedValue({
      lastResult: makeExecResult(),
      combinedAgentText: "",
      resultText: "",
      combinedStdout: "",
      combinedStderr: "",
      sessionIds: [],
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

    await runner.run(executor, issue, undefined, {
      maxContinuations: 0,
      enableContinuation: false,
      requireResultBlock: false,
    });

    expect(vi.mocked(promptBuilder.build)).toHaveBeenCalledWith(issue, undefined);
    expect(continuationRunner.run).toHaveBeenCalledWith(executor, "test prompt", issue, 0);
  });

  it("passes issue context to prompt builder", async () => {
    const executor = createMockExecutor();
    const context = { previousHandoff: "some handoff", comments: [], isRevision: false };

    await runner.run(executor, makeWorkItem("DF-500"), context, {
      maxContinuations: 0,
      enableContinuation: false,
      requireResultBlock: false,
    });

    expect(vi.mocked(promptBuilder.build)).toHaveBeenCalledWith(expect.objectContaining({ id: "DF-500" }), context);
  });

  it("parses the result block from the continuation's result text, not from the combined text or raw stdout", async () => {
    // Arrange
    continuationRunner.run.mockResolvedValue({
      lastResult: makeExecResult(),
      combinedAgentText: "===RALPH_RESULT_START===\nSTATUS: done\n===RALPH_RESULT_END===\nworking...",
      resultText:
        "===RALPH_RESULT_START===\nPR_URL: https://dev.azure.com/pr/1\nSTATUS: completed\n===RALPH_RESULT_END===",
      combinedStdout: '{"type":"assistant","message":{"content":[{"type":"text","text":"STATUS: blocked"}]}}',
      combinedStderr: "",
      sessionIds: [],
    });

    // Act
    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-300"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
      requireResultBlock: false,
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
      resultText: block,
      combinedStdout: block,
      combinedStderr: "some warning",
      sessionIds: [],
    });

    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-400"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
      requireResultBlock: false,
    });

    expect(result.taskId).toBe("DF-400");
    expect(result.status).toBe(TaskStatus.Partial);
    expect(result.prUrl).toBe("https://dev.azure.com/pr/2");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stdout).toContain("RALPH_RESULT_START");
    expect(result.stderr).toBe("some warning");
  });

  it("returns the session ids of every CLI invocation the continuation runner reports", async () => {
    // Arrange
    continuationRunner.run.mockResolvedValue({
      lastResult: makeExecResult(),
      combinedAgentText: "",
      resultText: "",
      combinedStdout: "",
      combinedStderr: "",
      sessionIds: ["s-1", "s-2"],
    });

    // Act
    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-700"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
      requireResultBlock: false,
    });

    // Assert
    expect(result.sessionIds).toEqual(["s-1", "s-2"]);
  });

  it("records no session id when the CLI reports none", async () => {
    // Act
    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-701"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
      requireResultBlock: false,
    });

    // Assert
    expect(result).not.toHaveProperty("sessionIds");
  });

  it("passes 0 continuations when enableContinuation is false", async () => {
    await runner.run(createMockExecutor(), makeWorkItem("DF-600"), undefined, {
      maxContinuations: 5,
      enableContinuation: false,
      requireResultBlock: true,
    });

    expect(continuationRunner.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 0);
  });

  it("passes maxContinuations when enableContinuation is true and the stage requires a result block", async () => {
    await runner.run(createMockExecutor(), makeWorkItem("DF-601"), undefined, {
      maxContinuations: 3,
      enableContinuation: true,
      requireResultBlock: true,
    });

    expect(continuationRunner.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 3);
  });

  it("passes 0 continuations when the stage waives the result block", async () => {
    // Act
    await runner.run(createMockExecutor(), makeWorkItem("DF-602"), undefined, {
      maxContinuations: 3,
      enableContinuation: true,
      requireResultBlock: false,
    });

    // Assert
    expect(continuationRunner.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 0);
  });

  describe("result contract", () => {
    /** Runs the session runner over one CLI result whose agent text is `agentText`. */
    async function runWith(lastResult: Partial<ContainerExecResult>, requireResultBlock: boolean, agentText = "") {
      continuationRunner.run.mockResolvedValue({
        lastResult: makeExecResult(lastResult),
        combinedAgentText: agentText,
        resultText: agentText,
        combinedStdout: "",
        combinedStderr: lastResult.stderr ?? "",
        sessionIds: [],
      });
      return runner.run(createMockExecutor(), makeWorkItem("DF-900"), undefined, {
        maxContinuations: 0,
        enableContinuation: false,
        requireResultBlock,
      });
    }

    it("fails a stage that requires a result block and ended without one", async () => {
      // Act
      const result = await runWith({}, true, "All done, no block.");

      // Assert
      expect(result.status).toBe(TaskStatus.Error);
      expect(result.failureReason).toBe(FailureReason.MissingResultBlock);
      expect(result.agentText).toBe("All done, no block.");
    });

    it("completes a stage that waives the block, as hook stages do by default, on exit 0", async () => {
      // Act
      const result = await runWith({}, false);

      // Assert
      expect(result.status).toBe(TaskStatus.Completed);
      expect(result.failureReason).toBeUndefined();
    });

    it("fails an authentication error with its reason and keeps the CLI's message", async () => {
      // Arrange
      const cliError = { subtype: "authentication_failed", message: "Not logged in · Please run /login" };

      // Act
      const result = await runWith({ exitCode: 1, cliError }, true);

      // Assert
      expect(result.status).toBe(TaskStatus.Error);
      expect(result.failureReason).toBe(FailureReason.AuthFailed);
      expect(result.cliError).toEqual(cliError);
    });

    it("fails a session that hit its turn limit, even when its stage needs no result block", async () => {
      // Act
      const result = await runWith({ cliError: { subtype: "error_max_turns" } }, false);

      // Assert
      expect(result.status).toBe(TaskStatus.Error);
      expect(result.failureReason).toBe(FailureReason.MaxTurns);
    });

    it("takes the agent's reported status over the CLI error that followed it", async () => {
      // Act
      const result = await runWith(
        { cliError: { subtype: "error_during_execution" } },
        true,
        "===RALPH_RESULT_START===\nSTATUS: partial\n===RALPH_RESULT_END===",
      );

      // Assert
      expect(result.status).toBe(TaskStatus.Partial);
      expect(result.failureReason).toBeUndefined();
      expect(result.cliError).toEqual({ subtype: "error_during_execution" });
    });
  });

  it("resolves error status when exit code is non-zero", async () => {
    continuationRunner.run.mockResolvedValue({
      lastResult: makeExecResult({ exitCode: 1, stderr: "fail" }),
      combinedAgentText: "",
      resultText: "",
      combinedStdout: "",
      combinedStderr: "fail",
      sessionIds: [],
    });

    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-700"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
      requireResultBlock: false,
    });

    expect(result.status).toBe(TaskStatus.Error);
    expect(result.exitCode).toBe(1);
  });

  it("resolves partial status on timeout", async () => {
    continuationRunner.run.mockResolvedValue({
      lastResult: makeExecResult({ exitCode: 1, timedOut: true }),
      combinedAgentText: "",
      resultText: "",
      combinedStdout: "",
      combinedStderr: "",
      sessionIds: [],
    });

    const result = await runner.run(createMockExecutor(), makeWorkItem("DF-800"), undefined, {
      maxContinuations: 0,
      enableContinuation: false,
      requireResultBlock: false,
    });

    expect(result.status).toBe(TaskStatus.Partial);
  });
});
