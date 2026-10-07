import { describe, it, expect, vi } from "vitest";
import { CopilotExecutor } from "../../../src/container/cli-executors/copilot-executor";
import { CopilotRuntime } from "../../../src/cli/copilot/copilot-runtime";
import { DEFAULT_COPILOT_MODEL } from "../../../src/cli/model-catalog";
import type { IAgentProfile } from "../../../src/config/types";
import { makeProfile } from "../../helpers/factories";
import { createMockCompose, createMockLogger, fakeCliProcess } from "../../helpers/mocks";

describe("CopilotExecutor", () => {
  function createExecutor(overrides: Partial<IAgentProfile> = {}, stdout = "done\n") {
    const { compose } = createMockCompose();
    vi.mocked(compose.execWithTimeout).mockImplementation(() => fakeCliProcess(stdout));
    const profile = makeProfile({ agentName: "ralph.ralph", ...overrides });
    const executor = new CopilotExecutor({
      compose,
      stageProfile: profile,
      runtime: new CopilotRuntime(),
      containerLogger: createMockLogger(),
    });
    return { executor, compose, profile };
  }

  /** The compose exec arguments, timeout and stdin options of the n-th exec. */
  function exec(compose: ReturnType<typeof createMockCompose>["compose"], call = 0) {
    const [args, timeoutMs, options] = vi.mocked(compose.execWithTimeout).mock.calls[call];
    return { args, timeoutMs, options };
  }

  describe("run", () => {
    it("runs the exact Copilot command line, without a shell, with the prompt on stdin", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ model: "claude-opus-4.6", timeoutMs: 1234 });

      // Act
      await executor.run("test prompt");

      // Assert
      const { args, timeoutMs, options } = exec(compose);
      expect(args).toEqual([
        "-T",
        "--user",
        "vscode",
        "app",
        "/usr/local/bin/copilot",
        "--additional-mcp-config",
        "@/workspace/.ralph/mcp-config.json",
        "--agent",
        "ralph.ralph",
        "--model",
        "claude-opus-4.6",
        "--disable-builtin-mcps",
        "--log-level",
        "debug",
        "--log-dir",
        "/workspace/.ralph/logs/cli-debug",
        "--allow-all-tools",
        "--allow-all-paths",
        "--share",
        "/workspace/.ralph/logs/session-transcript.md",
      ]);
      expect(timeoutMs).toBe(1234);
      expect(options).toEqual({ input: "test prompt" });
    });

    it("passes --add-github-mcp-tool for each declared tool instead of disabling the built-in server", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ githubMcpTools: ["get_file_contents", "search_code"] });

      // Act
      await executor.run("test prompt");

      // Assert
      const cmd = exec(compose).args.join(" ");
      expect(cmd).not.toContain("--disable-builtin-mcps");
      expect(cmd).toContain("--add-github-mcp-tool get_file_contents --add-github-mcp-tool search_code");
    });

    it("falls back to DEFAULT_COPILOT_MODEL when no model is set", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ model: undefined });

      // Act
      await executor.run("prompt");

      // Assert
      expect(exec(compose).args.join(" ")).toContain(`--model ${DEFAULT_COPILOT_MODEL}`);
    });

    it("returns its stdout as the agent text", async () => {
      // Arrange
      const { executor } = createExecutor({}, "line one\nline two\n");

      // Act
      const result = await executor.run("prompt");

      // Assert
      expect(result).toMatchObject({ exitCode: 0, stdout: "line one\nline two\n", timedOut: false });
      expect(result.agentText).toBe("line one\nline two");
    });
  });

  describe("continueSession", () => {
    it("resumes with --continue, the same flags as run and the continuation prompt on stdin", async () => {
      // Arrange
      const { executor, compose } = createExecutor();
      await executor.run("first");

      // Act
      await executor.continueSession("continue working");

      // Assert
      const { args, options } = exec(compose, 1);
      expect(args).toEqual([...exec(compose, 0).args, "--continue"]);
      expect(options).toEqual({ input: "continue working" });
    });
  });
});
