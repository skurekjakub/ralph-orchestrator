import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ExecaError } from "execa";
import { ClaudeCodeExecutor } from "../../../src/container/cli-executors/claude-code-executor";
import { ClaudeCodeRuntime } from "../../../src/cli/claude/claude-runtime";
import {
  ClaudeAuthMode,
  CliType,
  ReasoningEffort,
  type IAgentProfile,
  type IStageConfig,
} from "../../../src/config/types";
import { makeProfile, makeStage } from "../../helpers/factories";
import { createMockCompose, createMockLogger, fakeCliProcess } from "../../helpers/mocks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One stream-json line. */
const line = (event: object): string => JSON.stringify(event) + "\n";

/** A successful session: init, the agent's final message, and its result. */
function successfulSession(text: string): string {
  return (
    line({ type: "system", subtype: "init", session_id: "sid-1", model: "claude-opus-5-5", tools: [], agents: [] }) +
    line({
      type: "assistant",
      parent_tool_use_id: null,
      session_id: "sid-1",
      message: { content: [{ type: "text", text }] },
    }) +
    line({
      type: "result",
      subtype: "success",
      is_error: false,
      result: text,
      session_id: "sid-1",
      num_turns: 3,
      total_cost_usd: 0.5,
      modelUsage: {
        "claude-opus-5-5": {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadInputTokens: 30,
          cacheCreationInputTokens: 40,
        },
      },
      permission_denials: [],
    })
  );
}

const RESULT_BLOCK = "===RALPH_RESULT_START===\nPR_URL: none\nSTATUS: completed\n===RALPH_RESULT_END===";

describe("ClaudeCodeExecutor", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "claude-executor-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  function createExecutor(
    options: {
      profile?: Partial<IAgentProfile>;
      stage?: Partial<IStageConfig>;
      subagentDepth?: number;
      process?: () => ReturnType<typeof fakeCliProcess>;
    } = {},
  ) {
    const { compose } = createMockCompose();
    vi.mocked(compose.execWithTimeout).mockImplementation(
      options.process ?? (() => fakeCliProcess(successfulSession(RESULT_BLOCK))),
    );
    const stage = makeStage({ agent: "ralph.ralph", cli: CliType.Claude, ...options.stage });
    const profile = makeProfile({
      repoPath,
      cli: CliType.Claude,
      stages: [stage],
      timeoutMs: 5000,
      ...options.profile,
    });
    const logger = createMockLogger();
    const executor = new ClaudeCodeExecutor({
      compose,
      profile,
      stage,
      agentName: "ralph",
      subagentDepth: options.subagentDepth ?? 2,
      runtime: new ClaudeCodeRuntime({ claudeAuth: ClaudeAuthMode.OAuthToken }),
      logger,
    });
    return { executor, compose, logger };
  }

  /** The `docker compose exec` arguments, timeout and options of the n-th exec. */
  function exec(compose: ReturnType<typeof createMockCompose>["compose"], call = 0) {
    const [args, timeoutMs, options] = vi.mocked(compose.execWithTimeout).mock.calls[call];
    return { args, timeoutMs, options };
  }

  it("runs Claude Code", () => {
    // Act & Assert
    expect(createExecutor().executor.cli).toBe(CliType.Claude);
  });

  describe("run", () => {
    it("execs claude headless with stream-json, the stage's agent, policy flags and a new session id", async () => {
      // Arrange
      const { executor, compose } = createExecutor();

      // Act
      await executor.run("do the task");

      // Assert
      const { args, timeoutMs } = exec(compose);
      const sessionId = args[args.indexOf("--session-id") + 1];
      expect(sessionId).toMatch(UUID);
      expect(args).toEqual([
        "-T",
        "--user",
        "vscode",
        "-e",
        "RALPH_REQUIRE_RESULT_BLOCK=1",
        "-e",
        "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2",
        "app",
        "/usr/local/bin/claude",
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--agent",
        "ralph",
        "--setting-sources",
        "user",
        "--mcp-config",
        "/workspace/.ralph/mcp-config.json",
        "--strict-mcp-config",
        "--permission-mode",
        "bypassPermissions",
        "--tools",
        "Read,Write,Edit,Bash,Skill,TaskCreate,TaskGet,TaskList,TaskUpdate,WebFetch,WebSearch,Agent",
        "--session-id",
        sessionId,
        "--debug-file",
        "/workspace/.ralph/logs/cli-debug/claude.log",
      ]);
      expect(timeoutMs).toBe(5000);
    });

    it("passes the prompt on stdin, not on the command line or in a file", async () => {
      // Arrange
      const { executor, compose } = createExecutor();

      // Act
      await executor.run("a prompt longer than any argument should carry");

      // Assert
      expect(exec(compose).options).toEqual({ input: "a prompt longer than any argument should carry" });
      expect(exec(compose).args.join(" ")).not.toContain("a prompt longer");
      expect(existsSync(join(repoPath, ".ralph"))).toBe(false);
    });

    it("passes the stage's model and effort only when set", async () => {
      // Arrange
      const { executor: tuned, compose: tunedCompose } = createExecutor({
        profile: { model: "opus" },
        stage: { effort: ReasoningEffort.High },
      });
      const { executor: plain, compose: plainCompose } = createExecutor();

      // Act
      await tuned.run("p");
      await plain.run("p");

      // Assert
      const tunedArgs = exec(tunedCompose).args.join(" ");
      expect(tunedArgs).toContain("--model opus --effort high --setting-sources user");
      const plainArgs = exec(plainCompose).args;
      expect(plainArgs).not.toContain("--model");
      expect(plainArgs).not.toContain("--effort");
    });

    it("leaves Agent out of the tools and the spawn depth unset for an agent without subagents", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ subagentDepth: 0 });

      // Act
      await executor.run("p");

      // Assert
      const { args } = exec(compose);
      expect(args[args.indexOf("--tools") + 1]).toBe(
        "Read,Write,Edit,Bash,Skill,TaskCreate,TaskGet,TaskList,TaskUpdate,WebFetch,WebSearch",
      );
      expect(args.join(" ")).not.toContain("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH");
    });

    it("turns the result gate off for a stage that needs no result block", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ stage: { requireResultBlock: false } });

      // Act
      await executor.run("p");

      // Assert
      expect(exec(compose).args).toContain("RALPH_REQUIRE_RESULT_BLOCK=0");
    });

    it("adds the project settings source when the profile loads the repo's instructions", async () => {
      // Arrange
      const { executor, compose } = createExecutor({ profile: { claude: { loadRepoInstructions: true } } });

      // Act
      await executor.run("p");

      // Assert
      const { args } = exec(compose);
      expect(args[args.indexOf("--setting-sources") + 1]).toBe("user,project");
    });

    it("returns the decoded final message, usage and session id alongside the raw stream", async () => {
      // Arrange
      const { executor } = createExecutor();

      // Act
      const result = await executor.run("p");

      // Assert
      expect(result.exitCode).toBe(0);
      expect(result.agentText).toBe(RESULT_BLOCK);
      expect(result.sessionId).toBe("sid-1");
      expect(result.usage).toMatchObject({ costUsd: 0.5, numTurns: 3, inputTokens: 10, outputTokens: 20 });
      expect(result.stdout).toContain('"type":"result"');
      expect(result.cliError).toBeUndefined();
    });

    it("reports Claude Code's error when the CLI exits non-zero after a failed session", async () => {
      // Arrange
      const stream =
        line({
          type: "assistant",
          parent_tool_use_id: null,
          error: "authentication_failed",
          is_api_error_message: true,
          message: { content: [{ type: "text", text: "Not logged in · Please run /login" }] },
        }) +
        line({
          type: "result",
          subtype: "success",
          is_error: true,
          result: "Not logged in · Please run /login",
          terminal_reason: "api_error",
        });
      const error = Object.assign(Object.create(ExecaError.prototype) as ExecaError, {
        exitCode: 1,
        timedOut: false,
        stdout: stream,
        stderr: "",
        shortMessage: "Command failed with exit code 1",
      });
      const { executor, logger } = createExecutor({ process: () => fakeCliProcess(stream, { exitCode: 1, error }) });

      // Act
      const result = await executor.run("p");

      // Assert
      expect(result.exitCode).toBe(1);
      expect(result.agentText).toBe("");
      expect(result.cliError).toEqual({
        subtype: "authentication_failed",
        message: "Not logged in · Please run /login",
      });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("API error (authentication_failed)"));
    });

    it("reports a timeout with what the CLI printed before it was killed", async () => {
      // Arrange
      const partial = line({
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "text", text: "halfway" }] },
      });
      const error = Object.assign(Object.create(ExecaError.prototype) as ExecaError, {
        exitCode: undefined,
        timedOut: true,
        stdout: partial,
        stderr: "",
        shortMessage: "Command timed out",
      });
      const { executor } = createExecutor({ process: () => fakeCliProcess(partial, { error }) });

      // Act
      const result = await executor.run("p");

      // Assert
      expect(result.timedOut).toBe(true);
      expect(result.agentText).toBe("halfway");
      expect(result.usage).toBeUndefined();
    });
  });

  describe("continueSession", () => {
    it("resumes the session run started, with the continuation prompt on stdin", async () => {
      // Arrange
      const { executor, compose } = createExecutor();
      await executor.run("first");

      // Act
      await executor.continueSession("keep going");

      // Assert
      const first = exec(compose, 0).args;
      const second = exec(compose, 1).args;
      const sessionId = first[first.indexOf("--session-id") + 1];
      expect(second[second.indexOf("--resume") + 1]).toBe(sessionId);
      expect(second).not.toContain("--session-id");
      expect(exec(compose, 1).options).toEqual({ input: "keep going" });
    });

    it("starts a new session when none was started", async () => {
      // Arrange
      const { executor, compose } = createExecutor();

      // Act
      await executor.continueSession("keep going");

      // Assert
      const { args } = exec(compose);
      expect(args).toContain("--session-id");
      expect(args).not.toContain("--resume");
    });

    it("gives each run its own session id", async () => {
      // Arrange
      const { executor, compose } = createExecutor();

      // Act
      await executor.run("one");
      await executor.run("two");

      // Assert
      const id = (call: number) => {
        const { args } = exec(compose, call);
        return args[args.indexOf("--session-id") + 1];
      };
      expect(id(0)).not.toBe(id(1));
    });
  });

  describe("killActive", () => {
    it("sends SIGTERM to the running CLI", async () => {
      // Arrange
      const process = fakeCliProcess("");
      const { executor } = createExecutor({ process: () => process });
      const running = executor.run("p");

      // Act
      executor.killActive();

      // Assert
      expect(process.kill).toHaveBeenCalledWith("SIGTERM");
      await running;
    });
  });
});
