import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CopilotExecutor } from "../../../src/container/cli-executors/copilot-executor";
import { CopilotRuntime } from "../../../src/cli/copilot/copilot-runtime";
import { DEFAULT_COPILOT_MODEL } from "../../../src/cli/model-catalog";
import { CliType, type IAgentProfile } from "../../../src/config/types";
import { makeProfile } from "../../helpers/factories";
import { createMockCompose, createMockLogger, fakeCliProcess } from "../../helpers/mocks";

describe("CopilotExecutor", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "copilot-executor-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  function createExecutor(overrides: Partial<IAgentProfile> = {}, stdout = "done\n") {
    const { compose } = createMockCompose();
    vi.mocked(compose.execWithTimeout).mockImplementation(() => fakeCliProcess(stdout));
    const profile = makeProfile({ repoPath, agentName: "ralph.ralph", ...overrides });
    const executor = new CopilotExecutor({
      compose,
      profile,
      runtime: new CopilotRuntime(),
      logger: createMockLogger(),
    });
    return { executor, compose, profile };
  }

  /** The `sh -c` command of the n-th exec. */
  function shellCmd(compose: ReturnType<typeof createMockCompose>["compose"], call = 0): string {
    const args = vi.mocked(compose.execWithTimeout).mock.calls[call][0];
    expect(args.slice(0, 5)).toEqual(["--user", "vscode", "app", "sh", "-c"]);
    return args[5];
  }

  it("runs Copilot CLI", () => {
    // Act & Assert
    expect(createExecutor().executor.cli).toBe(CliType.Copilot);
  });

  describe("run", () => {
    it("runs the exact Copilot command line", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ model: "claude-opus-4.6", timeoutMs: 1234 });

      // Act
      await executor.run("test prompt");

      // Assert
      expect(shellCmd(compose)).toBe(
        "exec /usr/local/bin/copilot --additional-mcp-config @/workspace/.ralph/mcp-config.json " +
          "--agent ralph.ralph --model claude-opus-4.6 --disable-builtin-mcps --log-level debug " +
          "--log-dir /workspace/.ralph/logs/cli-debug --allow-all-tools --allow-all-paths " +
          '--share /workspace/.ralph/logs/session-transcript.md -p "$(cat /workspace/.ralph/prompt.txt)"',
      );
      expect(vi.mocked(compose.execWithTimeout).mock.calls[0][1]).toBe(1234);
      expect(vi.mocked(compose.execWithTimeout).mock.calls[0][2]).toEqual({ inputFile: undefined });
    });

    it("passes --add-github-mcp-tool for each declared tool instead of disabling the built-in server", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ githubMcpTools: ["get_file_contents", "search_code"] });

      // Act
      await executor.run("test prompt");

      // Assert
      const cmd = shellCmd(compose);
      expect(cmd).not.toContain("--disable-builtin-mcps");
      expect(cmd).toContain("--add-github-mcp-tool get_file_contents --add-github-mcp-tool search_code");
    });

    it("falls back to DEFAULT_COPILOT_MODEL when no model is set", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ model: undefined });

      // Act
      await executor.run("prompt");

      // Assert
      expect(shellCmd(compose)).toContain(`--model ${DEFAULT_COPILOT_MODEL}`);
    });

    it("writes the prompt to the repo's .ralph/prompt.txt", async () => {
      // Arrange
      const { executor } = createExecutor();

      // Act
      await executor.run("test prompt");

      // Assert
      expect(readFileSync(join(repoPath, ".ralph", "prompt.txt"), "utf-8")).toBe("test prompt");
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
    it("resumes with --continue --prompt and the same flags as run", async () => {
      // Arrange
      const { executor, compose } = createExecutor();

      // Act
      await executor.continueSession("continue working");

      // Assert
      const cmd = shellCmd(compose);
      expect(cmd).toContain('--share /workspace/.ralph/logs/session-transcript.md --continue --prompt "$(cat ');
      expect(cmd).not.toMatch(/ -p /);
      expect(readFileSync(join(repoPath, ".ralph", "prompt.txt"), "utf-8")).toBe("continue working");
    });
  });
});
